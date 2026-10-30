package kh.school.sms.bootstrap;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * The managed local data directory (docs §7). Never inside the install directory. The path is exposed to Spring
 * placeholders as {@code sms.data-dir} with forward slashes so it can sit inside a JDBC URL.
 */
public final class DataDirs {
    public static final String PROPERTY = "sms.data-dir";

    private static final String[] SUBDIRS = {
            "database", "backups", "backups/auto", "backups/incoming", "uploads/students", "uploads/school",
            "logs", "logs/diagnostics", "config"
    };

    private DataDirs() {}

    public static void prepareFromEnvironment() {
        String v = System.getProperty(PROPERTY);
        if (v == null || v.isBlank()) v = System.getenv("SMS_DATA_DIR");
        if (v == null || v.isBlank()) throw new IllegalStateException("SMS_DATA_DIR is not set");
        prepare(Path.of(v));
    }

    public static Path prepare(Path root) {
        Path abs = root.toAbsolutePath().normalize();
        try {
            for (String s : SUBDIRS) Files.createDirectories(abs.resolve(s));
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create the data directory: " + abs, e);
        }
        System.setProperty(PROPERTY, abs.toString().replace('\\', '/'));
        return abs;
    }

    public static Path root() {
        String v = System.getProperty(PROPERTY);
        if (v == null) throw new IllegalStateException("data directory not prepared");
        return Path.of(v);
    }

    public static Path database() { return root().resolve("database/school.db"); }
    public static Path config() { return root().resolve("config"); }
    public static Path logs() { return root().resolve("logs"); }
    public static Path schoolUploads() { return root().resolve("uploads/school"); }
    public static Path studentUploads() { return root().resolve("uploads/students"); }
    public static Path backups() { return root().resolve("backups"); }
}
