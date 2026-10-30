package spike;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

class PersistenceSpikeTest extends SpikeBase {

    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource ds;
    @Autowired PlatformTransactionManager txm;
    @Autowired AppUserRepository users;
    @Autowired SequenceService sequences;

    private static AppUser user(String username, String displayName) {
        AppUser u = new AppUser();
        u.setUsername(username);
        u.setDisplayName(displayName);
        u.setPasswordHash("hash");
        u.setRecoveryKeyHash("rhash");
        Instant now = Instant.parse("2026-10-30T08:15:30Z");
        u.setPasswordChangedAt(now);
        u.setRecoveryKeyCreatedAt(now);
        u.setCreatedAt(now);
        u.setUpdatedAt(now);
        return u;
    }

    @Test
    void flywayAppliedRealMigrationsAndSpikeRebuild() {
        List<Map<String, Object>> rows = jdbc.queryForList("select version, success from flyway_schema_history order by installed_rank");
        say("flyway history = " + rows);
        assertThat(rows).extracting(r -> r.get("version")).containsExactly("1", "2", "100", "101");
        assertThat(rows).allSatisfy(r -> assertThat(((Number) r.get("success")).intValue()).isEqualTo(1));
    }

    @Test
    void khmerSeedsAreIntact() {
        String grade1 = jdbc.queryForObject("select name_km from grades where level = 1", String.class);
        Integer grades = jdbc.queryForObject("select count(*) from grades", Integer.class);
        Integer subjects = jdbc.queryForObject("select count(*) from subjects", Integer.class);
        Integer active = jdbc.queryForObject("select count(*) from subjects where is_active = 1", Integer.class);
        String moral = jdbc.queryForObject("select name_km from subjects where code = 'MORAL'", String.class);
        say("seeds: grades=" + grades + ", subjects=" + subjects + " (active " + active + ")");
        assertThat(grade1).isEqualTo("ថ្នាក់ទី១");
        assertThat(moral).isEqualTo("សីលធម៌-ពលរដ្ឋវិជ្ជា");
        assertThat(grades).isEqualTo(6);
        assertThat(subjects).isEqualTo(8);
        assertThat(active).isEqualTo(7);
    }

    @Test
    void rebuildOfReferencedTableKeptDataAndForeignKeysClean() {
        Integer children = jdbc.queryForObject("select count(*) from spike_child", Integer.class);
        String name = jdbc.queryForObject("select name from spike_parent where code = 'P-1'", String.class);
        jdbc.queryForList("select extra from spike_parent"); // column added by the rebuild
        List<Map<String, Object>> violations = jdbc.queryForList("PRAGMA foreign_key_check");
        say("after rebuild: children=" + children + ", fk violations=" + violations.size());
        assertThat(children).isEqualTo(1);
        assertThat(name).isEqualTo("សុខ ចាន់ណា");
        assertThat(violations).isEmpty();
    }

    @Test
    void fkAssertionTrapsViolationsAndPassesWhenClean() throws Exception {
        Path f = tempFile("s2-assert-", ".db");
        String assertSql = "INSERT INTO _fk_assert SELECT count(*) FROM pragma_foreign_key_check";
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + fwd(f)); Statement st = c.createStatement()) {
            st.execute("create table p(id integer primary key)");
            st.execute("create table ch(id integer primary key, pid integer references p(id))");
            st.execute("create temp table _fk_assert(violations integer not null check (violations = 0))");
            st.execute("insert into p(id) values (1)");
            st.execute("insert into ch(pid) values (1)");
            st.execute(assertSql);
            st.execute("insert into ch(pid) values (42)");
            Throwable t = catchThrowable(() -> st.execute(assertSql));
            say("FK assertion trapped orphan: " + (t != null));
            assertThat((Object) t).isNotNull();
        }
    }

    @Test
    void pragmasOnEveryPooledConnection() throws Exception {
        List<Connection> held = new ArrayList<>();
        try {
            for (int i = 0; i < 4; i++) held.add(ds.getConnection());
            List<String> report = new ArrayList<>();
            for (Connection c : held) {
                try (Statement st = c.createStatement()) {
                    String line = "fk=" + scalar(st, "PRAGMA foreign_keys") + ",journal=" + scalar(st, "PRAGMA journal_mode")
                            + ",busy=" + scalar(st, "PRAGMA busy_timeout");
                    report.add(line);
                    assertThat(line).isEqualTo("fk=1,journal=wal,busy=5000");
                }
            }
            say("pooled pragmas: " + report);
        } finally {
            for (Connection c : held) c.close();
        }
    }

    @Test
    void constraintViolationsAreClassified() {
        users.saveAndFlush(user("dupuser", "ក"));
        Throwable unique = catchThrowable(() -> users.saveAndFlush(user("dupuser", "ខ")));
        Throwable fk = catchThrowable(() -> jdbc.update("insert into spike_child(parent_id, status) values (999999, 'ACTIVE')"));
        Throwable restrict = catchThrowable(() -> jdbc.update("delete from spike_parent where code = 'P-1'"));
        Throwable check = catchThrowable(() -> jdbc.update("insert into school_settings(id, created_at, updated_at) values (2, 'a', 'a')"));
        Throwable notNull = catchThrowable(() -> jdbc.update("insert into subjects(code, created_at, updated_at) values ('X1', 'a', 'a')"));
        var u = SqliteConstraints.find(unique).orElseThrow();
        var f = SqliteConstraints.find(fk).orElseThrow();
        var r = SqliteConstraints.find(restrict).orElseThrow();
        var c = SqliteConstraints.find(check).orElseThrow();
        var n = SqliteConstraints.find(notNull).orElseThrow();
        say("classified: unique=" + u + " fk=" + f.kind() + " restrict=" + r.kind() + " check=" + c.kind() + " notnull=" + n);
        assertThat(u.kind()).isEqualTo(SqliteConstraints.Kind.UNIQUE);
        assertThat(u.detail()).isEqualTo("app_users.username");
        assertThat(f.kind()).isEqualTo(SqliteConstraints.Kind.FOREIGN_KEY);
        assertThat(r.kind()).isEqualTo(SqliteConstraints.Kind.FOREIGN_KEY);
        assertThat(c.kind()).isEqualTo(SqliteConstraints.Kind.CHECK);
        assertThat(n.kind()).isEqualTo(SqliteConstraints.Kind.NOT_NULL);
        assertThat(n.detail()).isEqualTo("subjects.name_km");
    }

    @Test
    void convertersStoreTextDatesAndRoundTripKhmer() {
        AppUser saved = users.saveAndFlush(user("khmeruser", "សុខ ចាន់ណា ក្រុងភ្នំពេញ"));
        Map<String, Object> row = jdbc.queryForMap("select typeof(created_at) t1, created_at d1, typeof(is_active) t2, is_active d2, "
                + "typeof(version) t3, display_name n from app_users where id = ?", saved.getId());
        AppUser back = users.findById(saved.getId()).orElseThrow();
        say("storage: created_at=" + row.get("t1") + ":" + row.get("d1") + ", is_active=" + row.get("t2") + ":" + row.get("d2") + ", version=" + row.get("t3"));
        assertThat(row.get("t1")).isEqualTo("text");
        assertThat(row.get("d1")).isEqualTo("2026-10-30T08:15:30Z");
        assertThat(row.get("t2")).isEqualTo("integer");
        assertThat(row.get("n")).isEqualTo("សុខ ចាន់ណា ក្រុងភ្នំពេញ");
        assertThat(back.getDisplayName()).isEqualTo("សុខ ចាន់ណា ក្រុងភ្នំពេញ");
        assertThat(back.getCreatedAt()).isEqualTo(Instant.parse("2026-10-30T08:15:30Z"));
        assertThat(back.isActive()).isTrue();
    }

    @Test
    void optimisticLockingDetectsStaleUpdate() {
        AppUser saved = users.saveAndFlush(user("lockuser", "a"));
        AppUser first = users.findById(saved.getId()).orElseThrow();
        AppUser second = users.findById(saved.getId()).orElseThrow();
        first.setDisplayName("b");
        users.saveAndFlush(first);
        second.setDisplayName("c");
        Throwable t = catchThrowable(() -> users.saveAndFlush(second));
        say("stale update -> " + (t == null ? "NO ERROR" : t.getClass().getSimpleName()));
        assertThat(t).isInstanceOf(ObjectOptimisticLockingFailureException.class);
    }

    @Test
    void transactionRollbackLeavesNothing() {
        TransactionTemplate tt = new TransactionTemplate(txm);
        Throwable t = catchThrowable(() -> tt.executeWithoutResult(s -> {
            users.saveAndFlush(user("rollbackuser", "x"));
            throw new IllegalStateException("boom");
        }));
        Integer n = jdbc.queryForObject("select count(*) from app_users where username = 'rollbackuser'", Integer.class);
        assertThat(t).isInstanceOf(IllegalStateException.class);
        assertThat(n).isZero();
    }

    @Test
    void sequencesAreGapFreeAndDuplicateFreeUnderConcurrency() throws Exception {
        Set<Long> seen = Collections.synchronizedSet(new HashSet<>());
        AtomicInteger failures = new AtomicInteger();
        run4x25(() -> {
            try { seen.add(sequences.next("STU", 2026)); } catch (Exception e) { failures.incrementAndGet(); }
        });
        say("sequence: unique=" + seen.size() + " failures=" + failures.get() + " max=" + seen.stream().max(Long::compare).orElse(0L));
        assertThat(failures.get()).isZero();
        assertThat(seen).hasSize(100);
        assertThat(seen.stream().min(Long::compare).orElseThrow()).isEqualTo(1L);
        assertThat(seen.stream().max(Long::compare).orElseThrow()).isEqualTo(100L);
    }

    @Test
    void springTransactionsReadThenWriteConcurrentlyWithoutBusyErrors() throws Exception {
        TransactionTemplate tt = new TransactionTemplate(txm);
        AtomicInteger failures = new AtomicInteger();
        List<String> msgs = Collections.synchronizedList(new ArrayList<>());
        run4x25(() -> {
            try {
                tt.executeWithoutResult(s -> {
                    jdbc.queryForObject("select count(*) from audit_logs", Integer.class);
                    jdbc.update("insert into audit_logs(at, action) values (?, 'SPIKE')", Instant.now().toString());
                });
            } catch (Exception e) { failures.incrementAndGet(); msgs.add(String.valueOf(e.getMessage())); }
        });
        if (!msgs.isEmpty()) say("first error: " + msgs.get(0));
        Integer rows = jdbc.queryForObject("select count(*) from audit_logs where action = 'SPIKE'", Integer.class);
        say("Spring tx concurrency (4 threads x 25 read-then-write, pool 4, IMMEDIATE): failures=" + failures.get() + ", rows=" + rows);
        assertThat(failures.get()).isZero();
        assertThat(rows).isEqualTo(100);
    }

    @Test
    void vacuumIntoProducesValidBackup() throws Exception {
        users.saveAndFlush(user("backupuser", "ឈ្មោះ"));
        Path backup = tempFile("s2-backup-", ".db");
        Files.delete(backup);
        try (Connection c = ds.getConnection(); Statement st = c.createStatement()) {
            st.execute("VACUUM INTO '" + fwd(backup) + "'");
        }
        try (Connection b = DriverManager.getConnection("jdbc:sqlite:" + fwd(backup)); Statement st = b.createStatement()) {
            String integrity = scalar(st, "PRAGMA integrity_check");
            String grades = scalar(st, "select count(*) from grades");
            String users = scalar(st, "select count(*) from app_users where username = 'backupuser'");
            say("VACUUM INTO: integrity=" + integrity + ", grades=" + grades + ", backupuser rows=" + users + ", bytes=" + Files.size(backup));
            assertThat(integrity).isEqualTo("ok");
            assertThat(grades).isEqualTo("6");
            assertThat(users).isEqualTo("1");
        }
    }

    /** 4 threads x 25 iterations of the given action, started together. */
    private static void run4x25(Runnable action) throws Exception {
        ExecutorService ex = Executors.newFixedThreadPool(4);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<?>> fs = new ArrayList<>();
        for (int t = 0; t < 4; t++) {
            fs.add(ex.submit(() -> {
                go.await();
                for (int i = 0; i < 25; i++) action.run();
                return null;
            }));
        }
        go.countDown();
        for (Future<?> f : fs) f.get();
        ex.shutdown();
    }

    private static String scalar(Statement st, String sql) throws SQLException {
        try (ResultSet rs = st.executeQuery(sql)) { rs.next(); return rs.getString(1); }
    }
}
