package kh.school.sms.backup;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.Optional;

/**
 * A backup chosen for restoring, verified and unpacked into {@code backups/restore-pending/} but not yet applied. Applying it
 * is the job of {@link RestoreBootstrap}, which runs before the database is opened: a database file is never swapped under a
 * live connection pool. {@code restore.json} says whether the user has confirmed.
 */
public final class RestoreStaging {
    public static final String STAGED = "STAGED";
    public static final String CONFIRMED = "CONFIRMED";

    public record Meta(String state, String stagedAt, String confirmedAt, BackupArchive.Summary summary) {}

    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private RestoreStaging() {}

    public static Path dir(Path root) { return root.resolve("backups").resolve("restore-pending"); }

    public static Optional<Meta> read(Path root) {
        Path f = dir(root).resolve("restore.json");
        if (!Files.isRegularFile(f)) return Optional.empty();
        try {
            Meta m = JSON.readValue(Files.readString(f, StandardCharsets.UTF_8), Meta.class);
            return m == null || m.summary() == null || m.summary().manifest() == null ? Optional.empty() : Optional.of(m);
        } catch (IOException | RuntimeException e) {
            return Optional.empty();
        }
    }

    /** Verifies {@code zip} completely and unpacks it. Whatever was staged before is thrown away first; a failure leaves nothing staged. */
    public static Meta stage(Path root, Path zip, Instant now) {
        discard(root);
        Path dir = dir(root);
        try {
            BackupArchive.Summary s = BackupArchive.verify(zip, dir, true);
            Meta meta = new Meta(STAGED, now.toString(), null, s);
            write(dir, meta);
            return meta;
        } catch (BackupException e) {
            discard(root);
            throw e;
        } catch (RuntimeException e) {
            discard(root);
            throw new BackupException("BACKUP_FAILED", e);
        }
    }

    /** The user said yes: prove the unpacked files are still intact, then mark the restore to be applied at the next start. */
    public static Meta confirm(Path root, Instant now) {
        Meta m = read(root).orElseThrow(() -> new BackupException("RESTORE_NOTHING_STAGED"));
        if (!STAGED.equals(m.state())) throw new BackupException("RESTORE_NOTHING_STAGED");
        BackupArchive.verifyExtracted(dir(root), m.summary().manifest());
        Meta next = new Meta(CONFIRMED, m.stagedAt(), now.toString(), m.summary());
        write(dir(root), next);
        return next;
    }

    public static void discard(Path root) { BackupArchive.deleteTree(dir(root)); }

    private static void write(Path dir, Meta meta) {
        Path f = dir.resolve("restore.json");
        Path tmp = dir.resolve("restore.json.tmp");
        try {
            Files.writeString(tmp, JSON.writerWithDefaultPrettyPrinter().writeValueAsString(meta), StandardCharsets.UTF_8);
            try {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(tmp, f, StandardCopyOption.REPLACE_EXISTING);
            }
        } catch (IOException e) {
            throw new BackupException("BACKUP_FAILED", e);
        }
    }
}
