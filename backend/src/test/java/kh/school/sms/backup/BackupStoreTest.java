package kh.school.sms.backup;

import kh.school.sms.backup.BackupHistory.Item;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.FileTime;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/** The backups on disk: names, folders, rotation, the last good backup, copies on a USB stick, the history file. */
class BackupStoreTest {
    BackupFixture f;
    BackupStore store;

    @BeforeEach
    void setUp() throws Exception {
        f = new BackupFixture();
        f.seed("A", 3, 2);
        store = f.store();
    }

    @AfterEach
    void tearDown() throws Exception { f.close(); }

    Item make(Kind kind) throws Exception {
        Item i = store.create(f.live(), kind);
        f.clock.advance(Duration.ofMinutes(1));
        return i;
    }

    long count(Path dir) throws Exception {
        try (Stream<Path> s = Files.list(dir)) { return s.filter(p -> p.getFileName().toString().endsWith(".zip")).count(); }
    }

    static void flipAByte(Path zip) throws Exception {
        byte[] b = Files.readAllBytes(zip);
        b[b.length / 2] ^= 0x10;
        Files.write(zip, b);
    }

    @Test
    void namesFollowTheSchoolBackupPatternAndEachKindGoesToItsFolder() throws Exception {
        Item manual = store.create(f.live(), Kind.MANUAL);
        Item auto = store.create(f.live(), Kind.AUTO);   // the same second: the name moves on instead of overwriting
        assertThat(BackupStore.idOf(manual.fileName())).matches(BackupStore.ID);
        assertThat(BackupStore.idOf(auto.fileName())).matches(BackupStore.ID);
        assertThat(auto.fileName()).isNotEqualTo(manual.fileName());
        assertThat(f.root.resolve("backups").resolve(manual.fileName())).isRegularFile();
        assertThat(f.root.resolve("backups/auto").resolve(auto.fileName())).isRegularFile();
        assertThat(f.root.resolve("config/backup-history.json")).as("the history is a file, outside the database").isRegularFile();
        assertThat(store.list()).extracting(Item::fileName).containsExactlyInAnyOrder(manual.fileName(), auto.fileName());
        assertThat(manual.verifiedAt()).as("verified right after it was made").isNotNull();
    }

    @Test
    void automaticBackupsRotateByKindAndManualOnesNeverDo() throws Exception {
        for (int i = 0; i < 12; i++) make(Kind.AUTO);
        for (int i = 0; i < 7; i++) make(Kind.PRE_MIGRATION);
        for (int i = 0; i < 5; i++) make(Kind.PRE_RESTORE);
        for (int i = 0; i < 12; i++) make(Kind.MANUAL);
        List<Item> all = store.list();
        assertThat(all.stream().filter(i -> i.kind().equals("AUTO"))).hasSize(10);
        assertThat(all.stream().filter(i -> i.kind().equals("PRE_MIGRATION"))).hasSize(5);
        assertThat(all.stream().filter(i -> i.kind().equals("PRE_RESTORE"))).hasSize(3);
        assertThat(all.stream().filter(i -> i.kind().equals("MANUAL"))).as("manual backups are the user's own").hasSize(12);
        assertThat(count(f.root.resolve("backups/auto"))).isEqualTo(18);
        assertThat(count(f.root.resolve("backups"))).isEqualTo(12);
        // what is kept is the NEWEST
        List<Item> auto = all.stream().filter(i -> i.kind().equals("AUTO")).toList();
        assertThat(auto.get(0).createdAt()).isGreaterThan(auto.get(auto.size() - 1).createdAt());
    }

    @Test
    void rotationNeverRemovesTheLastVerifiedBackupNorAFileThisProgramDidNotMake() throws Exception {
        Item good = make(Kind.AUTO);   // the only backup that is verified
        // ten newer files that this program did not make (not verified, not in the history): they fill the window of ten
        for (int i = 1; i <= 10; i++) {
            Path p = f.root.resolve("backups/auto").resolve("SchoolBackup_2099-01-01_00-00-" + String.format("%02d", i) + ".zip");
            Files.writeString(p, "not a real backup", StandardCharsets.UTF_8);
            Files.setLastModifiedTime(p, FileTime.from(Instant.now().plus(Duration.ofDays(1)).plusSeconds(i)));
        }
        assertThat(store.list()).hasSize(11);
        assertThat(store.rotate()).as("the old verified one is outside the window of ten, yet kept; the strangers are never deleted").isZero();
        assertThat(f.root.resolve("backups/auto").resolve(good.fileName())).isRegularFile();
        assertThat(count(f.root.resolve("backups/auto"))).isEqualTo(11);
    }

    @Test
    void theLastVerifiedBackupCannotBeDeletedAndAnyOtherCan() throws Exception {
        Item first = make(Kind.MANUAL);
        Item second = make(Kind.MANUAL);
        assertThat(store.lastVerified()).get().extracting(Item::fileName).isEqualTo(second.fileName());
        assertCode("BACKUP_LAST_VERIFIED", () -> store.delete(BackupStore.idOf(second.fileName())));
        store.delete(BackupStore.idOf(first.fileName()));
        assertThat(store.list()).extracting(Item::fileName).containsExactly(second.fileName());
        assertThat(store.history().load().entries()).as("the history forgets a file that is gone").extracting(Item::fileName).containsExactly(second.fileName());
        assertCode("BACKUP_NOT_FOUND", () -> store.delete(BackupStore.idOf(first.fileName())));
        assertCode("BACKUP_NOT_FOUND", () -> store.delete("../../config/backup-history"));
    }

    @Test
    void aDamagedBackupStaysListedButStopsCountingAsGood() throws Exception {
        Item first = make(Kind.MANUAL);
        Item second = make(Kind.MANUAL);
        flipAByte(f.zipFor(Kind.MANUAL, second.fileName()));
        Item checked = store.verify(BackupStore.idOf(second.fileName()));
        assertThat(checked.verifyError()).isEqualTo("BACKUP_CHECKSUM_MISMATCH");
        assertThat(checked.verifiedAt()).isNull();
        assertThat(store.list()).extracting(Item::fileName).contains(second.fileName());
        assertThat(store.lastVerified()).get().extracting(Item::fileName).as("the older, intact backup is now the last good one").isEqualTo(first.fileName());
        store.delete(BackupStore.idOf(second.fileName()));   // not the last verified any more: may go
        assertCode("BACKUP_LAST_VERIFIED", () -> store.delete(BackupStore.idOf(first.fileName())));
    }

    @Test
    void aCopyOnAUsbStickIsRecordedOnlyWithTheRightHash() throws Exception {
        Item b = make(Kind.MANUAL);
        String id = BackupStore.idOf(b.fileName());
        assertThat(store.history().load().lastExternalCopyAt()).isNull();
        assertCode("BACKUP_COPY_MISMATCH", () -> store.recordExternalCopy(id, "0".repeat(64)));
        assertCode("BACKUP_COPY_MISMATCH", () -> store.recordExternalCopy(id, null));
        assertThat(store.history().load().lastExternalCopyAt()).as("a wrong hash records nothing").isNull();
        Item copied = store.recordExternalCopy(id, BackupArchive.sha256(f.zipFor(Kind.MANUAL, b.fileName())));
        assertThat(copied.externalCopyAt()).isNotNull();
        assertThat(store.history().load().lastExternalCopyAt()).isEqualTo(copied.externalCopyAt());
        assertCode("BACKUP_NOT_FOUND", () -> store.recordExternalCopy("SchoolBackup_2000-01-01_00-00-00", "0".repeat(64)));
    }

    @Test
    void anAutomaticBackupIsDueWhenThereIsNoneOrTheNewestIsADayOld() throws Exception {
        assertThat(store.autoDue()).isTrue();
        store.create(f.live(), Kind.MANUAL);
        assertThat(store.autoDue()).isFalse();
        f.clock.advance(Duration.ofHours(23));
        assertThat(store.autoDue()).isFalse();
        f.clock.advance(Duration.ofHours(2));
        assertThat(store.autoDue()).isTrue();
    }

    @Test
    void theLocalStateIsOkOldOrNoneFromTheNewestGoodBackup() throws Exception {
        // the owner's policy of 2026-11-05: local backups are the primary method; the state is what the dashboard and the backup page warn about
        BackupStore.LocalStatus none = store.localStatus();
        assertThat(none.state()).as("no backup at all").isEqualTo(BackupStore.LocalState.NONE);
        assertThat(none.lastGoodAt()).isNull();
        assertThat(none.ageHours()).isNull();
        assertThat(store.autoDue()).isTrue();

        Item first = store.create(f.live(), Kind.MANUAL);
        BackupStore.LocalStatus fresh = store.localStatus();
        assertThat(fresh.state()).isEqualTo(BackupStore.LocalState.OK);
        assertThat(fresh.ageHours()).isZero();
        assertThat(fresh.lastGoodAt()).isEqualTo(first.createdAt());
        f.clock.advance(Duration.ofHours(23).plusMinutes(59));
        assertThat(store.localStatus().state()).as("not yet a day").isEqualTo(BackupStore.LocalState.OK);
        assertThat(store.localStatus().ageHours()).isEqualTo(23);
        f.clock.advance(Duration.ofMinutes(1));
        assertThat(store.localStatus().state()).as("24 hours: old, and an automatic backup is due when the program closes").isEqualTo(BackupStore.LocalState.OLD);
        assertThat(store.localStatus().ageHours()).isEqualTo(24);
        assertThat(store.autoDue()).isTrue();

        // a newer backup that is found damaged is not a backup: the older good one still decides
        Item second = store.create(f.live(), Kind.MANUAL);
        assertThat(store.localStatus().state()).isEqualTo(BackupStore.LocalState.OK);
        flipAByte(f.zipFor(Kind.MANUAL, second.fileName()));
        assertThat(store.verify(BackupStore.idOf(second.fileName())).verifyError()).isNotNull();
        assertThat(store.localStatus().state()).as("the damaged one no longer counts: the old good one is all there is").isEqualTo(BackupStore.LocalState.OLD);
        assertThat(store.localStatus().lastGoodAt()).isEqualTo(first.createdAt());
        assertThat(store.autoDue()).as("a damaged newest file does not keep the automatic backup away").isTrue();
    }

    @Test
    void aReminderLimitOfZeroSwitchesTheUsbReminderOff() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        Item item = new Item("SchoolBackup_2026-01-01_00-00-00.zip", "MANUAL", t0.toString(), 1, "0".repeat(64), 5, "0.1.0", t0.toString(), null, null);
        BackupHistory.Data neverCopied = new BackupHistory.Data(1, t0.toString(), List.of(item), null, null);
        BackupStore.Reminder off = BackupStore.reminder(List.of(item), neverCopied, t0.plus(Duration.ofDays(400)), 0);
        assertThat(off.overdue()).as("a USB copy is optional: with the reminder off nothing is ever overdue").isFalse();
        assertThat(off.never()).as("the fact that there is no copy is still known").isTrue();
        assertThat(off.reminderDays()).isZero();
        assertThat(BackupStore.reminder(List.of(item), neverCopied, t0.plus(Duration.ofDays(400)), 7).overdue()).as("switched on, it still works").isTrue();
    }

    @Test
    void theReminderCountsFromTheLastCopyElsewhereOrFromWhenTheHistoryBeganAndNeverNagsWithoutABackup() {
        Instant t0 = Instant.parse("2026-01-01T00:00:00Z");
        Item item = new Item("SchoolBackup_2026-01-01_00-00-00.zip", "MANUAL", t0.toString(), 1, "0".repeat(64), 5, "0.1.0", t0.toString(), null, null);
        BackupHistory.Data neverCopied = new BackupHistory.Data(1, t0.toString(), List.of(item), null, null);

        BackupStore.Reminder fresh = BackupStore.reminder(List.of(item), neverCopied, t0.plus(Duration.ofDays(7)), 7);
        assertThat(fresh.overdue()).as("exactly 7 days is not yet MORE than 7").isFalse();
        assertThat(fresh.never()).isTrue();
        assertThat(BackupStore.reminder(List.of(item), neverCopied, t0.plus(Duration.ofDays(8)), 7).overdue()).isTrue();
        assertThat(BackupStore.reminder(List.of(item), neverCopied, t0.plus(Duration.ofDays(8)), 30).overdue()).as("the school chose 30 days").isFalse();

        BackupHistory.Data copied = new BackupHistory.Data(1, t0.toString(), List.of(item), t0.plus(Duration.ofDays(5)).toString(), null);
        BackupStore.Reminder later = BackupStore.reminder(List.of(item), copied, t0.plus(Duration.ofDays(11)), 7);
        assertThat(later.days()).isEqualTo(6);
        assertThat(later.overdue()).isFalse();
        assertThat(later.never()).isFalse();
        assertThat(BackupStore.reminder(List.of(item), copied, t0.plus(Duration.ofDays(13)), 7).overdue()).isTrue();

        BackupStore.Reminder nothing = BackupStore.reminder(List.of(), BackupHistory.Data.empty(), t0.plus(Duration.ofDays(400)), 7);
        assertThat(nothing.anyBackup()).isFalse();
        assertThat(nothing.overdue()).as("no backup at all is a different message, not an overdue copy").isFalse();
        assertThat(BackupStore.reminder(List.of(item), BackupHistory.Data.empty(), t0.plus(Duration.ofDays(400)), 7).overdue())
                .as("backup files with no history at all: no anchor, no nagging").isFalse();
    }

    @Test
    void whatAKilledBackupLeftBehindIsSweptButAFreshIncomingFileIsKept() throws Exception {
        Files.createDirectories(f.root.resolve("backups/tmp/backup-123"));
        Files.writeString(f.root.resolve("backups/tmp/backup-123/school.db"), "x");
        Files.writeString(f.root.resolve("backups/SchoolBackup_2026-01-01_00-00-00.zip.part"), "x");
        Files.writeString(f.root.resolve("backups/auto/SchoolBackup_2026-01-01_00-00-01.zip.part"), "x");
        Path oldIncoming = f.root.resolve("backups/incoming/incoming-1.zip");
        Path freshIncoming = f.root.resolve("backups/incoming/incoming-2.zip");
        Files.writeString(oldIncoming, "x");
        Files.writeString(freshIncoming, "x");
        Files.setLastModifiedTime(oldIncoming, FileTime.from(Instant.now().minus(Duration.ofDays(3))));
        BackupStore.cleanLeftovers(f.root);
        assertThat(f.root.resolve("backups/tmp")).doesNotExist();
        assertThat(f.root.resolve("backups/SchoolBackup_2026-01-01_00-00-00.zip.part")).doesNotExist();
        assertThat(f.root.resolve("backups/auto/SchoolBackup_2026-01-01_00-00-01.zip.part")).doesNotExist();
        assertThat(oldIncoming).doesNotExist();
        assertThat(freshIncoming).exists();
    }

    @Test
    void aBrokenHistoryFileIsSetAsideAndTheBackupsAreStillThere() throws Exception {
        Item b = make(Kind.MANUAL);
        Files.writeString(f.root.resolve("config/backup-history.json"), "{ this is not json", StandardCharsets.UTF_8);
        List<Item> listed = store.list();
        assertThat(listed).extracting(Item::fileName).containsExactly(b.fileName());
        assertThat(listed.get(0).verifiedAt()).as("what the history knew is lost, the file is not").isNull();
        assertThat(f.root.resolve("config/backup-history.json.bad")).exists();
        assertThat(store.verify(BackupStore.idOf(b.fileName())).verifiedAt()).as("verifying adopts it back").isNotNull();
    }

    @Test
    void aBackupMadeElsewhereAndDroppedIntoTheFolderIsListedUnverifiedUntilItIsChecked() throws Exception {
        Item made = make(Kind.MANUAL);
        Path dropped = f.root.resolve("backups/SchoolBackup_2030-05-05_10-10-10.zip");
        Files.copy(f.zipFor(Kind.MANUAL, made.fileName()), dropped);
        Item seen = store.find("SchoolBackup_2030-05-05_10-10-10").orElseThrow();
        assertThat(seen.verifiedAt()).isNull();
        assertThat(seen.sha256()).isNull();
        Item checked = store.verify("SchoolBackup_2030-05-05_10-10-10");
        assertThat(checked.verifiedAt()).isNotNull();
        assertThat(checked.sha256()).isEqualTo(BackupArchive.sha256(dropped));
        assertThat(checked.schemaVersion()).isEqualTo(SchemaVersions.latestKnown());
    }

    @Test
    void theSpaceEstimateGrowsWithThePhotosAndHasAMargin() throws Exception {
        long before = store.requiredBytes();
        Files.write(f.root.resolve("uploads/students/photo-big.jpg"), new byte[3_000_000]);
        assertThat(store.requiredBytes() - before).isEqualTo(3_000_000);
        assertThat(before).isGreaterThanOrEqualTo(64L << 20);
        assertThat(store.freeBytes()).isPositive();
    }

    // ---- helpers ------------------------------------------------------------------------------------------------------

    static void assertCode(String code, Runnable call) {
        try {
            call.run();
        } catch (BackupException e) {
            assertThat(e.code()).isEqualTo(code);
            return;
        }
        throw new AssertionError("expected " + code);
    }
}
