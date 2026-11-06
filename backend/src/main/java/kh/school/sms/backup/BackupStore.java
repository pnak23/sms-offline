package kh.school.sms.backup;

import kh.school.sms.backup.BackupHistory.Item;
import kh.school.sms.bootstrap.StartupState;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The backups on disk and what is known about them: create, list, verify, copy-record, delete, rotate. The zip files are the
 * truth (manual ones in backups/, automatic ones in backups/auto/); {@link BackupHistory} adds facts. Plain Java so that the
 * pre-upgrade and pre-restore backups, which run before Spring has any beans, use exactly the code the backup page uses.
 */
public final class BackupStore {
    /** {@code SchoolBackup_YYYY-MM-DD_HH-mm-ss}: the id of a backup, and its file name without .zip. */
    public static final Pattern ID = Pattern.compile("^SchoolBackup_\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}$");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").withZone(ZoneId.systemDefault());
    private static final Duration AUTO_EVERY = Duration.ofHours(24);
    private static final long MARGIN = 64L << 20;
    private static final Set<String> CONTENT_FAILURES = Set.of("BACKUP_NOT_A_BACKUP", "BACKUP_CORRUPT", "BACKUP_CHECKSUM_MISMATCH", "BACKUP_DATABASE_DAMAGED", "BACKUP_SCHEMA_NEWER");

    private final Path root;
    private final Clock clock;
    private final BackupHistory history;

    public BackupStore(Path dataRoot, Clock clock) {
        this.root = dataRoot;
        this.clock = clock;
        this.history = new BackupHistory(dataRoot);
    }

    public BackupHistory history() { return history; }

    public Path root() { return root; }

    public Path dir(Kind kind) { return kind.automatic() ? root.resolve("backups").resolve("auto") : root.resolve("backups"); }

    public static String idOf(String fileName) { return fileName.endsWith(".zip") ? fileName.substring(0, fileName.length() - 4) : fileName; }

    private Instant now() { return Instant.now(clock).truncatedTo(ChronoUnit.SECONDS); }

    // ---- listing ------------------------------------------------------------------------------------------------

    /** Every backup file on disk, newest first, with what the history knows about it. */
    public synchronized List<Item> list() {
        List<Item> known = history.load().entries();
        List<Item> out = new ArrayList<>();
        for (Kind folder : new Kind[]{Kind.MANUAL, Kind.AUTO}) {
            Path dir = dir(folder);
            if (!Files.isDirectory(dir)) continue;
            try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "SchoolBackup_*.zip")) {
                for (Path p : s) {
                    String name = p.getFileName().toString();
                    if (!ID.matcher(idOf(name)).matches() || !Files.isRegularFile(p)) continue;
                    Item item = known.stream().filter(i -> i.fileName().equals(name)).findFirst().orElse(null);
                    out.add(item != null ? item : unknown(p, folder));
                }
            } catch (IOException e) {
                throw new BackupException("BACKUP_FOLDER_UNREADABLE", e);
            }
        }
        out.sort(Comparator.comparing(BackupStore::created).reversed().thenComparing(Item::fileName, Comparator.reverseOrder()));
        return out;
    }

    private static Item unknown(Path p, Kind folder) {
        try {
            return new Item(p.getFileName().toString(), folder.name(), Files.getLastModifiedTime(p).toInstant().truncatedTo(ChronoUnit.SECONDS).toString(),
                    Files.size(p), null, 0, null, null, null, null);
        } catch (IOException e) {
            throw new BackupException("BACKUP_FOLDER_UNREADABLE", e);
        }
    }

    static Instant created(Item i) {
        try {
            return Instant.parse(i.createdAt());
        } catch (RuntimeException e) {
            return Instant.EPOCH;
        }
    }

    public Optional<Item> find(String id) {
        if (id == null || !ID.matcher(id).matches()) return Optional.empty();
        return list().stream().filter(i -> idOf(i.fileName()).equals(id)).findFirst();
    }

    /** The file of a backup. {@code id} is checked against a fixed pattern, so no path can come from outside. */
    public Path locate(String id) {
        Item item = find(id).orElseThrow(() -> new BackupException("BACKUP_NOT_FOUND"));
        return dir(Kind.parse(item.kind(), Kind.MANUAL)).resolve(item.fileName());
    }

    /** The newest backup of any kind that was verified and has not been found damaged since. */
    public Optional<Item> lastVerified() { return lastVerified(list()); }

    private static Optional<Item> lastVerified(List<Item> all) {
        return all.stream().filter(i -> i.verifiedAt() != null).max(Comparator.comparing(BackupStore::created));
    }

    public Optional<Item> newest() { return list().stream().findFirst(); }

    /** The state of the backups kept on this laptop (the owner's policy of 2026-11-05: local backups are the primary method). */
    public enum LocalState { OK, OLD, NONE }

    /**
     * {@code OK}: the newest good backup is less than 24 hours old; {@code OLD}: it is 24 hours or more old; {@code NONE}: there is no good backup at all. "Good" means it was read back
     * whole and has not been found damaged since (a backup is read back before it gets its name), so a damaged file never counts as a backup.
     */
    public record LocalStatus(LocalState state, String lastGoodAt, Long ageHours) {}

    public LocalStatus localStatus() { return localStatus(list()); }

    public LocalStatus localStatus(List<Item> all) {
        return lastVerified(all).map(good -> {
            Duration age = Duration.between(created(good), Instant.now(clock));
            return new LocalStatus(age.compareTo(AUTO_EVERY) >= 0 ? LocalState.OLD : LocalState.OK, good.createdAt(), Math.max(0, age.toHours()));
        }).orElse(new LocalStatus(LocalState.NONE, null, null));
    }

    /** An automatic backup is due (when the program closes normally) when there is no good backup, or the newest good one, of any kind, is a day old. No timer ever asks. */
    public boolean autoDue() { return localStatus().state() != LocalState.OK; }

    /**
     * The nag about a copy somewhere ELSE (a USB stick): a backup on the same disk does not survive the disk. Counted from the last
     * such copy, or from when the history began if there never was one. {@code overdue} is only true once more than {@code limitDays} passed; {@code limitDays} 0 means the reminder
     * is OFF (the owner's policy of 2026-11-05: a copy on a USB stick is optional), and then nothing is ever overdue.
     */
    public record Reminder(boolean anyBackup, boolean overdue, boolean never, long days, int reminderDays) {}

    public static Reminder reminder(List<Item> all, BackupHistory.Data h, Instant now, int limitDays) {
        if (all.isEmpty()) return new Reminder(false, false, h.lastExternalCopyAt() == null, 0, limitDays);
        String anchor = h.lastExternalCopyAt() != null ? h.lastExternalCopyAt() : h.since();
        long days = anchor == null ? 0 : Duration.between(Instant.parse(anchor), now).toDays();
        return new Reminder(true, limitDays > 0 && anchor != null && days > limitDays, h.lastExternalCopyAt() == null, days, limitDays);
    }

    // ---- space --------------------------------------------------------------------------------------------------

    /** A cautious estimate of the room one backup needs: the snapshot, the zip, and the photos once more. */
    public long requiredBytes() {
        long db = size(root.resolve("database").resolve("school.db")) + size(root.resolve("database").resolve("school.db-wal"));
        long photos = folderBytes(root.resolve("uploads").resolve("students")) + folderBytes(root.resolve("uploads").resolve("school"));
        return 2 * db + photos + MARGIN;
    }

    public long freeBytes() {
        try {
            Path dir = dir(Kind.MANUAL);
            Files.createDirectories(dir);
            return Files.getFileStore(dir).getUsableSpace();
        } catch (IOException e) {
            return Long.MAX_VALUE;   // unknown: do not block a backup on a guess
        }
    }

    private static long size(Path p) {
        try {
            return Files.isRegularFile(p) ? Files.size(p) : 0;
        } catch (IOException e) {
            return 0;
        }
    }

    private static long folderBytes(Path dir) {
        long sum = 0;
        if (!Files.isDirectory(dir)) return 0;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
            for (Path p : s) sum += size(p);
        } catch (IOException ignored) {
            // an estimate
        }
        return sum;
    }

    // ---- create / verify / copy / delete ----------------------------------------------------------------------------

    /** Makes, verifies and records a backup, then rotates the automatic ones. The caller supplies the live database connection. */
    public synchronized Item create(java.sql.Connection db, Kind kind) {
        if (freeBytes() < requiredBytes()) throw new BackupException("BACKUP_DISK_SPACE_LOW");
        Instant at = now();
        try {
            Files.createDirectories(dir(kind));
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
        String id = uniqueId(at);
        BackupArchive.Created c = BackupArchive.create(db, root, dir(kind).resolve(id + ".zip"), kind, at, StartupState.APP_VERSION);
        BackupArchive.Manifest m = c.summary().manifest();
        Item item = new Item(id + ".zip", kind.name(), m.createdAt(), c.sizeBytes(), c.sha256(), m.schemaVersion(), m.appVersion(), at.toString(), null, null);
        persist(item);
        rotate();
        return item;
    }

    private String uniqueId(Instant at) {
        Instant t = at;
        while (true) {
            String id = "SchoolBackup_" + STAMP.format(t);
            boolean taken = false;
            for (Kind k : new Kind[]{Kind.MANUAL, Kind.AUTO}) {
                taken |= Files.exists(dir(k).resolve(id + ".zip")) || Files.exists(dir(k).resolve(id + ".zip.part"));
            }
            if (!taken) return id;
            t = t.plusSeconds(1);   // two backups in the same second (a restore right after a backup)
        }
    }

    /**
     * Re-reads a backup from the start. A backup found damaged is not thrown away: it stays listed with {@code verifyError}, so
     * the user sees it and can decide; only a verified one counts as "the last good backup".
     */
    public synchronized Item verify(String id) {
        Path file = locate(id);
        Item cur = find(id).orElseThrow(() -> new BackupException("BACKUP_NOT_FOUND"));
        Path work = null;
        try {
            Path tmp = root.resolve("backups").resolve("tmp");
            Files.createDirectories(tmp);
            work = Files.createTempDirectory(tmp, "verify-");
            String sha = BackupArchive.sha256(file);
            if (cur.sha256() != null && !cur.sha256().equals(sha)) throw new BackupException("BACKUP_CHECKSUM_MISMATCH");   // the file changed since it was made
            BackupArchive.Summary s = BackupArchive.verify(file, work, false);
            Item ok = new Item(cur.fileName(), Kind.parse(cur.kind(), Kind.parse(s.manifest().kind(), Kind.MANUAL)).name(), s.manifest().createdAt(),
                    Files.size(file), sha, s.manifest().schemaVersion(), s.manifest().appVersion(), now().toString(), null, cur.externalCopyAt());
            persist(ok);
            return ok;
        } catch (BackupException e) {
            if (!CONTENT_FAILURES.contains(e.code())) throw e;
            Item bad = cur.failed(e.code());
            persist(bad);
            return bad;
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        } finally {
            if (work != null) BackupArchive.deleteTree(work);
        }
    }

    /** Records that a copy of this backup was made elsewhere (a USB stick); {@code copySha256} is the hash of that copy. */
    public synchronized Item recordExternalCopy(String id, String copySha256) {
        Path file = locate(id);
        Item cur = find(id).orElseThrow(() -> new BackupException("BACKUP_NOT_FOUND"));
        try {
            String sha = cur.sha256() != null ? cur.sha256() : BackupArchive.sha256(file);
            if (copySha256 == null || !sha.equals(copySha256)) throw new BackupException("BACKUP_COPY_MISMATCH");
            String at = now().toString();
            Item copied = new Item(cur.fileName(), cur.kind(), cur.createdAt(), cur.sizeBytes(), sha, cur.schemaVersion(), cur.appVersion(),
                    cur.verifiedAt(), cur.verifyError(), at);
            persist(copied);
            history.update(at, d -> new BackupHistory.Data(1, d.since(), d.entries(), at, d.lastRestore()));
            return copied;
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
    }

    /** The last verified backup can never be deleted: there must always be one good file to go back to. */
    public synchronized void delete(String id) {
        Path file = locate(id);
        Item cur = find(id).orElseThrow(() -> new BackupException("BACKUP_NOT_FOUND"));
        if (lastVerified().map(i -> i.fileName().equals(cur.fileName())).orElse(false)) throw new BackupException("BACKUP_LAST_VERIFIED");
        try {
            Files.delete(file);
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
        prune();
    }

    /** Keeps the newest few of each automatic kind (never the last verified backup, never a file this program did not make). */
    public synchronized int rotate() {
        List<Item> all = list();
        Set<String> madeHere = new HashSet<>();
        history.load().entries().forEach(i -> madeHere.add(i.fileName()));
        String guard = lastVerified(all).map(Item::fileName).orElse(null);
        int removed = 0;
        for (Kind k : Kind.values()) {
            if (!k.automatic()) continue;
            List<Item> mine = all.stream().filter(i -> Kind.parse(i.kind(), Kind.MANUAL) == k).toList();   // already newest first
            for (int i = k.keep(); i < mine.size(); i++) {
                Item old = mine.get(i);
                if (old.fileName().equals(guard) || !madeHere.contains(old.fileName())) continue;
                try {
                    Files.deleteIfExists(dir(k).resolve(old.fileName()));
                    removed++;
                } catch (IOException ignored) {
                    // a file in use stays until the next rotation
                }
            }
        }
        if (removed > 0) prune();
        return removed;
    }

    // ---- history upkeep ---------------------------------------------------------------------------------------

    private void persist(Item item) {
        history.update(now().toString(), d -> {
            List<Item> next = new ArrayList<>(d.entries().stream().filter(i -> !i.fileName().equals(item.fileName()) && onDisk(i)).toList());
            next.add(item);
            return new BackupHistory.Data(1, d.since(), next, d.lastExternalCopyAt(), d.lastRestore());
        });
    }

    private void prune() {
        history.update(now().toString(), d -> new BackupHistory.Data(1, d.since(), d.entries().stream().filter(this::onDisk).toList(), d.lastExternalCopyAt(), d.lastRestore()));
    }

    private boolean onDisk(Item i) {
        return Files.isRegularFile(dir(Kind.parse(i.kind(), Kind.MANUAL)).resolve(i.fileName()));
    }

    // ---- housekeeping -------------------------------------------------------------------------------------------

    /** Removes what a killed backup left behind: temp folders and half-written .part files, and incoming files older than a day. */
    public static void cleanLeftovers(Path dataRoot) {
        Path backups = dataRoot.resolve("backups");
        BackupArchive.deleteTree(backups.resolve("tmp"));
        for (Path dir : new Path[]{backups, backups.resolve("auto")}) {
            if (!Files.isDirectory(dir)) continue;
            try (DirectoryStream<Path> s = Files.newDirectoryStream(dir, "*.part")) {
                for (Path p : s) BackupArchive.deleteQuietly(p);
            } catch (IOException ignored) {
                // best effort
            }
        }
        Path incoming = backups.resolve("incoming");
        if (!Files.isDirectory(incoming)) return;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(incoming)) {
            for (Path p : s) {
                if (Files.isRegularFile(p) && Files.getLastModifiedTime(p).toInstant().isBefore(Instant.now().minus(Duration.ofDays(1)))) BackupArchive.deleteQuietly(p);
            }
        } catch (IOException ignored) {
            // best effort
        }
    }
}
