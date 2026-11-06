package kh.school.sms.backup;

import kh.school.sms.bootstrap.ProductInfo;
import org.sqlite.SQLiteConfig;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * The backup file: a zip holding {@code school.db} (a consistent snapshot made with VACUUM INTO, never a raw copy of a live
 * WAL database), the uploaded photos and logo, and {@code manifest.json} with the SHA-256 of every other entry.
 *
 * <p>Everything that reads a zip is defensive, because a zip may come from a USB stick: entry names are checked against a
 * fixed pattern (no path can escape the folder it is extracted to), sizes are bounded while streaming (a zip bomb stops at
 * the size the manifest declares), every hash is compared, and the database inside is opened read-only and checked.
 * Plain Java with no Spring beans: the restore runs before Spring starts.
 */
public final class BackupArchive {
    public static final int FORMAT = 1;
    public static final String APP_ID = "sms-offline";
    public static final String MANIFEST = "manifest.json";
    public static final String DB_ENTRY = "school.db";

    private static final Pattern UPLOAD = Pattern.compile("^uploads/(students|school)/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$");
    private static final Pattern FILE_NAME = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    private static final int MAX_ENTRIES = 50_000;
    private static final long MAX_ENTRY_BYTES = 4L << 30;
    private static final long MAX_TOTAL_BYTES = 16L << 30;
    private static final int MAX_MANIFEST_BYTES = 8 << 20;
    private static final long SPACE_MARGIN = 64L << 20;

    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private BackupArchive() {}

    public record Entry(String path, long size, String sha256) {}

    /** {@code product} and {@code channel} (which program, which release channel) were added after format 1 shipped: optional, so older backups and older programs keep working. */
    public record Manifest(int format, String app, String createdAt, String appVersion, int schemaVersion, String kind, List<Entry> files, String product, String channel) {}

    /** What a backup holds, for the "is this the right one?" question. A count is -1 when the table does not exist at that schema. */
    public record Summary(Manifest manifest, int students, int teachers, int classes, int photos, long totalBytes) {}

    public record Created(Path file, long sizeBytes, String sha256, Summary summary) {}

    // ---- create -------------------------------------------------------------------------------------------------

    /**
     * Writes {@code target}: snapshot, zip, manifest, then reads it all back (hashes, integrity check) before the file
     * gets its final name. A half-written or unverifiable file therefore never appears under that name.
     *
     * @param db an open connection to the live database in auto-commit mode (VACUUM cannot run inside a transaction)
     */
    public static Created create(Connection db, Path dataRoot, Path target, Kind kind, Instant now, String appVersion) {
        Path tmpRoot = dataRoot.resolve("backups").resolve("tmp");
        Path part = target.resolveSibling(target.getFileName() + ".part");
        Path work = null;
        try {
            Files.createDirectories(tmpRoot);
            work = Files.createTempDirectory(tmpRoot, "backup-");
            Path snapshot = work.resolve(DB_ENTRY);
            try (Statement st = db.createStatement()) {
                st.execute("VACUUM INTO '" + sqlPath(snapshot) + "'");
            }
            int schema = SchemaVersions.of(db);

            List<Entry> entries = new ArrayList<>();
            try (OutputStream os = Files.newOutputStream(part, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                 ZipOutputStream zip = new ZipOutputStream(os)) {
                zip.setLevel(6);
                entries.add(writeEntry(zip, DB_ENTRY, snapshot));
                for (String sub : new String[]{"students", "school"}) {
                    for (Path p : uploads(dataRoot.resolve("uploads").resolve(sub))) {
                        Entry e = writeEntryIfPresent(zip, "uploads/" + sub + "/" + p.getFileName(), p);
                        if (e != null) entries.add(e);
                    }
                }
                Manifest m = new Manifest(FORMAT, APP_ID, now.toString(), appVersion, schema, kind.name(), entries, ProductInfo.get().shortName(), ProductInfo.get().channel());
                zip.putNextEntry(new ZipEntry(MANIFEST));
                zip.write(JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(m));
                zip.closeEntry();
            }
            Summary summary = verify(part, work.resolve("check"), false);   // read it back as a stranger would
            String hash = sha256(part);
            try {
                Files.move(part, target, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(part, target);
            }
            return new Created(target, Files.size(target), hash, summary);
        } catch (BackupException e) {
            deleteQuietly(part);
            throw e;
        } catch (IOException | SQLException | RuntimeException e) {
            deleteQuietly(part);
            throw new BackupException("BACKUP_FAILED", e);
        } finally {
            if (work != null) deleteTree(work);
        }
    }

    private static List<Path> uploads(Path dir) throws IOException {
        List<Path> out = new ArrayList<>();
        if (!Files.isDirectory(dir)) return out;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
            for (Path p : s) if (Files.isRegularFile(p) && FILE_NAME.matcher(p.getFileName().toString()).matches()) out.add(p);
        }
        out.sort(Comparator.comparing(p -> p.getFileName().toString()));
        return out;
    }

    private static Entry writeEntryIfPresent(ZipOutputStream zip, String name, Path file) throws IOException {
        try {
            return writeEntry(zip, name, file);
        } catch (java.nio.file.NoSuchFileException e) {
            return null;   // removed while the backup ran (a photo that was just replaced); the snapshot no longer needs it
        }
    }

    private static Entry writeEntry(ZipOutputStream zip, String name, Path file) throws IOException {
        MessageDigest md = digest();
        long size = 0;
        try (InputStream in = Files.newInputStream(file)) {
            zip.putNextEntry(new ZipEntry(name));
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                md.update(buf, 0, n);
                zip.write(buf, 0, n);
                size += n;
            }
            zip.closeEntry();
        }
        return new Entry(name, size, hex(md.digest()));
    }

    // ---- verify (and optionally extract) --------------------------------------------------------------------------

    /**
     * Proves a backup is whole: a readable zip of exactly the entries its manifest lists, every hash right, the database
     * inside sound and not newer than this program. {@code school.db} is extracted into {@code extractDir} (the caller
     * deletes it); {@code extractUploads} extracts the photos and the logo as well, which is what staging a restore does.
     */
    public static Summary verify(Path zip, Path extractDir, boolean extractUploads) {
        if (!Files.isRegularFile(zip)) throw new BackupException("BACKUP_NOT_A_BACKUP");
        try (ZipFile z = new ZipFile(zip.toFile())) {
            Set<String> names = entryNames(z);
            Manifest m = readManifest(z);
            checkManifest(m, names);
            long total = m.files().stream().mapToLong(Entry::size).sum();
            Files.createDirectories(extractDir);
            if (Files.getFileStore(extractDir).getUsableSpace() < total + SPACE_MARGIN) throw new BackupException("BACKUP_DISK_SPACE_LOW");

            int photos = 0;
            for (Entry e : m.files()) {
                boolean db = e.path().equals(DB_ENTRY);
                if (e.path().startsWith("uploads/students/")) photos++;
                streamEntry(z, e, db || extractUploads ? target(extractDir, e.path()) : null);
            }
            DbFacts facts = checkDatabase(extractDir.resolve(DB_ENTRY));
            if (facts.schema() != m.schemaVersion()) throw new BackupException("BACKUP_NOT_A_BACKUP");
            removeSqliteSidecars(extractDir.resolve(DB_ENTRY));
            return new Summary(m, facts.students(), facts.teachers(), facts.classes(), photos, total);
        } catch (IOException e) {   // includes ZipException: a truncated or damaged zip
            throw new BackupException("BACKUP_CORRUPT", e);
        }
    }

    /** The files a staged restore holds (extracted by {@link #verify}) are still exactly what the manifest says. */
    public static void verifyExtracted(Path dir, Manifest m) {
        Set<String> expected = new HashSet<>();
        try {
            for (Entry e : m.files()) {
                expected.add(e.path());
                Path f = target(dir, e.path());
                if (!Files.isRegularFile(f)) throw new BackupException("BACKUP_CHECKSUM_MISMATCH");
                MessageDigest md = digest();
                long n = 0;
                try (InputStream in = Files.newInputStream(f)) {
                    byte[] buf = new byte[64 * 1024];
                    int r;
                    while ((r = in.read(buf)) > 0) { md.update(buf, 0, r); n += r; }
                }
                if (n != e.size() || !hex(md.digest()).equals(e.sha256())) throw new BackupException("BACKUP_CHECKSUM_MISMATCH");
            }
            for (String sub : new String[]{"students", "school"}) {
                Path d = dir.resolve("uploads").resolve(sub);
                if (!Files.isDirectory(d)) continue;
                try (DirectoryStream<Path> s = Files.newDirectoryStream(d)) {
                    for (Path p : s) if (!expected.contains("uploads/" + sub + "/" + p.getFileName())) throw new BackupException("BACKUP_NOT_A_BACKUP");
                }
            }
            DbFacts facts = checkDatabase(dir.resolve(DB_ENTRY));
            if (facts.schema() != m.schemaVersion()) throw new BackupException("BACKUP_NOT_A_BACKUP");
            removeSqliteSidecars(dir.resolve(DB_ENTRY));
        } catch (IOException e) {
            throw new BackupException("BACKUP_CORRUPT", e);
        }
    }

    private static Set<String> entryNames(ZipFile z) {
        Set<String> names = new LinkedHashSet<>();
        var en = z.entries();
        while (en.hasMoreElements()) {
            ZipEntry e = en.nextElement();
            String n = e.getName();
            boolean ok = !e.isDirectory() && names.size() < MAX_ENTRIES
                    && (n.equals(MANIFEST) || n.equals(DB_ENTRY) || UPLOAD.matcher(n).matches());
            if (!ok || !names.add(n)) throw new BackupException("BACKUP_NOT_A_BACKUP");   // a stray, repeated or path-like entry
        }
        return names;
    }

    private static Manifest readManifest(ZipFile z) throws IOException {
        ZipEntry me = z.getEntry(MANIFEST);
        if (me == null) throw new BackupException("BACKUP_NOT_A_BACKUP");
        if (me.getSize() < 0 || me.getSize() > MAX_MANIFEST_BYTES) throw new BackupException("BACKUP_NOT_A_BACKUP");
        try (InputStream in = z.getInputStream(me)) {
            byte[] bytes = in.readNBytes(MAX_MANIFEST_BYTES + 1);
            if (bytes.length > MAX_MANIFEST_BYTES) throw new BackupException("BACKUP_NOT_A_BACKUP");
            return JSON.readValue(new String(bytes, StandardCharsets.UTF_8), Manifest.class);
        } catch (BackupException e) {
            throw e;
        } catch (RuntimeException e) {   // tools.jackson's exceptions are unchecked
            throw new BackupException("BACKUP_NOT_A_BACKUP", e);
        }
    }

    private static void checkManifest(Manifest m, Set<String> names) {
        if (m == null || m.format() != FORMAT || !APP_ID.equals(m.app()) || m.files() == null || m.createdAt() == null || m.schemaVersion() < 1) {
            throw new BackupException("BACKUP_NOT_A_BACKUP");
        }
        try {
            Instant.parse(m.createdAt());
        } catch (RuntimeException e) {
            throw new BackupException("BACKUP_NOT_A_BACKUP", e);
        }
        Set<String> listed = new HashSet<>();
        long total = 0;
        for (Entry e : m.files()) {
            if (e == null || e.path() == null || e.sha256() == null || !SHA256.matcher(e.sha256()).matches()
                    || e.size() < 0 || e.size() > MAX_ENTRY_BYTES || !listed.add(e.path())) throw new BackupException("BACKUP_NOT_A_BACKUP");
            total += e.size();
            if (total > MAX_TOTAL_BYTES) throw new BackupException("BACKUP_NOT_A_BACKUP");
        }
        Set<String> inZip = new HashSet<>(names);
        inZip.remove(MANIFEST);
        if (!listed.equals(inZip) || !listed.contains(DB_ENTRY)) throw new BackupException("BACKUP_NOT_A_BACKUP");   // exactly what the manifest lists
    }

    private static void streamEntry(ZipFile z, Entry e, Path out) throws IOException {
        ZipEntry ze = z.getEntry(e.path());
        if (ze == null) throw new BackupException("BACKUP_NOT_A_BACKUP");
        MessageDigest md = digest();
        long n = 0;
        try (InputStream in = z.getInputStream(ze);
             OutputStream os = out == null ? OutputStream.nullOutputStream() : Files.newOutputStream(out, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
            byte[] buf = new byte[64 * 1024];
            int r;
            while ((r = in.read(buf)) > 0) {
                n += r;
                if (n > e.size()) throw new BackupException("BACKUP_CHECKSUM_MISMATCH");   // bigger than declared: stop reading, whatever the zip says
                md.update(buf, 0, r);
                os.write(buf, 0, r);
            }
        }
        if (n != e.size() || !hex(md.digest()).equals(e.sha256())) throw new BackupException("BACKUP_CHECKSUM_MISMATCH");
    }

    /** {@code dir/path}, refusing anything that would land outside {@code dir}. */
    private static Path target(Path dir, String entryPath) throws IOException {
        Path root = dir.toAbsolutePath().normalize();
        Path p = root.resolve(entryPath).normalize();
        if (!p.startsWith(root) || p.equals(root)) throw new BackupException("BACKUP_NOT_A_BACKUP");
        Files.createDirectories(p.getParent());
        return p;
    }

    // ---- the database inside -------------------------------------------------------------------------------------

    private record DbFacts(int schema, int students, int teachers, int classes) {}

    /** Opens the extracted database read-only: header, integrity_check, foreign_key_check, schema version (not newer than this program). */
    private static DbFacts checkDatabase(Path db) {
        try (InputStream in = Files.newInputStream(db)) {
            byte[] head = in.readNBytes(16);
            if (!new String(head, StandardCharsets.ISO_8859_1).equals("SQLite format 3\0")) throw new BackupException("BACKUP_DATABASE_DAMAGED");
        } catch (IOException e) {
            throw new BackupException("BACKUP_DATABASE_DAMAGED", e);
        }
        SQLiteConfig cfg = new SQLiteConfig();
        cfg.setReadOnly(true);
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + sqlPath(db), cfg.toProperties()); Statement st = c.createStatement()) {
            List<String> problems = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("PRAGMA integrity_check")) {
                while (rs.next() && problems.size() < 5) problems.add(rs.getString(1));
            }
            if (problems.size() != 1 || !"ok".equalsIgnoreCase(problems.get(0))) throw new BackupException("BACKUP_DATABASE_DAMAGED");
            try (ResultSet rs = st.executeQuery("PRAGMA foreign_key_check")) {
                if (rs.next()) throw new BackupException("BACKUP_DATABASE_DAMAGED");
            }
            int schema;
            try {
                schema = SchemaVersions.of(c);
            } catch (SQLException e) {
                throw new BackupException("BACKUP_NOT_A_BACKUP", e);   // a database that is not ours has no migration history
            }
            if (schema > SchemaVersions.latestKnown()) throw new BackupException("BACKUP_SCHEMA_NEWER");
            return new DbFacts(schema, count(c, "students"), count(c, "teachers"), count(c, "classes"));
        } catch (SQLException e) {
            throw new BackupException("BACKUP_DATABASE_DAMAGED", e);
        }
    }

    private static int count(Connection c, String table) throws SQLException {
        try (Statement st = c.createStatement()) {
            try (ResultSet rs = st.executeQuery("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
                if (!rs.next()) return -1;
            }
            try (ResultSet rs = st.executeQuery("SELECT count(*) FROM " + table)) {
                return rs.next() ? rs.getInt(1) : -1;
            }
        }
    }

    /** Opening a database can leave -wal / -shm / -journal files next to it; they would be mistaken for content. */
    private static void removeSqliteSidecars(Path db) {
        for (String suffix : new String[]{"-wal", "-shm", "-journal"}) deleteQuietly(db.resolveSibling(db.getFileName() + suffix));
    }

    // ---- small helpers (shared with the store and the restore) ---------------------------------------------------

    /** A path as SQLite wants it inside a string literal or a JDBC URL: forward slashes, quotes doubled. */
    static String sqlPath(Path p) { return p.toAbsolutePath().normalize().toString().replace('\\', '/').replace("'", "''"); }

    static MessageDigest digest() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(Character.forDigit((b >> 4) & 15, 16)).append(Character.forDigit(b & 15, 16));
        return sb.toString();
    }

    public static String sha256(Path file) throws IOException {
        MessageDigest md = digest();
        try (InputStream in = Files.newInputStream(file)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    static void deleteQuietly(Path p) {
        try {
            Files.deleteIfExists(p);
        } catch (IOException ignored) {
            // a leftover is swept at the next start
        }
    }

    static void deleteTree(Path root) {
        if (!Files.exists(root)) return;
        try (Stream<Path> s = Files.walk(root)) {
            s.sorted(Comparator.reverseOrder()).forEach(BackupArchive::deleteQuietly);
        } catch (IOException ignored) {
            // a leftover is swept at the next start
        }
    }
}
