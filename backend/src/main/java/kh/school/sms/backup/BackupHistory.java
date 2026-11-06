package kh.school.sms.backup;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.function.UnaryOperator;

/**
 * {@code config/backup-history.json}: what is known ABOUT the backups (kind, verified, copied to a USB stick). It lives outside
 * the database on purpose: a restore replaces the database, and the history inside it would be overwritten by the very
 * backup being restored. The zip files are the truth; this file only adds facts to them, so losing it loses no data.
 */
public final class BackupHistory {
    public record Item(String fileName, String kind, String createdAt, long sizeBytes, String sha256, int schemaVersion, String appVersion,
                       String verifiedAt, String verifyError, String externalCopyAt) {
        Item verified(String at, String sha) {
            return new Item(fileName, kind, createdAt, sizeBytes, sha, schemaVersion, appVersion, at, null, externalCopyAt);
        }

        Item failed(String code) {
            return new Item(fileName, kind, createdAt, sizeBytes, sha256, schemaVersion, appVersion, null, code, externalCopyAt);
        }

        Item copied(String at) {
            return new Item(fileName, kind, createdAt, sizeBytes, sha256, schemaVersion, appVersion, verifiedAt, verifyError, at);
        }
    }

    /** How the last restore ended; shown on the backup page. {@code audited} flips once the restored database has recorded it. */
    public record Restore(boolean ok, String at, String code, String backupCreatedAt, String safetyBackup, String replacedFolder, boolean audited) {
        Restore asAudited() { return new Restore(ok, at, code, backupCreatedAt, safetyBackup, replacedFolder, true); }
    }

    /** {@code since}: when the history began, the anchor for "no copy on a USB stick yet". */
    public record Data(int version, String since, List<Item> entries, String lastExternalCopyAt, Restore lastRestore) {
        static Data empty() { return new Data(1, null, List.of(), null, null); }
    }

    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private final Path file;

    public BackupHistory(Path dataRoot) { this.file = dataRoot.resolve("config").resolve("backup-history.json"); }

    public synchronized Data load() {
        if (!Files.isRegularFile(file)) return Data.empty();
        try {
            Data d = JSON.readValue(Files.readString(file, StandardCharsets.UTF_8), Data.class);
            return d == null ? Data.empty() : new Data(1, d.since(), d.entries() == null ? List.of() : List.copyOf(d.entries()), d.lastExternalCopyAt(), d.lastRestore());
        } catch (IOException | RuntimeException e) {
            try {   // unreadable: set it aside (the zips on disk are the truth) and start a fresh one
                Files.move(file, file.resolveSibling("backup-history.json.bad"), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException ignored) {
                // nothing more can be done; the next save replaces it
            }
            return Data.empty();
        }
    }

    /** Reads, applies {@code change}, writes atomically (temp file + rename) and returns the result. */
    public synchronized Data update(String nowIso, UnaryOperator<Data> change) {
        Data d = load();
        if (d.since() == null) d = new Data(1, nowIso, d.entries(), d.lastExternalCopyAt(), d.lastRestore());
        Data next = change.apply(d);
        Path tmp = file.resolveSibling("backup-history.json.tmp");
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(tmp, JSON.writerWithDefaultPrettyPrinter().writeValueAsString(
                    new Data(1, next.since(), new ArrayList<>(next.entries()), next.lastExternalCopyAt(), next.lastRestore())), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
        return next;
    }
}
