package kh.school.sms.db;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V9 gives homework an optional maximum mark and a table of the students' records. It is additive (no table is rebuilt), so it is run here against a school built by V1-V8
 * that already has homework AND examination scores: every homework must come out exactly as it was (without a maximum, so still a record only), the examination facts must
 * be untouched, and the new rules (a maximum above zero, one record per student and assignment, a mark only on work that was handed in, no empty record) must hold in the
 * database itself.
 */
class MigrationV9Test {
    @TempDir Path dir;

    private static final String NOW = "2026-01-01T00:00:00Z";

    private static void run(Connection c, String... statements) throws SQLException {
        try (Statement st = c.createStatement()) { for (String s : statements) st.execute(s); }
    }

    private static List<String> rows(Connection c, String sql) throws SQLException {
        List<String> out = new ArrayList<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            int n = rs.getMetaData().getColumnCount();
            while (rs.next()) {
                StringBuilder b = new StringBuilder();
                for (int i = 1; i <= n; i++) b.append(i > 1 ? "|" : "").append(rs.getString(i));
                out.add(b.toString());
            }
        }
        return out;
    }

    private static long count(Connection c, String sql) throws SQLException { return Long.parseLong(rows(c, sql).get(0)); }

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null).locations("classpath:db/migration").target(target).load();
    }

    private static final String HOMEWORK_FACTS = "SELECT id, class_id, subject_id, title, description, assigned_date, due_date, status, remark, version, created_at, updated_at FROM homework ORDER BY id";
    private static final String EXAM_FACTS = "SELECT es.examination_id, es.grade_id, es.subject_id, es.max_score_x100, sc.enrollment_id, sc.score_x100, sc.is_absent FROM examination_subjects es "
            + "LEFT JOIN student_scores sc ON sc.examination_subject_id = es.id ORDER BY es.id, sc.enrollment_id";

    @Test
    void aSchoolWithHomeworkKeepsEveryAssignmentAsARecordOnlyAndTheNewRulesHoldInTheDatabase() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("school.db");
        flyway(url, "8").migrate();

        List<String> homeworkBefore;
        List<String> examBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            run(c,
                "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំមួយ', '2025-11-01', '2026-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO classes (id, academic_year_id, grade_id, name_km, created_at, updated_at) VALUES (1, 1, 1, 'ក', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO students (id, student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) VALUES "
                        + "(1, 'S1', 'សិស្ស ១', 'MALE', '2019-01-01', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 'S2', 'សិស្ស ២', 'FEMALE', '2019-01-02', '2025-11-01', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO enrollments (id, student_id, academic_year_id, class_id, status, enrolled_on, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 2, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO examinations (id, academic_year_id, name_km, kind, term_no, created_at, updated_at) VALUES (1, 1, 'ប្រឡងខែមួយ', 'MONTHLY', 1, '" + NOW + "', '" + NOW + "')",
                "INSERT INTO examination_subjects (id, examination_id, grade_id, subject_id, max_score_x100, weight_x100, created_at) VALUES (1, 1, 1, 1, 1000, 100, '" + NOW + "')",
                "INSERT INTO student_scores (id, examination_subject_id, enrollment_id, score_x100, is_absent, remark, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 850, 0, NULL, '" + NOW + "', '" + NOW + "'), (2, 1, 2, NULL, 1, NULL, '" + NOW + "', '" + NOW + "')",
                // three assignments, as a school that used the program before this change has them: done, assigned and cancelled
                "INSERT INTO homework (id, class_id, subject_id, title, description, assigned_date, due_date, status, remark, version, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 'សរសេរអក្សរ', 'ទំព័រ ១០', '2025-11-03', '2025-11-05', 'DONE', NULL, 2, '" + NOW + "', '" + NOW + "'), "
                        + "(2, 1, 2, 'ធ្វើលំហាត់', NULL, '2025-11-04', '2025-11-06', 'ASSIGNED', 'សូមពិនិត្យ', 0, '" + NOW + "', '" + NOW + "'), "
                        + "(3, 1, 1, 'បោះបង់', NULL, '2025-11-05', '2025-11-07', 'CANCELLED', NULL, 1, '" + NOW + "', '" + NOW + "')");
            homeworkBefore = rows(c, HOMEWORK_FACTS);
            examBefore = rows(c, EXAM_FACTS);
        }

        flyway(url, "9").migrate();

        try (Connection c = DriverManager.getConnection(url)) {
            // nothing already stored changed, and no assignment has a maximum: each one is exactly the record it was
            assertThat(rows(c, HOMEWORK_FACTS)).as("every homework, field by field").isEqualTo(homeworkBefore);
            assertThat(rows(c, "SELECT id, max_score_x100 FROM homework ORDER BY id")).containsExactly("1|null", "2|null", "3|null");
            assertThat(count(c, "SELECT count(*) FROM homework_records")).isZero();
            assertThat(rows(c, EXAM_FACTS)).as("the facts every result is computed from are untouched").isEqualTo(examBefore);

            // a maximum above zero, or none
            run(c, "UPDATE homework SET max_score_x100 = 1000 WHERE id = 1");
            assertThat(rows(c, "SELECT max_score_x100 FROM homework WHERE id = 1")).containsExactly("1000");
            assertThatThrownBy(() -> run(c, "UPDATE homework SET max_score_x100 = 0 WHERE id = 2")).as("a maximum above zero").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "UPDATE homework SET max_score_x100 = -5 WHERE id = 2")).hasMessageContaining("CHECK");

            // the records: a status, a mark (only on handed-in work), a remark; nothing empty; one per student and assignment
            run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (1, 1, 'SUBMITTED', 850, 'ល្អ', '" + NOW + "', '" + NOW + "')",
                    "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (1, 2, 'LATE', 600, NULL, '" + NOW + "', '" + NOW + "')",
                    "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (2, 1, 'NOT_SUBMITTED', NULL, 'ភ្លេច', '" + NOW + "', '" + NOW + "')",
                    "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (2, 2, 'EXCUSED', NULL, NULL, '" + NOW + "', '" + NOW + "')",
                    "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (3, 1, NULL, NULL, 'កំណត់ចំណាំ', '" + NOW + "', '" + NOW + "')");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, created_at, updated_at) VALUES (3, 2, 'NOT_SUBMITTED', 100, '" + NOW + "', '" + NOW + "')"))
                    .as("a mark on work that was not handed in").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, created_at, updated_at) VALUES (3, 2, 'EXCUSED', 100, '" + NOW + "', '" + NOW + "')"))
                    .hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, created_at, updated_at) VALUES (3, 2, NULL, 100, '" + NOW + "', '" + NOW + "')"))
                    .as("a mark without a status").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (3, 2, NULL, NULL, NULL, '" + NOW + "', '" + NOW + "')"))
                    .as("a record with nothing in it").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, created_at, updated_at) VALUES (3, 2, 'SUBMITTED', -1, '" + NOW + "', '" + NOW + "')"))
                    .as("not a negative mark").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, created_at, updated_at) VALUES (3, 2, 'MAYBE', '" + NOW + "', '" + NOW + "')"))
                    .as("a known status").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, created_at, updated_at) VALUES (1, 1, 'SUBMITTED', '" + NOW + "', '" + NOW + "')"))
                    .as("one record per student and assignment").hasMessageContaining("UNIQUE");
            run(c, "PRAGMA foreign_keys = ON");   // a plain connection has them off; the program's own connection has them on
            assertThatThrownBy(() -> run(c, "INSERT INTO homework_records (homework_id, enrollment_id, status, created_at, updated_at) VALUES (99, 1, 'SUBMITTED', '" + NOW + "', '" + NOW + "')"))
                    .as("the assignment must exist (foreign key)").isInstanceOf(SQLException.class);

            // homework marks live apart from examinations: the examination facts are still exactly what they were
            assertThat(rows(c, EXAM_FACTS)).isEqualTo(examBefore);
            assertThat(count(c, "SELECT count(*) FROM student_scores")).isEqualTo(2);

            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
            assertThat(rows(c, "PRAGMA integrity_check")).containsExactly("ok");
            assertThat(rows(c, "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1")).containsExactly("9|1");
        }
    }

    @Test
    void aSchoolWithNoHomeworkYetJustGetsTheNewColumnAndTable() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("empty.db");
        flyway(url, "8").migrate();
        flyway(url, "9").migrate();
        try (Connection c = DriverManager.getConnection(url)) {
            assertThat(count(c, "SELECT count(*) FROM homework")).isZero();
            assertThat(rows(c, "SELECT name FROM pragma_table_info('homework') WHERE name = 'max_score_x100'")).containsExactly("max_score_x100");
            assertThat(count(c, "SELECT count(*) FROM homework_records")).isZero();
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
        }
    }
}
