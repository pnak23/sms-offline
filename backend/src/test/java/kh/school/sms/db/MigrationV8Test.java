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
 * V8 adds sub-subjects to the subject list and gives every examination its own copy of its structure. It is additive (no table is rebuilt), so it is run here against a
 * school built by V1-V7 that had real-looking examinations and scores: nothing may be lost or renamed, every old examination must come out with exactly the names, order,
 * maxima and scores it showed before and be marked as frozen if it has scores, and the new rules (two levels only, one row per sub-subject, an absent pupil has no score)
 * must hold in the database itself.
 */
class MigrationV8Test {
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

    /** What decides a result, as plain rows: the same query before and after must give the same answer. */
    private static final String RESULT_FACTS = """
            SELECT es.examination_id, es.grade_id, es.subject_id, es.max_score_x100, es.weight_x100, sc.enrollment_id, sc.score_x100, sc.is_absent
            FROM examination_subjects es LEFT JOIN student_scores sc ON sc.examination_subject_id = es.id
            ORDER BY es.id, sc.enrollment_id
            """;

    @Test
    void anOldSchoolKeepsEveryExaminationScoreAndNameAndTheNewRulesHoldInTheDatabase() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("school.db");
        flyway(url, "7").migrate();

        List<String> factsBefore;
        List<String> scoresBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            // grades 1-6 and the eight starting subjects come from V2. A school with two examinations: a scored one and one nobody entered anything for.
            run(c,
                "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំមួយ', '2025-11-01', '2026-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO classes (id, academic_year_id, grade_id, name_km, created_at, updated_at) VALUES (1, 1, 1, 'ក', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO students (id, student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) VALUES "
                        + "(1, 'S1', 'សិស្ស ១', 'MALE', '2019-01-01', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 'S2', 'សិស្ស ២', 'FEMALE', '2019-01-02', '2025-11-01', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO enrollments (id, student_id, academic_year_id, class_id, status, enrolled_on, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 2, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO examinations (id, academic_year_id, name_km, kind, term_no, created_at, updated_at) VALUES "
                        + "(1, 1, 'ប្រឡងខែមួយ', 'MONTHLY', 1, '" + NOW + "', '" + NOW + "'), (2, 1, 'ប្រឡងខែពីរ', 'MONTHLY', 2, '" + NOW + "', '" + NOW + "')",
                // examination 1: Khmer (1) max 10 and Mathematics (2) max 100 weight 2 for grade 1; examination 2: Khmer only
                "INSERT INTO examination_subjects (id, examination_id, grade_id, subject_id, max_score_x100, weight_x100, created_at) VALUES "
                        + "(1, 1, 1, 1, 1000, 100, '" + NOW + "'), (2, 1, 1, 2, 10000, 200, '" + NOW + "'), (3, 2, 1, 1, 2000, 100, '" + NOW + "')",
                "INSERT INTO student_scores (id, examination_subject_id, enrollment_id, score_x100, is_absent, remark, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 850, 0, 'ល្អ', '2026-01-05T08:00:00Z', '2026-01-05T08:00:00Z'), (2, 1, 2, NULL, 1, NULL, '2026-01-05T08:01:00Z', '2026-01-05T08:01:00Z'), "
                        + "(3, 2, 1, 9000, 0, NULL, '2026-01-06T08:00:00Z', '2026-01-06T08:00:00Z')");
            factsBefore = rows(c, RESULT_FACTS);
            scoresBefore = rows(c, "SELECT id, examination_subject_id, enrollment_id, score_x100, is_absent, remark, created_at, updated_at FROM student_scores ORDER BY id");
            // the school renamed a subject at some point: that is what an old report card shows today, and what must be kept
            run(c, "UPDATE subjects SET name_km = 'ភាសាខ្មែរ (ឈ្មោះបច្ចុប្បន្ន)' WHERE id = 1");
        }

        flyway(url, "8").migrate();

        try (Connection c = DriverManager.getConnection(url)) {
            // nothing already stored changed: the same rows answer the same query, and every score is untouched (ids, values, remarks, times)
            assertThat(rows(c, RESULT_FACTS)).as("the facts every result is computed from").isEqualTo(factsBefore);
            assertThat(rows(c, "SELECT id, examination_subject_id, enrollment_id, score_x100, is_absent, remark, created_at, updated_at FROM student_scores ORDER BY id")).isEqualTo(scoresBefore);

            // every subject is a main subject; every examination row is a plain, typed-in one that carries the name and order it shows today
            assertThat(count(c, "SELECT count(*) FROM subjects WHERE parent_id IS NOT NULL")).isZero();
            assertThat(rows(c, "SELECT id, name_km, sort_order, score_source, combine_policy FROM examination_subjects ORDER BY id"))
                    .containsExactly("1|ភាសាខ្មែរ (ឈ្មោះបច្ចុប្បន្ន)|1|DIRECT|SUM", "2|គណិតវិទ្យា|2|DIRECT|SUM", "3|ភាសាខ្មែរ (ឈ្មោះបច្ចុប្បន្ន)|1|DIRECT|SUM");
            assertThat(count(c, "SELECT count(*) FROM examination_subjects WHERE name_km IS NULL OR sort_order IS NULL")).as("the back-fill is complete").isZero();
            assertThat(count(c, "SELECT count(*) FROM examination_sub_subjects")).isZero();
            assertThat(count(c, "SELECT count(*) FROM sub_subject_scores")).isZero();

            // an examination with scores is frozen from the time of its first score; one without is not
            assertThat(rows(c, "SELECT id, structure_frozen_at FROM examinations ORDER BY id")).containsExactly("1|2026-01-05T08:00:00Z", "2|null");

            // a rename AFTER the migration cannot reach the examination's own copy
            run(c, "UPDATE subjects SET name_km = 'ឈ្មោះថ្មីទៀត' WHERE id = 1");
            assertThat(rows(c, "SELECT name_km FROM examination_subjects WHERE id = 1")).containsExactly("ភាសាខ្មែរ (ឈ្មោះបច្ចុប្បន្ន)");

            // two levels only: a sub-subject needs a main subject; a sub-subject cannot have sub-subjects; a main subject with sub-subjects cannot become one
            run(c, "INSERT INTO subjects (id, code, name_km, sort_order, parent_id, created_at, updated_at) VALUES (100, 'SUB-1', 'ផ្នែកមួយ', 20, 1, '" + NOW + "', '" + NOW + "')");
            assertThat(rows(c, "SELECT parent_id FROM subjects WHERE id = 100")).containsExactly("1");
            assertThatThrownBy(() -> run(c, "INSERT INTO subjects (code, name_km, sort_order, parent_id, created_at, updated_at) VALUES ('SUB-2', 'ក្រោម', 21, 100, '" + NOW + "', '" + NOW + "')"))
                    .as("a sub-subject cannot have sub-subjects").hasMessageContaining("SUBJECT_PARENT_INVALID");
            assertThatThrownBy(() -> run(c, "INSERT INTO subjects (code, name_km, sort_order, parent_id, created_at, updated_at) VALUES ('SUB-3', 'គ្មានម្ចាស់', 22, 999, '" + NOW + "', '" + NOW + "')"))
                    .as("the parent must exist").hasMessageContaining("SUBJECT_PARENT_INVALID");
            assertThatThrownBy(() -> run(c, "UPDATE subjects SET parent_id = 2 WHERE id = 1")).as("a main subject that has sub-subjects cannot become one").hasMessageContaining("SUBJECT_PARENT_INVALID");
            assertThatThrownBy(() -> run(c, "UPDATE subjects SET parent_id = 100 WHERE id = 3")).as("the parent must be a main subject").hasMessageContaining("SUBJECT_PARENT_INVALID");
            assertThatThrownBy(() -> run(c, "UPDATE subjects SET parent_id = id WHERE id = 3")).as("not its own parent").hasMessageContaining("SUBJECT_PARENT_INVALID");

            // the new tables: a sub-subject row once per main-subject row, a positive maximum, and an absent pupil has no score
            run(c, "INSERT INTO examination_sub_subjects (id, examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at) VALUES (1, 3, 100, 'ផ្នែកមួយ', 20, 1000, '" + NOW + "')");
            assertThatThrownBy(() -> run(c, "INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at) VALUES (3, 100, 'ម្តងទៀត', 21, 1000, '" + NOW + "')"))
                    .as("one row per sub-subject under a main-subject row").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, "INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at) VALUES (3, 2, 'សូន្យ', 22, 0, '" + NOW + "')"))
                    .as("a positive maximum").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, score_source, created_at) VALUES (3, 2, 'ក', 23, 100, 'WRONG', '" + NOW + "')"))
                    .as("a known score source").hasMessageContaining("CHECK");
            run(c, "INSERT INTO sub_subject_scores (examination_sub_subject_id, enrollment_id, score_x100, is_absent, created_at, updated_at) VALUES (1, 1, 750, 0, '" + NOW + "', '" + NOW + "')");
            assertThatThrownBy(() -> run(c, "INSERT INTO sub_subject_scores (examination_sub_subject_id, enrollment_id, score_x100, is_absent, created_at, updated_at) VALUES (1, 1, 100, 0, '" + NOW + "', '" + NOW + "')"))
                    .as("one score per pupil").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, "INSERT INTO sub_subject_scores (examination_sub_subject_id, enrollment_id, score_x100, is_absent, created_at, updated_at) VALUES (1, 2, 100, 1, '" + NOW + "', '" + NOW + "')"))
                    .as("absent AND a score").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "UPDATE examination_subjects SET score_source = 'WRONG' WHERE id = 1")).as("a known score source").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "UPDATE examination_subjects SET combine_policy = 'WRONG' WHERE id = 1")).as("a known combine policy").hasMessageContaining("CHECK");

            // nothing is orphaned, the database is sound, and V8 is the version that is recorded
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
            assertThat(rows(c, "PRAGMA integrity_check")).containsExactly("ok");
            assertThat(rows(c, "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1")).containsExactly("8|1");
        }
    }

    @Test
    void aSchoolWithNoExaminationsYetJustGetsTheNewTables() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("empty.db");
        flyway(url, "7").migrate();
        flyway(url, "8").migrate();
        try (Connection c = DriverManager.getConnection(url)) {
            assertThat(count(c, "SELECT count(*) FROM subjects")).as("the eight starting subjects, all main subjects").isEqualTo(8);
            assertThat(count(c, "SELECT count(*) FROM subjects WHERE parent_id IS NOT NULL")).isZero();
            assertThat(count(c, "SELECT count(*) FROM examination_subjects")).isZero();
            assertThat(rows(c, "SELECT name FROM pragma_table_info('subjects') WHERE name = 'parent_id'")).containsExactly("parent_id");
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
        }
    }
}
