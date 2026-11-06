package kh.school.sms.backup;

import kh.school.sms.backup.BackupHistory.Item;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Restoring: the swap happens before the database opens, keeps a safety backup of what it replaces, and survives the power going
 * out at ANY point. School "A" is what the backup holds; school "B" is what the PC has when the restore is applied.
 */
class RestoreBootstrapTest {
    /** Thrown from the hook to stand in for a power cut: it is an Error, so the restore's own failure handling cannot catch it. */
    static final class SimulatedCrash extends Error {
        SimulatedCrash(String step) { super(step); }
    }

    BackupFixture f;
    BackupFixture.State a;
    BackupFixture.State b;
    Item backupOfA;

    @BeforeEach
    void setUp() throws Exception { prepare(f = new BackupFixture()); }

    @AfterEach
    void tearDown() throws Exception { f.close(); }

    /** Makes the PC look like A, backs that up, and changes the PC to B. */
    void prepare(BackupFixture fx) throws Exception {
        fx.seed("A", 5, 4);
        a = fx.state();
        backupOfA = fx.store().create(fx.live(), Kind.MANUAL);
        fx.seed("B", 9, 6);
        b = fx.state();
        assertThat(a.students()).isNotEqualTo(b.students());
        assertThat(a.photos().keySet()).doesNotContainAnyElementsOf(b.photos().keySet());
    }

    void stageAndConfirm(BackupFixture fx, Item backup) {
        Path zip = fx.zipFor(Kind.MANUAL, backup.fileName());
        RestoreStaging.stage(fx.root, zip, Instant.now());
        RestoreStaging.confirm(fx.root, Instant.now());
    }

    void applyAsNextStart(BackupFixture fx) throws Exception {
        fx.closeLive();   // the program is not running while a restore is applied
        RestoreBootstrap.apply(fx.root, fx.clock, step -> { });
    }

    BackupHistory.Restore lastRestore(BackupFixture fx) { return fx.store().history().load().lastRestore(); }

    List<String> names(Path dir) throws Exception {
        List<String> out = new ArrayList<>();
        try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) { for (Path p : s) out.add(p.getFileName().toString()); }
        return out.stream().sorted().toList();
    }

    // ---- the plain case ---------------------------------------------------------------------------------------------

    @Test
    void aConfirmedRestoreBringsBackExactlyTheBackupAndKeepsASafetyBackupOfWhatWasReplaced() throws Exception {
        f.store().recordExternalCopy(BackupStore.idOf(backupOfA.fileName()), BackupArchive.sha256(f.zipFor(Kind.MANUAL, backupOfA.fileName())));
        String copiedAt = f.store().history().load().lastExternalCopyAt();
        stageAndConfirm(f, backupOfA);
        applyAsNextStart(f);

        BackupFixture.State now = f.state();
        assertThat(now.students()).containsExactlyElementsOf(a.students());
        assertThat(now.photos()).as("every photo of the backup, byte for byte, and none of B's").isEqualTo(a.photos());
        assertThat(names(f.root.resolve("database"))).as("no WAL / SHM of the replaced database").containsExactly("school.db");

        BackupHistory.Restore r = lastRestore(f);
        assertThat(r.ok()).isTrue();
        assertThat(r.safetyBackup()).isNotNull();
        assertThat(r.replacedFolder()).isNull();
        assertThat(r.backupCreatedAt()).isEqualTo(backupOfA.createdAt());
        assertThat(f.root.resolve("backups/restore-pending")).as("nothing is left staged").doesNotExist();

        // the safety backup holds B: the data that was replaced can be brought back
        Item safety = f.store().find(BackupStore.idOf(r.safetyBackup())).orElseThrow();
        assertThat(safety.kind()).isEqualTo("PRE_RESTORE");
        assertThat(f.root.resolve("backups/auto").resolve(safety.fileName())).isRegularFile();
        BackupArchive.verify(f.root.resolve("backups/auto").resolve(safety.fileName()), f.root.resolve("safety-check"), true);
        BackupFixture.State inSafety = BackupFixture.stateOf(f.root.resolve("safety-check/school.db"), f.root.resolve("safety-check/uploads/students"));
        assertThat(inSafety.students()).containsExactlyElementsOf(b.students());
        assertThat(inSafety.photos()).isEqualTo(b.photos());

        assertThat(f.store().history().load().lastExternalCopyAt()).as("the history lives outside the database, so a restore does not touch it").isEqualTo(copiedAt);
        assertThat(f.store().find(BackupStore.idOf(backupOfA.fileName()))).get().extracting(Item::externalCopyAt).isNotNull();
    }

    @Test
    void aRestoreThatWasStagedButNeverConfirmedChangesNothing() throws Exception {
        RestoreStaging.stage(f.root, f.zipFor(Kind.MANUAL, backupOfA.fileName()), Instant.now());
        applyAsNextStart(f);
        assertThat(f.state().students()).containsExactlyElementsOf(b.students());
        assertThat(f.root.resolve("backups/restore-pending/restore.json")).as("still staged, waiting for a yes").exists();
        assertThat(lastRestore(f)).isNull();
    }

    @Test
    void confirmingWithNothingStagedAndCancellingAreHandledCleanly() throws Exception {
        try {
            RestoreStaging.confirm(f.root, Instant.now());
            throw new AssertionError("expected a refusal");
        } catch (BackupException e) {
            assertThat(e.code()).isEqualTo("RESTORE_NOTHING_STAGED");
        }
        RestoreStaging.stage(f.root, f.zipFor(Kind.MANUAL, backupOfA.fileName()), Instant.now());
        assertThat(RestoreStaging.read(f.root)).get().extracting(RestoreStaging.Meta::state).isEqualTo(RestoreStaging.STAGED);
        RestoreStaging.discard(f.root);
        assertThat(RestoreStaging.read(f.root)).isEmpty();
        assertThat(f.root.resolve("backups/restore-pending")).doesNotExist();
    }

    @Test
    void aRefusedBackupLeavesNothingStagedNotEvenTheEarlierChoice() throws Exception {
        Path good = f.zipFor(Kind.MANUAL, backupOfA.fileName());
        RestoreStaging.stage(f.root, good, Instant.now());
        Path bad = f.root.resolve("garbage.zip");
        Files.writeString(bad, "not a zip", StandardCharsets.UTF_8);
        try {
            RestoreStaging.stage(f.root, bad, Instant.now());
            throw new AssertionError("expected a refusal");
        } catch (BackupException e) {
            assertThat(e.code()).isEqualTo("BACKUP_CORRUPT");
        }
        assertThat(f.root.resolve("backups/restore-pending")).as("the earlier staging is gone too: no stale choice survives").doesNotExist();
    }

    @Test
    void aBackupFromANewerProgramIsRefusedAtStagingSoItNeverReachesTheSwap() throws Exception {
        int newer = SchemaVersions.latestKnown() + 1;
        Path crafted = BackupFixture.craft(f.zipFor(Kind.MANUAL, backupOfA.fileName()), f.root.resolve("newer.zip"), e -> {
            try {
                e.put("school.db", BackupFixture.databaseWithMigration(e.get("school.db"), newer, f.root));
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            BackupFixture.fixManifest(e, newer);
        });
        try {
            RestoreStaging.stage(f.root, crafted, Instant.now());
            throw new AssertionError("expected a refusal");
        } catch (BackupException e) {
            assertThat(e.code()).isEqualTo("BACKUP_SCHEMA_NEWER");
        }
        assertThat(f.root.resolve("backups/restore-pending")).doesNotExist();
        assertThat(f.state().students()).as("the PC's own data was not touched").containsExactlyElementsOf(b.students());
    }

    @Test
    void anOlderBackupIsRestoredAsItIsAndLeftForFlywayToMigrateForward() throws Exception {
        try (BackupFixture old = new BackupFixture()) {
            old.seed("OLD", 2, 1, 3, 1);   // a database that only had migrations 1-3
            Item oldBackup = old.store().create(old.live(), Kind.MANUAL);
            assertThat(oldBackup.schemaVersion()).isEqualTo(3);
            Files.copy(old.zipFor(Kind.MANUAL, oldBackup.fileName()), f.root.resolve("backups/incoming/older.zip"));
            RestoreStaging.stage(f.root, f.root.resolve("backups/incoming/older.zip"), Instant.now());
            RestoreStaging.confirm(f.root, Instant.now());
        }
        applyAsNextStart(f);
        assertThat(f.state().students()).hasSize(2);
        try (var c = java.sql.DriverManager.getConnection("jdbc:sqlite:" + f.db().toAbsolutePath().toString().replace('\\', '/'))) {
            assertThat(SchemaVersions.of(c)).isEqualTo(3);
        }
        assertThat(lastRestore(f).ok()).isTrue();
    }

    // ---- when something is wrong ---------------------------------------------------------------------------------------

    @Test
    void aStagedFileDamagedAfterTheConfirmationIsNotApplied() throws Exception {
        stageAndConfirm(f, backupOfA);
        Path staged = f.root.resolve("backups/restore-pending/school.db");
        byte[] bytes = Files.readAllBytes(staged);
        bytes[bytes.length / 2] ^= 0x7f;
        Files.write(staged, bytes);
        applyAsNextStart(f);
        assertThat(f.state().students()).as("the PC keeps what it had").containsExactlyElementsOf(b.students());
        assertThat(f.state().photos()).isEqualTo(b.photos());
        assertThat(lastRestore(f).ok()).isFalse();
        assertThat(lastRestore(f).code()).isEqualTo("BACKUP_CHECKSUM_MISMATCH");
        assertThat(f.root.resolve("backups/restore-pending")).doesNotExist();
    }

    @Test
    void aCurrentDatabaseTooDamagedToBackUpIsKeptInAFolderNotDeleted() throws Exception {
        f.closeLive();
        for (String n : names(f.root.resolve("database"))) Files.delete(f.root.resolve("database").resolve(n));
        Files.writeString(f.db(), "this used to be a database", StandardCharsets.UTF_8);
        stageAndConfirm(f, backupOfA);
        applyAsNextStart(f);

        assertThat(f.state().students()).containsExactlyElementsOf(a.students());
        BackupHistory.Restore r = lastRestore(f);
        assertThat(r.ok()).isTrue();
        assertThat(r.safetyBackup()).as("it could not be backed up").isNull();
        assertThat(r.replacedFolder()).startsWith("replaced_");
        Path kept = f.root.resolve("backups").resolve(r.replacedFolder());
        assertThat(Files.readString(kept.resolve("database/school.db"), StandardCharsets.UTF_8)).isEqualTo("this used to be a database");
        try (Stream<Path> s = Files.walk(kept.resolve("uploads"))) {
            assertThat(s.filter(Files::isRegularFile).count()).as("B's photos are kept with it").isEqualTo(6);
        }
    }

    @Test
    void aFreshInstallWithNoAccountHasNothingToProtectSoNoSafetyBackupIsMade() throws Exception {
        f.seed("EMPTY", 0, 0, SchemaVersions.latestKnown(), 0);   // no administrator yet
        stageAndConfirm(f, backupOfA);
        applyAsNextStart(f);
        assertThat(f.state().students()).containsExactlyElementsOf(a.students());
        BackupHistory.Restore r = lastRestore(f);
        assertThat(r.ok()).isTrue();
        assertThat(r.safetyBackup()).isNull();
        assertThat(r.replacedFolder()).isNull();
        assertThat(f.store().list().stream().filter(i -> i.kind().equals("PRE_RESTORE"))).isEmpty();
        assertThat(names(f.root.resolve("backups"))).noneMatch(n -> n.startsWith("replaced_"));
    }

    // ---- the power goes out ------------------------------------------------------------------------------------------

    /** How many times the hook is called in an uninterrupted restore: the number of places the power can go out. */
    int stepsInACleanRestore() throws Exception {
        try (BackupFixture fx = new BackupFixture()) {
            prepare(fx);
            stageAndConfirm(fx, backupOfA);
            fx.closeLive();
            AtomicInteger n = new AtomicInteger();
            RestoreBootstrap.apply(fx.root, fx.clock, step -> n.incrementAndGet());
            return n.get();
        }
    }

    @Test
    void thePowerGoingOutAtAnyPointOfTheSwapLeavesAWholeSchool() throws Exception {
        int steps = stepsInACleanRestore();
        assertThat(steps).as("moves of the current files, the marker, the staged files, the finish").isGreaterThan(10);
        for (int crashAt = 1; crashAt <= steps; crashAt++) {
            try (BackupFixture fx = new BackupFixture()) {
                prepare(fx);
                stageAndConfirm(fx, backupOfA);
                fx.closeLive();
                AtomicInteger n = new AtomicInteger();
                AtomicInteger at = new AtomicInteger(crashAt);
                String[] where = new String[1];
                try {
                    RestoreBootstrap.apply(fx.root, fx.clock, step -> { if (n.incrementAndGet() == at.get()) { where[0] = step; throw new SimulatedCrash(step); } });
                    throw new AssertionError("no crash at step " + crashAt);
                } catch (SimulatedCrash expected) {
                    // the process "died" here
                }
                RestoreBootstrap.apply(fx.root, fx.clock, step -> { });   // the next start

                boolean restoreHadFinished = "finish".equals(where[0]);   // the files were all in place; only the clean-up was left
                BackupFixture.State now = fx.state();
                String label = "crash at step " + crashAt + " (" + where[0] + ")";
                assertThat(now.students()).as(label).containsExactlyElementsOf(restoreHadFinished ? a.students() : b.students());
                assertThat(now.photos()).as(label).isEqualTo(restoreHadFinished ? a.photos() : b.photos());
                assertThat(names(fx.root.resolve("database"))).as(label).containsExactly("school.db");
                assertThat(fx.root.resolve("backups/restore-pending")).as(label).doesNotExist();
                BackupHistory.Restore r = fx.store().history().load().lastRestore();
                assertThat(r.ok()).as(label).isEqualTo(restoreHadFinished);
                if (!restoreHadFinished) {
                    assertThat(r.code()).as(label).isEqualTo("RESTORE_INTERRUPTED");
                    // and trying again works
                    stageAndConfirm(fx, backupOfA);
                    fx.closeLive();
                    RestoreBootstrap.apply(fx.root, fx.clock, step -> { });
                    assertThat(fx.state().students()).as(label + ", then retried").containsExactlyElementsOf(a.students());
                    assertThat(fx.state().photos()).as(label + ", then retried").isEqualTo(a.photos());
                }
            }
        }
    }

    @Test
    void thePowerGoingOutWhileTheOriginalsAreBeingPutBackStillEndsWithTheOriginals() throws Exception {
        int movesBack = 0;
        for (int crashAt = 1; crashAt <= 20; crashAt++) {
            try (BackupFixture fx = new BackupFixture()) {
                prepare(fx);
                stageAndConfirm(fx, backupOfA);
                fx.closeLive();
                try {   // first start: dies right after the current files were moved aside
                    RestoreBootstrap.apply(fx.root, fx.clock, step -> { if (step.equals("current-moved")) throw new SimulatedCrash(step); });
                    throw new AssertionError("no crash");
                } catch (SimulatedCrash expected) {
                    assertThat(fx.root.resolve("database/school.db")).as("the database really is out of its place").doesNotExist();
                }
                AtomicInteger back = new AtomicInteger();
                final int target = crashAt;
                boolean crashed = false;
                try {   // second start: starts putting them back and dies again
                    RestoreBootstrap.apply(fx.root, fx.clock, step -> { if (step.equals("back") && back.incrementAndGet() == target) throw new SimulatedCrash(step); });
                } catch (SimulatedCrash expected) {
                    crashed = true;
                }
                RestoreBootstrap.apply(fx.root, fx.clock, step -> { });   // third start: finishes the job
                assertThat(fx.state().students()).as("second crash after " + crashAt + " moves back").containsExactlyElementsOf(b.students());
                assertThat(fx.state().photos()).as("second crash after " + crashAt + " moves back").isEqualTo(b.photos());
                assertThat(fx.root.resolve("backups/restore-pending")).doesNotExist();
                assertThat(fx.store().history().load().lastRestore().ok()).isFalse();
                if (!crashed) { movesBack = crashAt - 1; break; }
            }
        }
        assertThat(movesBack).as("the sweep covered every file being put back (database + photos)").isGreaterThanOrEqualTo(7);
    }
}
