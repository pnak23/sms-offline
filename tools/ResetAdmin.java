import kh.school.sms.auth.PasswordPolicy;
import kh.school.sms.auth.RecoveryKeys;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.io.BufferedReader;
import java.io.Console;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Instant;

/**
 * DEVELOPER-ONLY offline reset of the administrator password (docs §4A.2, approved default 3). It lives outside
 * backend/src/main on purpose, so it can never be part of the installer. Anyone who can run it already has file access
 * to school.db, so it adds no new exposure; it exists to rescue the owner when BOTH the password and the recovery key
 * are lost.
 *
 * What it does, in one transaction: sets the new password (same BCrypt cost and password policy as the app), replaces
 * the recovery key with a random one nobody ever sees (so the old key is dead at once) and marks it unconfirmed, so
 * the app makes the owner create and print a new key at the next sign-in. Failed-attempt counters are cleared and an
 * audit entry is written. It never prints or logs a password or a key.
 *
 * Run it with the app CLOSED:  node scripts/reset-admin.mjs [--data-dir DIR] [--password-stdin] [--force]
 * The data folder travels in the SMS_DATA_DIR environment variable (the wrapper sets it from --data-dir): Java's launcher
 * turns non-ASCII characters in command-line arguments into "?" on Windows, environment variables stay intact.
 */
public class ResetAdmin {

    public static void main(String[] args) throws Exception {
        boolean force = false;
        boolean passwordFromStdin = false;
        for (String arg : args) {
            switch (arg) {
                case "--force" -> force = true;
                case "--password-stdin" -> passwordFromStdin = true;
                default -> fail("unknown option " + arg);
            }
        }
        Path dataDir;
        String fromEnv = System.getenv("SMS_DATA_DIR");
        if (fromEnv != null && !fromEnv.isBlank()) {
            dataDir = Path.of(fromEnv);
        } else {
            String local = System.getenv("LOCALAPPDATA");
            if (local == null) fail("neither SMS_DATA_DIR nor LOCALAPPDATA is set");
            dataDir = Path.of(local, "RuralSchoolManagement");
        }
        Path db = dataDir.resolve("database").resolve("school.db");
        if (!Files.isRegularFile(db)) fail("no database at " + db);
        if (Files.exists(dataDir.resolve("config").resolve("running.lock")) && !force) {
            fail("config/running.lock exists: close the application first. If it crashed last time and is not running, repeat with --force.");
        }

        String url = "jdbc:sqlite:" + db.toAbsolutePath().toString().replace('\\', '/')
                + "?foreign_keys=on&busy_timeout=5000&transaction_mode=IMMEDIATE";
        try (Connection c = DriverManager.getConnection(url)) {
            long id;
            String username;
            try (PreparedStatement s = c.prepareStatement("SELECT id, username FROM app_users ORDER BY id LIMIT 1");
                 ResultSet r = s.executeQuery()) {
                if (!r.next()) fail("no administrator exists yet: start the application and use the setup wizard instead");
                id = r.getLong(1);
                username = r.getString(2);
            }

            String password = readPassword(passwordFromStdin);
            var errors = PasswordPolicy.validate("password", password, username);
            if (!errors.isEmpty()) {
                StringBuilder codes = new StringBuilder();
                for (var e : errors) codes.append(codes.isEmpty() ? "" : ", ").append(e.code());
                fail("password rejected (" + codes + "): at least 8 characters, at most 72 UTF-8 bytes, not a common password, not the username");
            }

            var encoder = new BCryptPasswordEncoder(12);
            String passwordHash = encoder.encode(password);
            String unseenKeyHash = encoder.encode(RecoveryKeys.generate());   // never shown: it only retires the old key
            String now = Instant.now().toString();

            c.setAutoCommit(false);
            try {
                try (PreparedStatement u = c.prepareStatement(
                        "UPDATE app_users SET password_hash = ?, password_changed_at = ?, recovery_key_hash = ?, recovery_key_created_at = ?, "
                                + "recovery_key_confirmed_at = NULL, failed_attempts = 0, locked_until = NULL, recovery_failed_attempts = 0, "
                                + "recovery_locked_until = NULL, is_active = 1, version = version + 1, updated_at = ? WHERE id = ?")) {
                    u.setString(1, passwordHash);
                    u.setString(2, now);
                    u.setString(3, unseenKeyHash);
                    u.setString(4, now);
                    u.setString(5, now);
                    u.setLong(6, id);
                    if (u.executeUpdate() != 1) throw new IllegalStateException("administrator row vanished");
                }
                try (PreparedStatement a = c.prepareStatement(
                        "INSERT INTO audit_logs (at, actor, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?)")) {
                    a.setString(1, now);
                    a.setString(2, "offline-reset-tool");
                    a.setString(3, "ADMIN_RESET_OFFLINE");
                    a.setString(4, "app_user");
                    a.setLong(5, id);
                    a.setString(6, "administrator password reset with the offline developer tool; recovery key retired");
                    a.executeUpdate();
                }
                c.commit();
            } catch (Exception e) {
                c.rollback();
                throw e;
            }
        }
        System.out.println("Password reset for the administrator account. Sign-in attempts are unlocked.");
        System.out.println("The old recovery key no longer works: at the next sign-in the application will make the owner create and print a new one.");
    }

    private static String readPassword(boolean fromStdin) throws Exception {
        if (fromStdin) {
            String line = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine();
            if (line == null || line.isEmpty()) fail("no password on stdin");
            return line;
        }
        Console console = System.console();
        if (console == null) fail("no console to read the password from; use --password-stdin");
        char[] first = console.readPassword("New password: ");
        char[] second = console.readPassword("Repeat it:    ");
        if (first == null || !java.util.Arrays.equals(first, second)) fail("the two passwords differ");
        return new String(first);
    }

    private static void fail(String message) {
        System.err.println("ResetAdmin: " + message);
        System.exit(1);
    }
}
