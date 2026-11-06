package kh.school.sms.backup;

import kh.school.sms.backup.BackupHistory.Restore;
import kh.school.sms.bootstrap.DataDirs;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.FileAlreadyExistsException;
import java.nio.file.FileSystemException;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

/**
 * Applies a confirmed restore BEFORE the database is opened (called from {@code main}, ahead of Spring), so a database file is
 * never replaced under a live connection pool.
 *
 * <p>Order: prove the staged files are intact, make a safety backup of the data about to be replaced, move the current files
 * into {@code restore-pending/previous/}, move the staged files into place, clean up. A journal file records how far it got.
 * Whatever kills the process in between (power cut, a file locked by antivirus), the next start reads the journal and either
 * finishes the clean-up or puts the original files back: the school never ends up with half of each.
 *
 * <p>The safety backup is skipped only when there is nothing to protect (no administrator yet). When the current database is so
 * damaged that it cannot be backed up (often the very reason for restoring), its files are kept in {@code backups/replaced_*}
 * instead of being deleted.
 */
public final class RestoreBootstrap {
    /** Test seam: called after every file move. A test throws an {@link Error} from it to simulate the power going out. */
    interface Hook { void after(String step); }

    private record Journal(String state, String safetyBackup, boolean keepPrevious, String replacedFolder, String backupCreatedAt) {
        Journal with(String next) { return new Journal(next, safetyBackup, keepPrevious, replacedFolder, backupCreatedAt); }
    }

    private static final String JOURNAL = "journal.json";
    private static final String[] UPLOAD_DIRS = {"uploads/students", "uploads/school"};
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").withZone(ZoneId.systemDefault());
    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private RestoreBootstrap() {}

    /** Called once from {@code main}, after the data folder exists and before Spring. */
    public static void applyIfPending() { apply(DataDirs.root(), Clock.systemUTC(), step -> { }); }

    static void apply(Path root, Clock clock, Hook hook) {
        Path pending = RestoreStaging.dir(root);
        if (!Files.isDirectory(pending)) return;
        BackupHistory history = new BackupHistory(root);
        if (Files.exists(pending.resolve(JOURNAL))) recover(root, pending, history, clock, "RESTORE_INTERRUPTED", hook);   // an earlier run died half way

        Optional<RestoreStaging.Meta> meta = RestoreStaging.read(root);
        if (meta.isEmpty() || !RestoreStaging.CONFIRMED.equals(meta.get().state())) return;   // staged but never confirmed: nothing to do
        BackupArchive.Summary summary = meta.get().summary();
        String created = summary.manifest().createdAt();

        try {
            BackupArchive.verifyExtracted(pending, summary.manifest());
        } catch (BackupException e) {
            record(history, clock, new Restore(false, Instant.now(clock).toString(), e.code(), created, null, null, false));
            RestoreStaging.discard(root);
            return;
        }

        String safety = null;
        boolean keepPrevious = false;
        Path db = root.resolve("database").resolve("school.db");
        if (Files.isRegularFile(db) && hasData(db)) {
            try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + BackupArchive.sqlPath(db))) {
                safety = new BackupStore(root, clock).create(c, Kind.PRE_RESTORE).fileName();
            } catch (BackupException | SQLException e) {
                keepPrevious = true;   // cannot be backed up: keep its files rather than delete them
            }
        }
        Journal start = new Journal("START", safety, keepPrevious, keepPrevious ? uniqueReplacedName(root, clock) : null, created);
        try {
            swap(root, pending, start, hook);
            finish(root, pending, history, clock, start.with("DONE"), hook);
        } catch (IOException | RuntimeException e) {
            recover(root, pending, history, clock, "RESTORE_SWAP_FAILED", hook);   // put the original files back and carry on with them
        }
    }

    // ---- the swap -----------------------------------------------------------------------------------------------

    private static void swap(Path root, Path pending, Journal start, Hook hook) throws IOException {
        Path previous = pending.resolve("previous");
        writeJournal(pending, start);
        for (Path rel : liveFiles(root)) {
            move(root.resolve(rel), previous.resolve(rel));
            hook.after("current");
        }
        writeJournal(pending, start.with("CURRENT_MOVED"));
        hook.after("current-moved");
        for (String sub : UPLOAD_DIRS) {
            Path from = pending.resolve(sub);
            if (!Files.isDirectory(from)) continue;
            for (Path f : files(from)) {
                move(f, root.resolve(sub).resolve(f.getFileName()));
                hook.after("staged");
            }
        }
        move(pending.resolve(BackupArchive.DB_ENTRY), root.resolve("database").resolve("school.db"));
        hook.after("staged");
        writeJournal(pending, start.with("DONE"));
    }

    /** What makes up the school's data now: the database file with its WAL / SHM / journal, the photos and the logo (relative to the data folder). */
    private static List<Path> liveFiles(Path root) throws IOException {
        List<Path> out = new ArrayList<>();
        Path dbDir = root.resolve("database");
        if (Files.isDirectory(dbDir)) {
            try (DirectoryStream<Path> s = Files.newDirectoryStream(dbDir, "school.db*")) {
                for (Path p : s) if (Files.isRegularFile(p)) out.add(root.relativize(p));
            }
        }
        for (String sub : UPLOAD_DIRS) {
            Path d = root.resolve(sub);
            if (Files.isDirectory(d)) for (Path p : files(d)) out.add(root.relativize(p));
        }
        return out;
    }

    private static List<Path> files(Path dir) throws IOException {
        List<Path> out = new ArrayList<>();
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
            for (Path p : s) if (Files.isRegularFile(p)) out.add(p);
        }
        return out;
    }

    /** Moves one file, retrying a few times when something (antivirus, the search indexer) holds it for a moment. */
    private static void move(Path from, Path to) throws IOException {
        Files.createDirectories(to.getParent());
        for (int attempt = 1; ; attempt++) {
            try {
                Files.move(from, to);
                return;
            } catch (FileAlreadyExistsException | NoSuchFileException e) {
                throw e;
            } catch (FileSystemException e) {
                if (attempt >= 5) throw e;
                try {
                    Thread.sleep(300);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        }
    }

    // ---- recovery -----------------------------------------------------------------------------------------------

    /**
     * Brings the data folder back to a whole state after a swap that did not finish. DONE: only the clean-up is left. Anything
     * earlier: the original files go back (files that already came from the backup are removed first, but only while no file
     * has been put back yet, which the ROLLING_BACK state records) and the staged backup is dropped, because moved files left
     * it incomplete; the user chooses the backup again.
     */
    static void recover(Path root, Path pending, BackupHistory history, Clock clock, String reason, Hook hook) {
        Journal j = readJournal(pending);
        try {
            if ("DONE".equals(j.state())) {
                finish(root, pending, history, clock, j, hook);
                return;
            }
            if ("CURRENT_MOVED".equals(j.state())) {
                for (Path rel : liveFiles(root)) Files.deleteIfExists(root.resolve(rel));   // everything live now came from the backup
            }
            if (!"ROLLING_BACK".equals(j.state())) writeJournal(pending, j.with("ROLLING_BACK"));
            Path previous = pending.resolve("previous");
            if (Files.isDirectory(previous)) {
                for (Path f : walkFiles(previous)) {
                    Path back = root.resolve(previous.relativize(f));
                    if (!Files.exists(back)) {
                        move(f, back);
                        hook.after("back");
                    }
                }
            }
            record(history, clock, new Restore(false, Instant.now(clock).toString(), reason, j.backupCreatedAt(), j.safetyBackup(), null, false));
            RestoreStaging.discard(root);
        } catch (IOException | RuntimeException e) {
            throw new BackupException("RESTORE_ROLLBACK_FAILED", e);
        }
    }

    private static void finish(Path root, Path pending, BackupHistory history, Clock clock, Journal j, Hook hook) throws IOException {
        Path previous = pending.resolve("previous");
        if (Files.isDirectory(previous)) {
            if (j.keepPrevious() && j.replacedFolder() != null) Files.move(previous, root.resolve("backups").resolve(j.replacedFolder()));
            else BackupArchive.deleteTree(previous);
        }
        record(history, clock, new Restore(true, Instant.now(clock).toString(), null, j.backupCreatedAt(), j.safetyBackup(),
                j.keepPrevious() ? j.replacedFolder() : null, false));
        hook.after("finish");
        // the journal goes last: while it exists, a restart runs this clean-up again
        try (DirectoryStream<Path> s = Files.newDirectoryStream(pending)) {
            for (Path p : s) if (!p.getFileName().toString().equals(JOURNAL)) BackupArchive.deleteTree(p);
        }
        Files.deleteIfExists(pending.resolve(JOURNAL));
        Files.deleteIfExists(pending);
    }

    private static List<Path> walkFiles(Path dir) throws IOException {
        try (Stream<Path> s = Files.walk(dir)) {
            return s.filter(Files::isRegularFile).toList();
        }
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    private static boolean hasData(Path db) {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + BackupArchive.sqlPath(db));
             Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT count(*) FROM app_users")) {
            return rs.next() && rs.getInt(1) > 0;
        } catch (SQLException e) {
            return true;   // cannot tell: assume it matters
        }
    }

    private static String uniqueReplacedName(Path root, Clock clock) {
        String base = "replaced_" + STAMP.format(Instant.now(clock));
        String name = base;
        for (int i = 2; Files.exists(root.resolve("backups").resolve(name)); i++) name = base + "_" + i;
        return name;
    }

    private static void record(BackupHistory history, Clock clock, Restore restore) {
        history.update(Instant.now(clock).toString(), d -> new BackupHistory.Data(1, d.since(), d.entries(), d.lastExternalCopyAt(), restore));
    }

    private static Journal readJournal(Path pending) {
        try {
            Journal j = JSON.readValue(Files.readString(pending.resolve(JOURNAL), StandardCharsets.UTF_8), Journal.class);
            if (j != null && j.state() != null) return j;
        } catch (IOException | RuntimeException e) {
            // unreadable or missing: handled as "just started"
        }
        return new Journal("START", null, true, null, null);
    }

    private static void writeJournal(Path pending, Journal j) throws IOException {
        Path f = pending.resolve(JOURNAL);
        Path tmp = pending.resolve(JOURNAL + ".tmp");
        Files.writeString(tmp, JSON.writeValueAsString(j), StandardCharsets.UTF_8);
        try {
            Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING);
        }
    }
}
