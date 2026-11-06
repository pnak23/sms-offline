package kh.school.sms.backup;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The backup file itself: what goes in, that it reads back exactly, and that anything else is refused with a stable code.
 * Every test runs in a data folder whose name has Khmer characters and a space.
 */
class BackupArchiveTest {
    BackupFixture f;
    Path zip;

    @BeforeEach
    void setUp() throws Exception {
        f = new BackupFixture();
        f.seed("A", 5, 4);
        zip = f.root.resolve("backups").resolve("SchoolBackup_2026-01-01_00-00-00.zip");
        BackupArchive.create(f.live(), f.root, zip, Kind.MANUAL, Instant.parse("2026-01-01T00:00:00Z"), "0.1.0");
    }

    @AfterEach
    void tearDown() throws Exception { f.close(); }

    /** The code a backup is refused with; fails the test when it is accepted. */
    String refused(Path file) {
        try {
            BackupArchive.verify(file, f.root.resolve("check-" + System.nanoTime()), true);
        } catch (BackupException e) {
            return e.code();
        }
        throw new AssertionError(file.getFileName() + " was accepted");
    }

    Path crafted(String name, java.util.function.Consumer<Map<String, byte[]>> change) throws Exception {
        return BackupFixture.craft(zip, f.root.resolve(name), change);
    }

    String firstPhoto(Map<String, byte[]> entries) { return entries.keySet().stream().filter(n -> n.startsWith("uploads/students/")).findFirst().orElseThrow(); }

    // ---- what goes in, and that it reads back exactly ----------------------------------------------------------------

    @Test
    void everyRowAndEveryPhotoComesBackExactlyAndNothingIsLeftBehind() throws Exception {
        BackupArchive.Summary s = BackupArchive.verify(zip, f.root.resolve("check"), true);
        assertThat(s.students()).isEqualTo(5);
        assertThat(s.teachers()).as("an empty table is 0, not 'missing'").isZero();
        assertThat(s.photos()).isEqualTo(4);
        assertThat(s.manifest().schemaVersion()).isEqualTo(SchemaVersions.latestKnown());
        assertThat(s.manifest().app()).isEqualTo(BackupArchive.APP_ID);

        BackupFixture.State original = f.state();
        BackupFixture.State restored = BackupFixture.stateOf(f.root.resolve("check").resolve("school.db"), f.root.resolve("check/uploads/students"));
        assertThat(restored.students()).containsExactlyElementsOf(original.students());
        assertThat(restored.photos()).as("every photo, byte for byte").isEqualTo(original.photos());

        assertThat(Files.exists(zip.resolveSibling(zip.getFileName() + ".part"))).isFalse();
        try (Stream<Path> tmp = Files.list(f.root.resolve("backups/tmp"))) { assertThat(tmp.toList()).as("work folders are removed").isEmpty(); }
        try (Stream<Path> top = Files.list(f.root.resolve("check"))) {
            assertThat(top.map(p -> p.getFileName().toString()).sorted().toList()).as("no -wal / -shm files from opening the copy").containsExactly("school.db", "uploads");
        }
    }

    @Test
    void theSnapshotHoldsWhatWasCommittedEvenWhileTheDatabaseIsInWalMode() throws Exception {
        try (Connection other = DriverManager.getConnection("jdbc:sqlite:" + f.db().toAbsolutePath().toString().replace('\\', '/'));
             Statement st = other.createStatement()) {
            st.execute("INSERT INTO students VALUES (100, 'សិស្ស-ថ្មី-1')");
            st.execute("INSERT INTO students VALUES (101, 'សិស្ស-ថ្មី-2')");
        }
        Path second = f.root.resolve("backups").resolve("SchoolBackup_2026-01-01_00-00-01.zip");
        BackupArchive.Created c = BackupArchive.create(f.live(), f.root, second, Kind.MANUAL, Instant.parse("2026-01-01T00:00:01Z"), "0.1.0");
        assertThat(c.summary().students()).isEqualTo(7);
    }

    @Test
    void aFailedBackupLeavesNoHalfWrittenFileUnderAnyName() throws Exception {
        Connection closed = DriverManager.getConnection("jdbc:sqlite:" + f.db().toAbsolutePath().toString().replace('\\', '/'));
        closed.close();
        Path target = f.root.resolve("backups").resolve("SchoolBackup_2026-02-02_00-00-00.zip");
        assertThatThrownBy(() -> BackupArchive.create(closed, f.root, target, Kind.MANUAL, Instant.now(), "0.1.0"))
                .isInstanceOfSatisfying(BackupException.class, e -> assertThat(e.code()).isEqualTo("BACKUP_FAILED"));
        assertThat(Files.exists(target)).isFalse();
        assertThat(Files.exists(target.resolveSibling(target.getFileName() + ".part"))).isFalse();
    }

    // ---- refusals -----------------------------------------------------------------------------------------------------

    @Test
    void aZipThatIsCutShortOrIsNotAZipAtAllIsRefusedAsCorrupt() throws Exception {
        byte[] whole = Files.readAllBytes(zip);
        Path cut = f.root.resolve("cut.zip");
        Files.write(cut, java.util.Arrays.copyOf(whole, whole.length - 200));
        assertThat(refused(cut)).isEqualTo("BACKUP_CORRUPT");

        Path text = f.root.resolve("notes.zip");
        Files.writeString(text, "this is not a zip file at all", StandardCharsets.UTF_8);
        assertThat(refused(text)).isEqualTo("BACKUP_CORRUPT");

        Path empty = f.root.resolve("empty.zip");
        Files.write(empty, new byte[0]);
        assertThat(refused(empty)).isEqualTo("BACKUP_CORRUPT");

        assertThat(refused(f.root.resolve("missing.zip"))).isEqualTo("BACKUP_NOT_A_BACKUP");
    }

    @Test
    void aFlippedBitInsideAnEntryIsCaughtWhateverTheZipSays() throws Exception {
        byte[] whole = Files.readAllBytes(zip);
        whole[whole.length / 3] ^= 0x40;   // somewhere in the entry data
        Path bad = f.root.resolve("bitrot.zip");
        Files.write(bad, whole);
        assertThat(refused(bad)).isIn("BACKUP_CORRUPT", "BACKUP_CHECKSUM_MISMATCH", "BACKUP_DATABASE_DAMAGED");
    }

    @Test
    void aPhotoChangedWithoutUpdatingTheManifestIsAChecksumMismatch() throws Exception {
        Path bad = crafted("tampered.zip", e -> {
            String photo = firstPhoto(e);
            byte[] b = e.get(photo).clone();
            b[10] ^= 1;   // same size, one bit different
            e.put(photo, b);
        });
        assertThat(refused(bad)).isEqualTo("BACKUP_CHECKSUM_MISMATCH");
    }

    @Test
    void anEntryBiggerThanTheManifestSaysIsStoppedAtThatSize() throws Exception {
        Path bad = crafted("bomb.zip", e -> {
            String photo = firstPhoto(e);
            e.put(photo, new byte[3_000_000]);   // the manifest still says a few KB
        });
        long t0 = System.nanoTime();
        assertThat(refused(bad)).isEqualTo("BACKUP_CHECKSUM_MISMATCH");
        assertThat((System.nanoTime() - t0) / 1_000_000).as("refused without reading it all").isLessThan(5000);
    }

    @Test
    void aBackupFromANewerProgramIsRefusedWhateverItsManifestClaims() throws Exception {
        int newer = SchemaVersions.latestKnown() + 1;
        Path honest = crafted("newer.zip", e -> {
            try {
                e.put("school.db", BackupFixture.databaseWithMigration(e.get("school.db"), newer, f.root));
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            BackupFixture.fixManifest(e, newer);
        });
        assertThat(refused(honest)).isEqualTo("BACKUP_SCHEMA_NEWER");

        Path lying = crafted("newer-lying.zip", e -> {
            try {
                e.put("school.db", BackupFixture.databaseWithMigration(e.get("school.db"), newer, f.root));
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            BackupFixture.fixManifest(e, 1);   // the manifest claims an old schema; the database inside is the truth
        });
        assertThat(refused(lying)).isEqualTo("BACKUP_SCHEMA_NEWER");

        Path inconsistent = crafted("inconsistent.zip", e -> BackupFixture.fixManifest(e, newer));   // manifest says newer, the database is not
        assertThat(refused(inconsistent)).isEqualTo("BACKUP_NOT_A_BACKUP");
    }

    @Test
    void strayOrPathLikeEntriesAreRefusedAndNothingIsWrittenOutsideTheTargetFolder() throws Exception {
        Map<String, java.util.function.Consumer<Map<String, byte[]>>> bad = new java.util.LinkedHashMap<>();
        bad.put("parent", e -> { e.put("../evil.txt", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("deep", e -> { e.put("uploads/students/../../evil.jpg", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("absolute", e -> { e.put("/evil.txt", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("drive", e -> { e.put("C:/evil.txt", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("backslash", e -> { e.put("uploads\\students\\evil.jpg", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("odd-name", e -> { e.put("uploads/students/.hidden", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("other-folder", e -> { e.put("uploads/other/photo-x.jpg", "x".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        bad.put("unlisted", e -> e.put("uploads/students/photo-unlisted.jpg", "x".getBytes(StandardCharsets.UTF_8)));   // manifest not updated
        bad.put("no-database", e -> { e.remove("school.db"); BackupFixture.fixManifest(e, null); });
        bad.put("no-manifest", e -> e.remove(BackupArchive.MANIFEST));
        bad.put("foreign-manifest", e -> {
            String m = new String(e.get(BackupArchive.MANIFEST), StandardCharsets.UTF_8).replace("\"" + BackupArchive.APP_ID + "\"", "\"some-other-program\"");
            e.put(BackupArchive.MANIFEST, m.getBytes(StandardCharsets.UTF_8));
        });
        bad.put("garbage-manifest", e -> e.put(BackupArchive.MANIFEST, "{ not json".getBytes(StandardCharsets.UTF_8)));
        for (var c : bad.entrySet()) {
            Path file = crafted("bad-" + c.getKey() + ".zip", c.getValue());
            assertThat(refused(file)).as(c.getKey()).isEqualTo("BACKUP_NOT_A_BACKUP");
        }
        for (String name : List.of("evil.txt", "evil.jpg")) {
            assertThat(f.root.resolve(name)).doesNotExist();
            assertThat(f.root.getParent().resolve(name)).doesNotExist();
        }
        try (Stream<Path> s = Files.walk(f.root)) {
            assertThat(s.map(p -> p.getFileName().toString()).filter(n -> List.of("evil.txt", "evil.jpg", ".hidden", "photo-unlisted.jpg", "photo-x.jpg").contains(n)).toList())
                    .as("a refused zip leaves nothing of its stray entries on disk").isEmpty();
        }
    }

    @Test
    void aDatabaseThatIsNotSqliteOrIsBrokenIsRefusedEvenWithAMatchingManifest() throws Exception {
        Path garbage = crafted("garbage-db.zip", e -> { e.put("school.db", "this is not a database".getBytes(StandardCharsets.UTF_8)); BackupFixture.fixManifest(e, null); });
        assertThat(refused(garbage)).isEqualTo("BACKUP_DATABASE_DAMAGED");

        Path headerOnly = crafted("header-only.zip", e -> {
            byte[] b = new byte[8192];
            System.arraycopy("SQLite format 3\0".getBytes(StandardCharsets.ISO_8859_1), 0, b, 0, 16);
            e.put("school.db", b);
            BackupFixture.fixManifest(e, null);
        });
        assertThat(refused(headerOnly)).isEqualTo("BACKUP_DATABASE_DAMAGED");

        Path notOurs = crafted("not-ours.zip", e -> {
            try {
                Path other = f.root.resolve("other.db");
                try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + other.toAbsolutePath().toString().replace('\\', '/')); Statement st = c.createStatement()) {
                    st.execute("CREATE TABLE something (id INTEGER)");
                    st.execute("PRAGMA journal_mode=DELETE");
                }
                e.put("school.db", Files.readAllBytes(other));
                Files.delete(other);
            } catch (Exception ex) { throw new IllegalStateException(ex); }
            BackupFixture.fixManifest(e, null);
        });
        assertThat(refused(notOurs)).as("a SQLite file with no migration history").isEqualTo("BACKUP_NOT_A_BACKUP");
    }

    @Test
    void verifyingWithoutExtractingUploadsWritesOnlyTheDatabase() throws Exception {
        Path out = f.root.resolve("only-db");
        BackupArchive.verify(zip, out, false);
        try (Stream<Path> s = Files.walk(out)) {
            assertThat(s.filter(Files::isRegularFile).map(p -> p.getFileName().toString()).toList()).containsExactly("school.db");
        }
    }
}
