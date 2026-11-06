package kh.school.sms.backup;

import kh.school.sms.audit.AuditService;
import kh.school.sms.backup.BackupHistory.Item;
import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.common.ApiException;
import kh.school.sms.security.SetupState;
import kh.school.sms.settings.AppSettingsService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.Supplier;
import java.util.regex.Pattern;

/**
 * Backups and restores for the REST layer. The work is done by {@link BackupStore} and {@link RestoreStaging}; this adds one
 * lock (one backup at a time), the audit trail, and the translation of {@link BackupException} codes into API errors.
 * Spring only ever touches the managed {@code backups/} folder: the renderer never sends a path, and Electron's main process
 * does the copying to and from a USB stick or another folder.
 */
@Service
public class BackupService {
    private static final Logger log = LoggerFactory.getLogger(BackupService.class);
    /** A file Electron's main process copied into backups/incoming/ for a restore. */
    private static final Pattern INCOMING = Pattern.compile("^incoming-[0-9]{1,20}\\.zip$");

    public record BackupView(String id, String fileName, String kind, String createdAt, long sizeBytes, int schemaVersion, String appVersion,
                             String verifiedAt, String verifyError, String externalCopyAt) {}

    /** What a staged restore will replace the data with: enough to confirm "this is the right backup". Counts only, no names. */
    public record Staged(String state, String stagedAt, String backupCreatedAt, String appVersion, int schemaVersion,
                         int students, int teachers, int classes, int photos, long totalBytes) {}

    public record Overview(List<BackupView> backups, String lastBackupAt, String lastVerifiedAt, String lastExternalCopyAt, int reminderDays,
                           boolean externalOverdue, boolean autoDue, long freeMb, long neededMb, BackupHistory.Restore lastRestore, Staged staged,
                           String localState, Long localAgeHours) {}

    private final BackupStore store;
    private final DataSource dataSource;
    private final AuditService audit;
    private final AppSettingsService settings;
    private final SetupState setup;
    private final Clock clock;
    private final ReentrantLock busy = new ReentrantLock();

    public BackupService(DataSource dataSource, AuditService audit, AppSettingsService settings, SetupState setup, Clock clock) {
        this.store = new BackupStore(DataDirs.root(), clock);
        this.dataSource = dataSource;
        this.audit = audit;
        this.settings = settings;
        this.setup = setup;
        this.clock = clock;
    }

    BackupStore store() { return store; }

    // ---- reading ------------------------------------------------------------------------------------------------

    public Overview overview() {
        return guard(() -> {
            List<Item> all = store.list();
            BackupHistory.Data h = store.history().load();
            BackupStore.Reminder r = reminder(all, h);
            String lastVerified = store.lastVerified().map(Item::createdAt).orElse(null);
            BackupStore.LocalStatus local = store.localStatus(all);   // OK / OLD (24 hours or more) / NONE: what the dashboard and the backup page show
            return new Overview(all.stream().map(BackupService::view).toList(), all.isEmpty() ? null : all.get(0).createdAt(), lastVerified,
                    h.lastExternalCopyAt(), r.reminderDays(), r.overdue(), local.state() != BackupStore.LocalState.OK && setup.usersExist(),
                    store.freeBytes() == Long.MAX_VALUE ? -1 : store.freeBytes() >> 20, store.requiredBytes() >> 20, h.lastRestore(), staged().orElse(null),
                    local.state().name(), local.ageHours());
        });
    }

    public BackupStore.Reminder reminder() { return reminder(store.list(), store.history().load()); }

    /** The state of the backups on this laptop, for the health check that the dashboard shows. */
    public BackupStore.LocalStatus localStatus() { return guard(() -> store.localStatus()); }

    private BackupStore.Reminder reminder(List<Item> all, BackupHistory.Data h) {
        return BackupStore.reminder(all, h, Instant.now(clock), settings.get("backup.reminderDays").map(Integer::parseInt).orElse(0));   // 0: the USB reminder is off until the school asks for it
    }

    /** The newest backup, if any, for the health check "verify the newest backup now". */
    public Optional<BackupView> newest() { return store.newest().map(BackupService::view); }

    public long freeBytes() { return store.freeBytes(); }

    public long requiredBytes() { return store.requiredBytes(); }

    static BackupView view(Item i) {
        return new BackupView(BackupStore.idOf(i.fileName()), i.fileName(), i.kind(), i.createdAt(), i.sizeBytes(), i.schemaVersion(), i.appVersion(),
                i.verifiedAt(), i.verifyError(), i.externalCopyAt());
    }

    // ---- making, checking, removing -------------------------------------------------------------------------------

    public BackupView createManual() {
        return guard(() -> locked(() -> {
            BackupView v = view(create(Kind.MANUAL));
            audit.record("BACKUP_CREATED", "backup", null, "backup created (manual): " + v.fileName());
            return v;
        }));
    }

    private Item create(Kind kind) {
        try (Connection c = dataSource.getConnection()) {
            return store.create(c, kind);
        } catch (SQLException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
    }

    /** True when the program is about to close and an automatic backup will run first (Electron waits longer then). */
    public boolean autoBackupDueOnClose() {
        try {
            return setup.usersExist() && store.autoDue();
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** Called while the program closes: one backup if the newest is a day old. Never throws: closing must always complete. */
    public void runOnClose() {
        try {
            if (!autoBackupDueOnClose()) return;
            if (!busy.tryLock(60, TimeUnit.SECONDS)) return;
            try {
                BackupView v = view(create(Kind.AUTO));
                audit.record("BACKUP_CREATED", "backup", null, "backup created (automatic, on close): " + v.fileName());
            } finally {
                busy.unlock();
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } catch (RuntimeException e) {
            log.warn("the backup on close did not complete ({})", e instanceof BackupException b ? b.code() : e.getClass().getSimpleName());
        }
    }

    public BackupView verify(String id) {
        return guard(() -> locked(() -> {
            Item item = store.verify(id);
            audit.record("BACKUP_VERIFIED", "backup", null, item.verifyError() == null ? "backup verified: " + item.fileName()
                    : "backup found damaged (" + item.verifyError() + "): " + item.fileName());
            return view(item);
        }));
    }

    public void delete(String id) {
        guard(() -> locked(() -> {
            store.delete(id);
            audit.record("BACKUP_DELETED", "backup", null, "backup deleted: " + id + ".zip");
            return null;
        }));
    }

    public BackupView recordExternalCopy(String id, String sha256) {
        return guard(() -> locked(() -> {
            BackupView v = view(store.recordExternalCopy(id, sha256));
            audit.record("BACKUP_COPIED", "backup", null, "backup copied to another place: " + v.fileName());
            return v;
        }));
    }

    // ---- restoring ----------------------------------------------------------------------------------------------

    public Optional<Staged> staged() { return RestoreStaging.read(DataDirs.root()).map(BackupService::staged); }

    public BackupHistory.Restore lastRestore() { return store.history().load().lastRestore(); }

    private static Staged staged(RestoreStaging.Meta m) {
        BackupArchive.Summary s = m.summary();
        return new Staged(m.state(), m.stagedAt(), s.manifest().createdAt(), s.manifest().appVersion(), s.manifest().schemaVersion(),
                s.students(), s.teachers(), s.classes(), s.photos(), s.totalBytes());
    }

    /** Verifies the file Electron copied into backups/incoming/ and unpacks it for restoring. The incoming copy is always removed. */
    public Staged stage(String incomingName) {
        return guard(() -> locked(() -> {
            if (incomingName == null || !INCOMING.matcher(incomingName).matches()) throw new BackupException("BACKUP_NOT_FOUND");
            Path zip = DataDirs.backups().resolve("incoming").resolve(incomingName);
            if (!Files.isRegularFile(zip)) throw new BackupException("BACKUP_NOT_FOUND");
            try {
                Staged s = staged(RestoreStaging.stage(DataDirs.root(), zip, Instant.now(clock)));
                audit.record("RESTORE_STAGED", "backup", null, "a backup was chosen for restoring and checked (made " + s.backupCreatedAt() + ")");
                return s;
            } finally {
                try {
                    Files.deleteIfExists(zip);
                } catch (IOException ignored) {
                    // swept at the next start
                }
            }
        }));
    }

    /** Stages a backup that is already listed here (a safety backup, an automatic one): no file dialog, nothing is copied or removed. */
    public Staged stageListed(String backupId) {
        return guard(() -> locked(() -> {
            Staged s = staged(RestoreStaging.stage(DataDirs.root(), store.locate(backupId), Instant.now(clock)));
            audit.record("RESTORE_STAGED", "backup", null, "a listed backup was chosen for restoring and checked (made " + s.backupCreatedAt() + ")");
            return s;
        }));
    }

    /** The user confirmed. The swap itself happens at the next start, before the database opens; the caller then restarts the backend. */
    public Staged apply() {
        return guard(() -> locked(() -> {
            Staged s = staged(RestoreStaging.confirm(DataDirs.root(), Instant.now(clock)));
            audit.record("RESTORE_REQUESTED", "backup", null, "restore confirmed; it is applied when the program restarts (backup made " + s.backupCreatedAt() + ")");
            return s;
        }));
    }

    public void cancel() {
        guard(() -> locked(() -> {
            boolean had = RestoreStaging.read(DataDirs.root()).isPresent();
            RestoreStaging.discard(DataDirs.root());
            if (had) audit.record("RESTORE_CANCELLED", "backup", null, "the staged restore was cancelled");
            return null;
        }));
    }

    /** Called once at start-up: the database that was just restored (or kept) writes down how the restore ended. */
    void recordRestoreOutcome() {
        BackupHistory.Restore r = store.history().load().lastRestore();
        if (r == null || r.audited()) return;
        audit.record(r.ok() ? "RESTORE_APPLIED" : "RESTORE_FAILED", "backup", null, r.ok()
                ? "restore applied from the backup made " + r.backupCreatedAt() + (r.safetyBackup() == null ? "" : "; the data it replaced was backed up first")
                : "the restore did not complete (" + r.code() + "); the data is as before");
        store.history().update(Instant.now(clock).toString(), d -> new BackupHistory.Data(1, d.since(), d.entries(), d.lastExternalCopyAt(), r.asAudited()));
    }

    // ---- plumbing -------------------------------------------------------------------------------------------------

    /** One backup operation at a time: a second request answers 409 BACKUP_BUSY instead of waiting. */
    private <T> T locked(Supplier<T> work) {
        if (!busy.tryLock()) throw new BackupException("BACKUP_BUSY");
        try {
            return work.get();
        } finally {
            busy.unlock();
        }
    }

    private <T> T guard(Supplier<T> work) {
        try {
            return work.get();
        } catch (BackupException e) {
            log.warn("backup request refused: {} ({})", e.code(), e.getCause() == null ? "-" : e.getCause().getClass().getSimpleName());
            throw new ApiException(status(e.code()), e.code());
        }
    }

    private static HttpStatus status(String code) {
        return switch (code) {
            case "BACKUP_NOT_FOUND" -> HttpStatus.NOT_FOUND;
            case "BACKUP_NOT_A_BACKUP", "BACKUP_CORRUPT", "BACKUP_CHECKSUM_MISMATCH", "BACKUP_DATABASE_DAMAGED", "BACKUP_SCHEMA_NEWER" -> HttpStatus.UNPROCESSABLE_ENTITY;
            case "BACKUP_FAILED", "BACKUP_FOLDER_UNREADABLE" -> HttpStatus.INTERNAL_SERVER_ERROR;
            default -> HttpStatus.CONFLICT;   // busy, last verified backup, not enough space, copy mismatch, nothing staged
        };
    }
}
