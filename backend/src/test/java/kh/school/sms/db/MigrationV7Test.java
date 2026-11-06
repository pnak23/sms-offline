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
 * V7 turns the three hard-coded shifts into attendance sessions the school edits. It rebuilds two tables that hold the school's
 * attendance history, so it is run here against a school that was built by V1-V6 and had real-looking data: nothing may be lost,
 * renamed or re-timed, no time may be invented, and the rule "one student, one day, one session" must hold afterwards even if the
 * old data broke it (the record left out is then written to the audit trail).
 */
class MigrationV7Test {
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

    @Test
    void anOldSchoolKeepsEveryRecordAndSessionAndTheDatabaseNowRefusesAStudentTwiceInOneSession() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("school.db");
        flyway(url, "6").migrate();

        try (Connection c = DriverManager.getConnection(url)) {
            // two years; a student (2) who moved from class 1 to class 2 on 10 January and was marked in BOTH on that day
            run(c,
                "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំចាស់', '2025-11-01', '2026-08-31', 0, 'OPEN', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (2, 'ឆ្នាំថ្មី', '2026-11-01', '2027-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO classes (id, academic_year_id, grade_id, name_km, created_at, updated_at) VALUES (1, 1, 1, 'ក', '" + NOW + "', '" + NOW + "'), (2, 1, 1, 'ខ', '" + NOW + "', '" + NOW + "'), (3, 2, 1, 'ក', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO students (id, student_code, name_km, gender, date_of_birth, enrollment_date, created_at, updated_at) VALUES "
                        + "(1, 'S1', 'សិស្ស ១', 'MALE', '2019-01-01', '2025-11-01', '" + NOW + "', '" + NOW + "'), "
                        + "(2, 'S2', 'សិស្ស ២', 'FEMALE', '2019-01-02', '2025-11-01', '" + NOW + "', '" + NOW + "'), "
                        + "(3, 'S3', 'សិស្ស ៣', 'MALE', '2019-01-03', '2026-11-01', '" + NOW + "', '" + NOW + "')",
                "INSERT INTO enrollments (id, student_id, academic_year_id, class_id, status, enrolled_on, left_on, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 1, 'ACTIVE', '2025-11-01', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(2, 2, 1, 1, 'CHANGED_CLASS', '2025-11-01', '2026-01-10', '" + NOW + "', '" + NOW + "'), "
                        + "(3, 2, 1, 2, 'ACTIVE', '2026-01-10', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(4, 3, 2, 3, 'ACTIVE', '2026-11-01', NULL, '" + NOW + "', '" + NOW + "')",
                "INSERT INTO attendance_sessions (id, class_id, date, shift, note, created_at, updated_at) VALUES "
                        + "(1, 1, '2026-01-10', 'DAY', 'ចំណាំ', '" + NOW + "', '" + NOW + "'), "
                        + "(2, 1, '2026-01-11', 'MORNING', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(3, 1, '2026-01-11', 'AFTERNOON', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(4, 2, '2026-01-10', 'DAY', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(5, 3, '2026-11-05', 'DAY', NULL, '" + NOW + "', '" + NOW + "')",
                "INSERT INTO attendance_records (id, session_id, enrollment_id, status, remark, created_at, updated_at) VALUES "
                        + "(1, 1, 1, 'PRESENT', 'មក', '" + NOW + "', '" + NOW + "'), "
                        + "(2, 1, 2, 'ABSENT', 'ឈឺ', '" + NOW + "', '2026-01-10T01:00:00Z'), "
                        + "(3, 2, 1, 'LATE', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(4, 3, 1, 'PRESENT', NULL, '" + NOW + "', '" + NOW + "'), "
                        + "(5, 4, 3, 'PRESENT', NULL, '" + NOW + "', '2026-01-10T05:00:00Z'), "
                        + "(6, 5, 4, 'LEAVE', NULL, '" + NOW + "', '" + NOW + "')");
        }

        flyway(url, "7").migrate();

        try (Connection c = DriverManager.getConnection(url)) {
            // sessions of the school day: the whole day for every year; the morning and afternoon only where a sheet used them; no time invented
            assertThat(rows(c, "SELECT academic_year_id, name_km, sort_order, enabled, start_time, end_time, confirmed_at FROM attendance_periods ORDER BY academic_year_id, sort_order"))
                    .containsExactly("1|ពេញមួយថ្ងៃ|0|1|null|null|null", "1|ពេលព្រឹក|1|1|null|null|null", "1|ពេលរសៀល|2|1|null|null|null", "2|ពេញមួយថ្ងៃ|0|1|null|null|null");

            // every sheet is still there with its id, now pointing at the session its shift became, with a snapshot of that session
            assertThat(rows(c, "SELECT s.id, s.class_id, s.date, p.academic_year_id, s.period_name_km, s.period_start, s.note FROM attendance_sessions s JOIN attendance_periods p ON p.id = s.period_id ORDER BY s.id"))
                    .containsExactly("1|1|2026-01-10|1|ពេញមួយថ្ងៃ|null|ចំណាំ", "2|1|2026-01-11|1|ពេលព្រឹក|null|null", "3|1|2026-01-11|1|ពេលរសៀល|null|null",
                            "4|2|2026-01-10|1|ពេញមួយថ្ងៃ|null|null", "5|3|2026-11-05|2|ពេញមួយថ្ងៃ|null|null");
            assertThat(count(c, "SELECT count(DISTINCT period_id) FROM attendance_sessions WHERE class_id IN (1, 2) AND date = '2026-01-10'")).as("the day sheets of both classes share the year's whole-day session").isEqualTo(1);
            assertThat(rows(c, "SELECT name FROM pragma_table_info('attendance_sessions') WHERE name = 'shift'")).as("the shift column is gone").isEmpty();

            // the records: all kept except the one the new rule cannot hold; ids, statuses and remarks unchanged, student/date/session filled in
            assertThat(rows(c, "SELECT id, session_id, enrollment_id, student_id, date, status, remark FROM attendance_records ORDER BY id"))
                    .containsExactly("1|1|1|1|2026-01-10|PRESENT|មក", "3|2|1|1|2026-01-11|LATE|null", "4|3|1|1|2026-01-11|PRESENT|null", "5|4|3|2|2026-01-10|PRESENT|null", "6|5|4|3|2026-11-05|LEAVE|null");
            assertThat(rows(c, "SELECT entity_id, actor, before_json, summary FROM audit_logs WHERE action = 'ATTENDANCE_DUPLICATE_DROPPED'"))
                    .as("the older of the two records of student 2 on 10 January is left out, and the trail says so (a status code, no name or remark)")
                    .containsExactly("2|system|{\"status\":\"ABSENT\"}|attendance upgrade: a second record for the same student, day and session was left out");

            // the new guards are real
            assertThatThrownBy(() -> run(c, "INSERT INTO attendance_records (session_id, enrollment_id, student_id, date, period_id, status, created_at, updated_at) "
                    + "SELECT 4, 2, 2, date, period_id, 'ABSENT', '" + NOW + "', '" + NOW + "' FROM attendance_records WHERE id = 5"))
                    .as("student 2 already has a record on 10 January in the whole-day session").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, "INSERT INTO attendance_sessions (class_id, date, period_id, period_name_km, created_at, updated_at) VALUES (1, '2026-01-10', "
                    + "(SELECT period_id FROM attendance_sessions WHERE id = 1), 'x', '" + NOW + "', '" + NOW + "')")).as("a class has one sheet per day and session").hasMessageContaining("UNIQUE");
            assertThatThrownBy(() -> run(c, "INSERT INTO attendance_periods (academic_year_id, name_km, start_time, end_time, created_at, updated_at) VALUES (1, 'ក', '07:00', NULL, '" + NOW + "', '" + NOW + "')"))
                    .as("both times or neither").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO attendance_periods (academic_year_id, name_km, start_time, end_time, created_at, updated_at) VALUES (1, 'ខ', '7am', '9am', '" + NOW + "', '" + NOW + "')"))
                    .as("HH:mm only").hasMessageContaining("CHECK");
            assertThatThrownBy(() -> run(c, "INSERT INTO attendance_periods (academic_year_id, name_km, created_at, updated_at) VALUES (1, 'ពេលព្រឹក', '" + NOW + "', '" + NOW + "')")).as("a name is used once per year").hasMessageContaining("UNIQUE");

            // nothing is orphaned, and the rebuilt tables answer in the order they should
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
            assertThat(rows(c, "PRAGMA integrity_check")).containsExactly("ok");
            assertThat(rows(c, "SELECT version, success FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1")).containsExactly("7|1");
        }
    }

    @Test
    void aSchoolWithNoAttendanceYetJustGetsTheWholeDayOnEveryYear() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("empty.db");
        flyway(url, "6").migrate();
        try (Connection c = DriverManager.getConnection(url)) {
            run(c, "INSERT INTO academic_years (id, name_km, start_date, end_date, is_current, status, created_at, updated_at) VALUES (1, 'ឆ្នាំមួយ', '2026-11-01', '2027-08-31', 1, 'OPEN', '" + NOW + "', '" + NOW + "')");
        }
        flyway(url, "7").migrate();
        try (Connection c = DriverManager.getConnection(url)) {
            assertThat(rows(c, "SELECT academic_year_id, name_km, start_time, enabled FROM attendance_periods")).containsExactly("1|ពេញមួយថ្ងៃ|null|1");
            assertThat(count(c, "SELECT count(*) FROM attendance_sessions")).isZero();
            assertThat(count(c, "SELECT count(*) FROM attendance_records")).isZero();
            assertThat(rows(c, "PRAGMA foreign_key_check")).isEmpty();
        }
    }
}
