package kh.school.sms.backup;

import kh.school.sms.MutableClock;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

/**
 * A data folder like the application's, built by hand: a real WAL-mode SQLite database with the tables a backup reads, photos
 * and a logo. The folder's name has Khmer characters and a space on purpose. No Spring and no {@code DataDirs}: that class
 * sets a JVM-wide property the long scenario test relies on.
 */
public final class BackupFixture implements AutoCloseable {
    static final JsonMapper JSON = JsonMapper.builder().build();

    /** What the school "has": student names and the photo files with their hashes. */
    record State(List<String> students, Map<String, String> photos) {}

    final Path root;
    final MutableClock clock = new MutableClock();
    private Connection live;
    private int generation;

    BackupFixture() throws IOException {
        root = Files.createTempDirectory("sms ទិន្នន័យ ");
        for (String d : new String[]{"database", "backups", "backups/auto", "backups/incoming", "uploads/students", "uploads/school", "config", "logs"}) {
            Files.createDirectories(root.resolve(d));
        }
    }

    Path db() { return root.resolve("database").resolve("school.db"); }

    Path zipFor(Kind kind, String fileName) { return root.resolve("backups").resolve(kind.automatic() ? "auto" : "").resolve(fileName); }

    BackupStore store() { return new BackupStore(root, clock); }

    /** The live connection the application would hold: WAL mode, auto-commit. */
    Connection live() throws SQLException {
        if (live == null || live.isClosed()) {
            live = DriverManager.getConnection("jdbc:sqlite:" + db().toAbsolutePath().toString().replace('\\', '/'));
            try (Statement st = live.createStatement()) { st.execute("PRAGMA journal_mode=WAL"); }
        }
        return live;
    }

    void closeLive() throws SQLException {
        if (live != null) live.close();
        live = null;
    }

    /**
     * Makes the school "look like" generation {@code tag}: replaces every student row and every photo. Two seeds with different tags
     * differ in rows and files, so a test can tell which one it is looking at.
     */
    void seed(String tag, int students, int photos, int schemaVersion, int admins) throws Exception {
        Connection c = live();
        try (Statement st = c.createStatement()) {
            st.execute("CREATE TABLE IF NOT EXISTS flyway_schema_history (installed_rank INTEGER NOT NULL PRIMARY KEY, version TEXT, description TEXT NOT NULL, type TEXT NOT NULL, "
                    + "script TEXT NOT NULL, checksum INTEGER, installed_by TEXT NOT NULL, installed_on TEXT NOT NULL, execution_time INTEGER NOT NULL, success INTEGER NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY, username TEXT NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, name_km TEXT NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS teachers (id INTEGER PRIMARY KEY, name_km TEXT NOT NULL)");
            st.execute("CREATE TABLE IF NOT EXISTS classes (id INTEGER PRIMARY KEY, name_km TEXT NOT NULL)");
            st.execute("DELETE FROM flyway_schema_history");
            st.execute("DELETE FROM app_users");
            st.execute("DELETE FROM students");
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, installed_by, installed_on, execution_time, success) "
                + "VALUES (?, ?, 'x', 'SQL', 'x.sql', 'test', '2026-01-01 00:00:00', 0, 1)")) {
            for (int v = 1; v <= schemaVersion; v++) { ps.setInt(1, v); ps.setString(2, String.valueOf(v)); ps.executeUpdate(); }
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO app_users VALUES (?, ?)")) {
            for (int i = 1; i <= admins; i++) { ps.setInt(1, i); ps.setString(2, "admin" + i); ps.executeUpdate(); }
        }
        try (PreparedStatement ps = c.prepareStatement("INSERT INTO students VALUES (?, ?)")) {
            for (int i = 1; i <= students; i++) { ps.setInt(1, i); ps.setString(2, "សិស្ស-" + tag + "-" + i); ps.executeUpdate(); }
        }
        Path photosDir = root.resolve("uploads").resolve("students");
        try (Stream<Path> s = Files.list(photosDir)) { for (Path p : s.toList()) Files.delete(p); }
        Random rnd = new Random(tag.hashCode() + (generation++));
        for (int i = 0; i < photos; i++) {
            byte[] b = new byte[2000 + rnd.nextInt(4000)];
            rnd.nextBytes(b);
            Files.write(photosDir.resolve("photo-" + UUID.nameUUIDFromBytes((tag + i).getBytes(StandardCharsets.UTF_8)) + ".jpg"), b);
        }
    }

    void seed(String tag, int students, int photos) throws Exception { seed(tag, students, photos, SchemaVersions.latestKnown(), 1); }

    /** The school's current state as a stranger would read it from the files (the live connection should be closed first). */
    State state() throws Exception { return stateOf(root); }

    static State stateOf(Path root) throws Exception {
        return stateOf(root.resolve("database").resolve("school.db"), root.resolve("uploads").resolve("students"));
    }

    static State stateOf(Path dbFile, Path photosDir) throws Exception {
        List<String> names = new ArrayList<>();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dbFile.toAbsolutePath().toString().replace('\\', '/'));
             Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT name_km FROM students ORDER BY id")) {
            while (rs.next()) names.add(rs.getString(1));
        }
        Map<String, String> photos = new TreeMap<>();
        if (Files.isDirectory(photosDir)) {
            try (Stream<Path> s = Files.list(photosDir)) {
                for (Path p : s.toList()) photos.put(p.getFileName().toString(), BackupArchive.sha256(p));
            }
        }
        return new State(names, photos);
    }

    @Override
    public void close() throws Exception {
        closeLive();
        BackupArchive.deleteTree(root);
    }

    // ---- crafted zips -----------------------------------------------------------------------------------------------

    public static Map<String, byte[]> readZip(Path zip) throws IOException {
        Map<String, byte[]> out = new LinkedHashMap<>();
        try (ZipFile z = new ZipFile(zip.toFile())) {
            var en = z.entries();
            while (en.hasMoreElements()) {
                ZipEntry e = en.nextElement();
                out.put(e.getName(), z.getInputStream(e).readAllBytes());
            }
        }
        return out;
    }

    public static void writeZip(Path zip, Map<String, byte[]> entries) throws IOException {
        try (ZipOutputStream z = new ZipOutputStream(Files.newOutputStream(zip))) {
            for (var e : entries.entrySet()) {
                z.putNextEntry(new ZipEntry(e.getKey()));
                z.write(e.getValue());
                z.closeEntry();
            }
        }
    }

    /** Copies {@code src} to {@code dst}, letting the test change entries (the manifest is NOT fixed up unless {@link #fixManifest} is called). */
    public static Path craft(Path src, Path dst, Consumer<Map<String, byte[]>> change) throws IOException {
        Map<String, byte[]> entries = readZip(src);
        change.accept(entries);
        writeZip(dst, entries);
        return dst;
    }

    /** Rewrites the manifest so every size and hash matches the entries, and sets {@code schemaVersion}. */
    public static void fixManifest(Map<String, byte[]> entries, Integer schemaVersion) {
        try {
            ObjectNode m = (ObjectNode) JSON.readTree(new String(entries.get(BackupArchive.MANIFEST), StandardCharsets.UTF_8));
            ArrayNode files = JSON.createArrayNode();
            for (var e : entries.entrySet()) {
                if (e.getKey().equals(BackupArchive.MANIFEST)) continue;
                ObjectNode f = JSON.createObjectNode();
                f.put("path", e.getKey());
                f.put("size", e.getValue().length);
                f.put("sha256", BackupArchive.hex(MessageDigest.getInstance("SHA-256").digest(e.getValue())));
                files.add(f);
            }
            m.set("files", files);
            if (schemaVersion != null) m.put("schemaVersion", schemaVersion.intValue());
            entries.put(BackupArchive.MANIFEST, JSON.writerWithDefaultPrettyPrinter().writeValueAsBytes(m));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    static JsonNode manifest(Map<String, byte[]> entries) {
        return JSON.readTree(new String(entries.get(BackupArchive.MANIFEST), StandardCharsets.UTF_8));
    }

    /** A copy of the SQLite file with one more migration recorded, as a newer program would have left it. */
    public static byte[] databaseWithMigration(byte[] dbBytes, int version, Path scratch) throws Exception {
        Path f = scratch.resolve("newer-" + UUID.randomUUID() + ".db");
        Files.write(f, dbBytes);
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + f.toAbsolutePath().toString().replace('\\', '/'));
             Statement st = c.createStatement()) {
            st.execute("PRAGMA journal_mode=DELETE");
            st.execute("INSERT INTO flyway_schema_history (installed_rank, version, description, type, script, installed_by, installed_on, execution_time, success) VALUES ("
                    + (1000 + version) + ", '" + version + "', 'newer', 'SQL', 'newer.sql', 'newer program', '2030-01-01 00:00:00', 0, 1)");
        }
        byte[] bytes = Files.readAllBytes(f);
        Files.delete(f);
        return bytes;
    }
}
