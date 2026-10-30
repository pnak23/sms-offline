package kh.school.sms.system;

import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.bootstrap.StartupState;
import kh.school.sms.settings.AppSettingsService;
import org.flywaydb.core.Flyway;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Supplier;

/**
 * Application health (docs §4B). Everything is computed on demand — no timers, no background polling. Results are
 * codes plus parameters; the frontend turns them into Khmer text.
 */
@Service
public class HealthService {
    public record Check(String id, String status, String code, Map<String, Object> params, long durationMs) {}
    public record Report(String status, List<Check> checks, String generatedAt) {}
    private record Result(String status, String code, Map<String, Object> params) {
        static Result ok(Map<String, Object> p) { return new Result("OK", "OK", p); }
        static Result of(String status, String code, Map<String, Object> p) { return new Result(status, code, p); }
    }

    /** Checks whose failure means the app must not start (reported to Electron by StartupChecks). */
    public static final Set<String> BLOCKING = Set.of("DATA_DIR_WRITABLE", "DISK_SPACE", "DATABASE", "SCHEMA_VERSION");

    private final JdbcTemplate jdbc;
    private final Flyway flyway;
    private final AppSettingsService settings;
    private final Clock clock;

    public HealthService(JdbcTemplate jdbc, Flyway flyway, AppSettingsService settings, Clock clock) {
        this.jdbc = jdbc;
        this.flyway = flyway;
        this.settings = settings;
        this.clock = clock;
    }

    public Report quick() {
        List<Check> c = new ArrayList<>();
        run(c, "DATA_DIR_WRITABLE", this::dataDirWritable);
        run(c, "DISK_SPACE", this::diskSpace);
        run(c, "DATABASE", this::database);
        run(c, "SCHEMA_VERSION", this::schemaVersion);
        run(c, "DIRTY_SHUTDOWN", this::dirtyShutdown);
        run(c, "BACKUP_AGE", this::backupAge);
        run(c, "MEMORY", this::memory);
        run(c, "CLOCK_SANITY", this::clockSanity);
        run(c, "ACADEMIC_YEAR_CURRENT", this::academicYear);
        run(c, "LOG_SIZE", this::logSize);
        run(c, "APP_VERSIONS", this::versions);
        return report(c);
    }

    public Report deep() {
        List<Check> c = new ArrayList<>(quick().checks());
        run(c, "DB_INTEGRITY", this::integrity);
        run(c, "UPLOADS_CONSISTENCY", this::uploads);
        return report(c);
    }

    private Report report(List<Check> checks) {
        String worst = "OK";
        for (Check k : checks) worst = rank(k.status()) > rank(worst) ? k.status() : worst;
        return new Report(worst, checks, Instant.now(clock).toString());
    }

    private static int rank(String s) { return switch (s) { case "FAIL" -> 3; case "WARN" -> 2; case "INFO" -> 1; default -> 0; }; }

    private void run(List<Check> out, String id, Supplier<Result> fn) {
        long t0 = System.nanoTime();
        Result r;
        try {
            r = fn.get();
        } catch (RuntimeException e) {
            r = Result.of("FAIL", "CHECK_ERROR", Map.of("error", e.getClass().getSimpleName()));
        }
        out.add(new Check(id, r.status(), r.code(), r.params(), (System.nanoTime() - t0) / 1_000_000));
    }

    // ---- checks -------------------------------------------------------------------------------------------

    private Result dataDirWritable() {
        Path probe = DataDirs.config().resolve(".write-test");
        try {
            Files.writeString(probe, "ok");
            Files.delete(probe);
            return Result.ok(Map.of());
        } catch (IOException e) {
            return Result.of("FAIL", "DATA_DIR_NOT_WRITABLE", Map.of());
        }
    }

    private Result diskSpace() {
        try {
            long freeMb = Files.getFileStore(DataDirs.root()).getUsableSpace() / (1024 * 1024);
            Map<String, Object> p = Map.of("freeMb", freeMb);
            if (freeMb < 200) return Result.of("FAIL", "DISK_SPACE_CRITICAL", p);
            if (freeMb < 1024) return Result.of("WARN", "DISK_SPACE_LOW", p);
            return Result.ok(p);
        } catch (IOException e) {
            return Result.of("WARN", "DISK_SPACE_UNKNOWN", Map.of());
        }
    }

    private Result database() {
        Integer fk = jdbc.queryForObject("PRAGMA foreign_keys", Integer.class);
        String journal = jdbc.queryForObject("PRAGMA journal_mode", String.class);
        if (fk == null || fk != 1) return Result.of("FAIL", "FOREIGN_KEYS_OFF", Map.of());
        if (!"wal".equalsIgnoreCase(journal)) return Result.of("WARN", "JOURNAL_NOT_WAL", Map.of("journalMode", String.valueOf(journal)));
        return Result.ok(Map.of("sqlite", String.valueOf(jdbc.queryForObject("select sqlite_version()", String.class))));
    }

    private Result schemaVersion() {
        var current = flyway.info().current();
        int pending = flyway.info().pending().length;
        String v = current == null ? "0" : current.getVersion().getVersion();
        if (pending > 0) return Result.of("FAIL", "MIGRATIONS_PENDING", Map.of("version", v, "pending", pending));
        return Result.ok(Map.of("version", v));
    }

    private Result dirtyShutdown() {
        if (!StartupState.dirtyShutdown) return Result.ok(Map.of());
        String quick = jdbc.queryForObject("PRAGMA quick_check", String.class);
        if (!"ok".equalsIgnoreCase(quick)) return Result.of("FAIL", "DATABASE_DAMAGED_AFTER_CRASH", Map.of());
        return Result.of("WARN", "PREVIOUS_SHUTDOWN_NOT_CLEAN", Map.of());
    }

    private Result backupAge() {
        Instant newest = null;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(DataDirs.backups(), "SchoolBackup_*.zip")) {
            for (Path p : s) {
                Instant m = Files.getLastModifiedTime(p).toInstant();
                if (newest == null || m.isAfter(newest)) newest = m;
            }
        } catch (IOException e) {
            return Result.of("WARN", "BACKUP_FOLDER_UNREADABLE", Map.of());
        }
        if (newest == null) return Result.of("INFO", "NO_BACKUP_YET", Map.of());
        long days = Duration.between(newest, Instant.now(clock)).toDays();
        int limit = Integer.parseInt(settings.allPublic().get("backup.reminderDays"));
        Map<String, Object> p = Map.of("days", days, "reminderDays", limit);
        return days > limit ? Result.of("WARN", "BACKUP_OVERDUE", p) : Result.ok(p);
    }

    private Result memory() {
        Runtime rt = Runtime.getRuntime();
        long used = (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024);
        long max = rt.maxMemory() / (1024 * 1024);
        Map<String, Object> p = Map.of("usedMb", used, "maxMb", max);
        return used * 100 / Math.max(1, max) > 85 ? Result.of("WARN", "MEMORY_HIGH", p) : Result.ok(p);
    }

    private Result clockSanity() {
        Instant now = Instant.now(clock);
        String latest = jdbc.queryForObject("select max(at) from audit_logs", String.class);
        if (now.atZone(ZoneId.systemDefault()).getYear() < 2025) return Result.of("WARN", "CLOCK_TOO_OLD", Map.of());
        if (latest != null && Instant.parse(latest).isAfter(now.plusSeconds(60))) return Result.of("WARN", "CLOCK_BEHIND_LAST_ACTIVITY", Map.of());
        return Result.ok(Map.of());
    }

    private Result academicYear() {
        String today = LocalDate.now(clock.withZone(ZoneId.systemDefault())).toString();
        Integer n = jdbc.queryForObject("select count(*) from academic_years where is_current = 1 and start_date <= ? and end_date >= ?", Integer.class, today, today);
        if (n != null && n > 0) return Result.ok(Map.of());
        boolean setupDone = settings.get(AppSettingsService.SETUP_COMPLETED_AT).isPresent();
        return Result.of(setupDone ? "WARN" : "INFO", "NO_CURRENT_ACADEMIC_YEAR", Map.of());
    }

    private Result logSize() {
        long bytes = 0;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(DataDirs.logs())) {
            for (Path p : s) if (Files.isRegularFile(p)) bytes += Files.size(p);
        } catch (IOException e) {
            return Result.of("INFO", "LOG_SIZE_UNKNOWN", Map.of());
        }
        long mb = bytes / (1024 * 1024);
        return mb > 200 ? Result.of("WARN", "LOG_FOLDER_LARGE", Map.of("mb", mb)) : Result.ok(Map.of("mb", mb));
    }

    private Result versions() {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("app", StartupState.APP_VERSION);
        p.put("java", System.getProperty("java.version"));
        p.put("os", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        return Result.of("INFO", "VERSIONS", p);
    }

    private Result integrity() {
        List<String> ic = jdbc.queryForList("PRAGMA integrity_check", String.class);
        int fk = jdbc.queryForList("PRAGMA foreign_key_check").size();
        if (!(ic.size() == 1 && "ok".equalsIgnoreCase(ic.get(0)))) return Result.of("FAIL", "INTEGRITY_CHECK_FAILED", Map.of("problems", ic.size()));
        if (fk > 0) return Result.of("FAIL", "FOREIGN_KEY_VIOLATIONS", Map.of("violations", fk));
        return Result.ok(Map.of());
    }

    private Result uploads() {
        String logo = jdbc.queryForObject("select logo_file from school_settings where id = 1", String.class);   // NULL when no logo
        int orphans = 0;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(DataDirs.schoolUploads())) {
            for (Path p : s) if (!p.getFileName().toString().equals(logo)) orphans++;
        } catch (IOException e) {
            return Result.of("WARN", "UPLOADS_UNREADABLE", Map.of());
        }
        if (logo != null && !Files.isRegularFile(DataDirs.schoolUploads().resolve(logo))) return Result.of("WARN", "LOGO_FILE_MISSING", Map.of());
        return orphans > 0 ? Result.of("WARN", "ORPHAN_UPLOADS", Map.of("count", orphans)) : Result.ok(Map.of());
    }
}
