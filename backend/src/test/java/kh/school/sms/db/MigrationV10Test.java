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
import java.util.Map;
import java.util.TreeMap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V10 adds the weekly timetable: three new tables, three indexes and three triggers. It must not touch an existing record, and it must not create one: a school that
 * used the program before this change gets an EMPTY timetable (no day, no slot, no lesson), and no invented time. It is run here against a school built by V1-V9 that has
 * teachers and their assignments, students, an examination with scores, homework with records and attendance sessions: EVERY existing table must come out row for row and
 * definition for definition the same, and the new rules (times, one lesson per class and slot, a teacher in one place at a time, a main subject, no lesson in a break,
 * the class and the slot of one year) must hold in the database itself.
 */
class MigrationV10Test {
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

    /** Every table that exists, with its definition and every row, in a fixed order (the Flyway history is the one thing that is meant to change). */
    private static Map<String, List<String>> snapshot(Connection c) throws SQLException {
        Map<String, List<String>> all = new TreeMap<>();
        for (String table : rows(c, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'flyway_schema_history' ORDER BY name")) {
            List<String> content = new ArrayList<>();
            content.add("DEFINITION " + rows(c, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'").get(0));
            content.addAll(rows(c, "SELECT * FROM \"" + table + "\" ORDER BY rowid"));
            all.put(table, content);
        }
        return all;
    }

    private static void seedSchool(Connection c) throws SQLException {
        run(c,
            "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំមួយ', '2025-11-01', '2026-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "')",
            "INSERT INTO classes (id, academic_year_id, grade_id, name_km, created_at, updated_at) VALUES (1, 1, 1, 'ក', '" + NOW + "', '" + NOW + "'), (2, 1, 1, 'ខ', '" + NOW + "', '" + NOW + "')",
            "INSERT INTO teachers (id, teacher_code, name_km, gender, status, created_at, updated_at) VALUES (1, 'T1', 'គ្រូ ១', 'MALE', 'ACTIVE', '" + NOW + "', '" + NOW + "'), (2, 'T2', 'គ្រូ ២', 'FEMALE', 'ACTIVE', '" + NOW + "', '" + NOW + "')",
            "INSERT INTO teacher_assignments (class_id, subject_id, teacher_id, created_at) VALUES (1, 1, 1, '" + NOW + "'), (1, 2, 2, '" + NOW + "'), (2, 1, 2, '" + NOW + "')",
            "INSERT INTO students (id, student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) VALUES "
                    + "(1, 'S1', 'សិស្ស ១', 'MALE', '2019-01-01', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 'S2', 'សិស្ស ២', 'FEMALE', '2019-01-02', '2025-11-01', '" + NOW + "', '" + NOW + "')",
            "INSERT INTO enrollments (id, student_id, academic_year_id, class_id, status, enrolled_on, created_at, updated_at) VALUES "
                    + "(1, 1, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "'), (2, 2, 1, 1, 'ACTIVE', '2025-11-01', '" + NOW + "', '" + NOW + "')",
            "INSERT INTO examinations (id, academic_year_id, name_km, kind, term_no, created_at, updated_at) VALUES (1, 1, 'ប្រឡងខែមួយ', 'MONTHLY', 1, '" + NOW + "', '" + NOW + "')",
            "INSERT INTO examination_subjects (id, examination_id, grade_id, subject_id, max_score_x100, weight_x100, created_at) VALUES (1, 1, 1, 1, 1000, 100, '" + NOW + "')",
            "INSERT INTO student_scores (id, examination_subject_id, enrollment_id, score_x100, is_absent, remark, created_at, updated_at) VALUES (1, 1, 1, 850, 0, NULL, '" + NOW + "', '" + NOW + "')",
            "INSERT INTO homework (id, class_id, subject_id, title, description, assigned_date, due_date, status, remark, version, created_at, updated_at, max_score_x100) VALUES "
                    + "(1, 1, 1, 'សរសេរអក្សរ', NULL, '2025-11-03', '2025-11-05', 'DONE', NULL, 0, '" + NOW + "', '" + NOW + "', 1000)",
            "INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (1, 1, 'SUBMITTED', 900, NULL, '" + NOW + "', '" + NOW + "')");
    }

    @Test
    void aSchoolThatAlreadyHasDataKeepsEveryTableExactlyAndGetsAnEmptyTimetable() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("school.db");
        flyway(url, "9").migrate();

        Map<String, List<String>> before;
        try (Connection c = DriverManager.getConnection(url)) {
            seedSchool(c);
            before = snapshot(c);
            assertThat(before).as("the V9 school really has data in the tables this migration must not touch")
                    .containsKeys("teachers", "teacher_assignments", "enrollments", "homework_records", "student_scores", "attendance_periods", "classes", "academic_years");
            assertThat(before.get("teacher_assignments")).hasSize(1 + 3);
        }

        flyway(url, "10").migrate();

        try (Connection c = DriverManager.getConnection(url)) {
            Map<String, List<String>> after = snapshot(c);
            // every table that existed: its definition and each of its rows are exactly what they were
            for (Map.Entry<String, List<String>> table : before.entrySet()) {
                assertThat(after.get(table.getKey())).as("table " + table.getKey() + " (definition and every row)").isEqualTo(table.getValue());
            }
            // the only new tables are the three of the timetable, and every one of them is empty: nothing was invented (no day, no slot, no lesson)
            assertThat(after.keySet()).as("the new tables").containsExactlyInAnyOrder(
                    java.util.stream.Stream.concat(before.keySet().stream(), java.util.stream.Stream.of("timetable_days", "timetable_slots", "timetable_entries")).toArray(String[]::new));
            assertThat(count(c, "SELECT count(*) FROM timetable_days")).isZero();
            assertThat(count(c, "SELECT count(*) FROM timetable_slots")).isZero();
            assertThat(count(c, "SELECT count(*) FROM timetable_entries")).isZero();
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
            assertThat(rows(c, "PRAGMA integrity_check")).containsExactly("ok");
            assertThat(rows(c, "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1")).containsExactly("10|1");
        }
    }

    @Test
    void theDatabaseItselfRefusesWhatTheTimetableRulesRefuse() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("rules.db");
        flyway(url, "10").migrate();
        try (Connection c = DriverManager.getConnection(url)) {
            run(c, "PRAGMA foreign_keys = ON");   // the program's own connection has them on
            run(c,
                "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំមួយ', '2025-11-01', '2026-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "'), "
                        + "(2, 'ឆ្នាំពីរ', '2026-11-01', '2027-08-31', 0, 'OPEN', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO classes (id, academic_year_id, grade_id, name_km, created_at, updated_at) VALUES (1, 1, 1, 'ក', '" + NOW + "', '" + NOW + "'), (2, 1, 1, 'ខ', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO teachers (id, teacher_code, name_km, gender, status, created_at, updated_at) VALUES (1, 'T1', 'គ្រូ ១', 'MALE', 'ACTIVE', '" + NOW + "', '" + NOW + "'), (2, 'T2', 'គ្រូ ២', 'FEMALE', 'ACTIVE', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO subjects (id, code, name_km, sort_order, parent_id, created_at, updated_at) VALUES (100, 'SUB-A', 'ផ្នែកមួយ', 50, 1, '" + NOW + "', '" + NOW + "')");

            String slot = "INSERT INTO timetable_slots (academic_year_id, name_km, start_time, end_time, is_break, created_at, updated_at) VALUES ";
            // the school's own slot names and times (test values: the program ships none)
            run(c, slot + "(1, 'ម៉ោងទី១', '07:00', '07:45', 0, '" + NOW + "', '" + NOW + "')", slot + "(1, 'ម៉ោងទី២', '07:45', '08:30', 0, '" + NOW + "', '" + NOW + "')",
                    slot + "(1, 'សម្រាក', '08:30', '08:45', 1, '" + NOW + "', '" + NOW + "')", slot + "(2, 'ម៉ោងទី១', '07:00', '07:45', 0, '" + NOW + "', '" + NOW + "')");
            // slot ids 1 and 2 are lessons, 3 is a break (all year 1), 4 belongs to year 2

            assertThatThrownBy(() -> run(c, slot + "(1, 'ម៉ោងទី១', '09:00', '09:45', 0, '" + NOW + "', '" + NOW + "')")).as("a slot name is unique in its year").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ត', '09:45', '09:00', 0, '" + NOW + "', '" + NOW + "')")).as("a slot ends after it starts").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ថ', '09:00', '09:00', 0, '" + NOW + "', '" + NOW + "')")).hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ទ', '25:00', '26:00', 0, '" + NOW + "', '" + NOW + "')")).as("a real clock time").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ធ', '9:00', '10:00', 0, '" + NOW + "', '" + NOW + "')")).as("HH:mm").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ន', '09:00', '09:60', 0, '" + NOW + "', '" + NOW + "')")).hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, slot + "(1, 'ប', '09:00', '10:00', 2, '" + NOW + "', '" + NOW + "')")).as("is_break is 0 or 1").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO timetable_days (academic_year_id, day_of_week) VALUES (1, 8)")).as("a day is 1 to 7").hasMessageContaining("CHECK");
            run(c, "INSERT INTO timetable_days (academic_year_id, day_of_week) VALUES (1, 1)");
            assertThatThrownBy(() -> run(c, "INSERT INTO timetable_days (academic_year_id, day_of_week) VALUES (1, 1)")).hasMessageContaining("UNIQUE");

            String lesson = "INSERT INTO timetable_entries (class_id, slot_id, day_of_week, subject_id, teacher_id, created_at, updated_at) VALUES ";
            run(c, lesson + "(1, 1, 1, 1, 1, '" + NOW + "', '" + NOW + "')");
            assertThatThrownBy(() -> run(c, lesson + "(1, 1, 1, 2, 2, '" + NOW + "', '" + NOW + "')")).as("one lesson per class, day and slot").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, lesson + "(2, 1, 1, 2, 1, '" + NOW + "', '" + NOW + "')")).as("a teacher is in one place at a time").hasMessageContaining("UNIQUE");
            run(c, lesson + "(2, 1, 1, 2, 2, '" + NOW + "', '" + NOW + "')");   // the other teacher, the other class: fine
            run(c, lesson + "(1, 1, 2, 1, 1, '" + NOW + "', '" + NOW + "')");   // another day: fine
            assertThatThrownBy(() -> run(c, "INSERT INTO timetable_entries (class_id, slot_id, day_of_week, subject_id, created_at, updated_at) VALUES (1, 2, 1, 1, '" + NOW + "', '" + NOW + "')"))
                    .as("a lesson needs a teacher").hasMessageContaining("NOT NULL");
            assertThatThrownBy(() -> run(c, "INSERT INTO timetable_entries (class_id, slot_id, day_of_week, teacher_id, created_at, updated_at) VALUES (1, 2, 1, 1, '" + NOW + "', '" + NOW + "')"))
                    .as("a lesson needs a subject (the trigger or NOT NULL refuses it)").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> run(c, lesson + "(1, 2, 8, 1, 1, '" + NOW + "', '" + NOW + "')")).as("a day is 1 to 7").hasMessageContaining("CHECK");

            assertThatThrownBy(() -> run(c, lesson + "(1, 3, 1, 1, 1, '" + NOW + "', '" + NOW + "')")).as("no lesson in a break").hasMessageContaining("TIMETABLE_BREAK_SLOT");
            assertThatThrownBy(() -> run(c, lesson + "(1, 4, 1, 1, 1, '" + NOW + "', '" + NOW + "')")).as("the class and the slot belong to one academic year").hasMessageContaining("TIMETABLE_YEAR_MISMATCH");
            assertThatThrownBy(() -> run(c, lesson + "(1, 2, 3, 100, 1, '" + NOW + "', '" + NOW + "')")).as("a lesson is about a MAIN subject").hasMessageContaining("TIMETABLE_SUBJECT_INVALID");
            assertThatThrownBy(() -> run(c, lesson + "(1, 2, 3, 999, 1, '" + NOW + "', '" + NOW + "')")).as("the subject must exist").isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> run(c, lesson + "(1, 2, 3, 1, 999, '" + NOW + "', '" + NOW + "')")).as("the teacher must exist").isInstanceOf(SQLException.class);
            // the same rules on an UPDATE
            assertThatThrownBy(() -> run(c, "UPDATE timetable_entries SET slot_id = 3 WHERE class_id = 1 AND day_of_week = 2")).hasMessageContaining("TIMETABLE_BREAK_SLOT");
            assertThatThrownBy(() -> run(c, "UPDATE timetable_entries SET slot_id = 4 WHERE class_id = 1 AND day_of_week = 2")).hasMessageContaining("TIMETABLE_YEAR_MISMATCH");
            assertThatThrownBy(() -> run(c, "UPDATE timetable_entries SET subject_id = 100 WHERE class_id = 1 AND day_of_week = 2")).hasMessageContaining("TIMETABLE_SUBJECT_INVALID");
            // a slot that holds lessons cannot become a break, and cannot be deleted
            assertThatThrownBy(() -> run(c, "UPDATE timetable_slots SET is_break = 1 WHERE id = 1")).hasMessageContaining("TIMETABLE_SLOT_IN_USE");
            assertThatThrownBy(() -> run(c, "DELETE FROM timetable_slots WHERE id = 1")).as("a slot with lessons is held by a foreign key").isInstanceOf(SQLException.class);
            run(c, "UPDATE timetable_slots SET is_break = 1 WHERE id = 2");     // an unused slot may become a break
            run(c, "DELETE FROM timetable_slots WHERE id = 2");

            assertThat(count(c, "SELECT count(*) FROM timetable_entries")).as("only the three valid lessons were stored").isEqualTo(3);
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
            assertThat(rows(c, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'trg_timetable%' ORDER BY name"))
                    .containsExactly("trg_timetable_entries_insert", "trg_timetable_entries_update", "trg_timetable_slots_break");
        }
    }
}
