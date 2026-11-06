package kh.school.sms.system;

import kh.school.sms.backup.BackupException;
import kh.school.sms.backup.BackupService;
import kh.school.sms.backup.BackupStore;
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
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
    private final BackupService backups;
    private final Clock clock;

    public HealthService(JdbcTemplate jdbc, Flyway flyway, AppSettingsService settings, BackupService backups, Clock clock) {
        this.jdbc = jdbc;
        this.flyway = flyway;
        this.settings = settings;
        this.backups = backups;
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
        run(c, "EXTERNAL_COPY", this::externalCopy);
        run(c, "BACKUP_SPACE", this::backupSpace);
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
        run(c, "BACKUP_VERIFY", this::backupVerify);
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

    /**
     * The backups kept on this laptop are the school's primary protection (the owner's policy of 2026-11-05), so this is the check the dashboard shows: a warning when there is no good
     * backup at all, or when the newest good one is 24 hours old or more (a normal close of the program makes one; so does "back up now").
     */
    private Result backupAge() {
        BackupStore.LocalStatus s;
        try {
            s = backups.localStatus();
        } catch (BackupException e) {
            return Result.of("WARN", "BACKUP_FOLDER_UNREADABLE", Map.of());
        }
        return switch (s.state()) {
            case NONE -> Result.of("WARN", "NO_SUCCESSFUL_BACKUP", Map.of());
            case OLD -> Result.of("WARN", "BACKUP_OLD", Map.of("hours", s.ageHours(), "lastAt", s.lastGoodAt()));
            case OK -> Result.ok(Map.of("hours", s.ageHours(), "lastAt", s.lastGoodAt()));
        };
    }

    /**
     * A copy somewhere ELSE (a USB stick) is OPTIONAL: a backup on the same disk does not survive the disk, a stolen laptop or physical damage, but the school may choose not to copy.
     * It is only a warning when the school switched its reminder on (backup.reminderDays above 0) and the copy is older than that.
     */
    private Result externalCopy() {
        BackupStore.Reminder r;
        try {
            r = backups.reminder();
        } catch (BackupException e) {
            return Result.of("WARN", "BACKUP_FOLDER_UNREADABLE", Map.of());
        }
        if (!r.anyBackup()) return Result.of("INFO", "NO_BACKUP_YET", Map.of());
        Map<String, Object> p = Map.of("days", r.days(), "reminderDays", r.reminderDays());
        boolean overdue = r.overdue();
        if (r.never()) return Result.of(overdue ? "WARN" : "INFO", "EXTERNAL_COPY_NEVER", p);   // backups exist, none copied to a USB stick yet
        return overdue ? Result.of("WARN", "BACKUP_OVERDUE", p) : Result.ok(p);
    }

    /** Room for the next backup: a backup that cannot be written is found out now, not on the day it is needed. */
    private Result backupSpace() {
        long free = backups.freeBytes();
        if (free == Long.MAX_VALUE) return Result.of("INFO", "BACKUP_SPACE_UNKNOWN", Map.of());
        long needMb = backups.requiredBytes() >> 20;
        Map<String, Object> p = Map.of("freeMb", free >> 20, "neededMb", needMb);
        return free < backups.requiredBytes() ? Result.of("WARN", "BACKUP_SPACE_LOW", p) : Result.ok(p);
    }

    /** Re-reads the newest backup from the start (hashes, database integrity): a backup nobody has tried to open is only a hope. */
    private Result backupVerify() {
        Optional<BackupService.BackupView> newest = backups.newest();
        if (newest.isEmpty()) return Result.of("INFO", "NO_BACKUP_YET", Map.of());
        BackupService.BackupView v = backups.verify(newest.get().id());
        return v.verifyError() == null ? Result.ok(Map.of("createdAt", v.createdAt())) : Result.of("FAIL", "BACKUP_DAMAGED", Map.of("reason", v.verifyError()));
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
        Set<String> photos = new HashSet<>(jdbc.queryForList("select photo_file from students where photo_file is not null", String.class));
        int orphans;
        try {
            orphans = orphanCount(DataDirs.schoolUploads(), logo == null ? Set.of() : Set.of(logo)) + orphanCount(DataDirs.studentUploads(), photos);
        } catch (IOException e) {
            return Result.of("WARN", "UPLOADS_UNREADABLE", Map.of());
        }
        if (logo != null && !Files.isRegularFile(DataDirs.schoolUploads().resolve(logo))) return Result.of("WARN", "LOGO_FILE_MISSING", Map.of());
        long missingPhotos = photos.stream().filter(p -> !Files.isRegularFile(DataDirs.studentUploads().resolve(p))).count();
        if (missingPhotos > 0) return Result.of("WARN", "STUDENT_PHOTO_MISSING", Map.of("count", missingPhotos));
        return orphans > 0 ? Result.of("WARN", "ORPHAN_UPLOADS", Map.of("count", orphans)) : Result.ok(Map.of());
    }

    /** Files in {@code dir} that no database row refers to. */
    private static int orphanCount(Path dir, Set<String> referenced) throws IOException {
        int n = 0;
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
            for (Path p : s) if (!referenced.contains(p.getFileName().toString())) n++;
        }
        return n;
    }
}
