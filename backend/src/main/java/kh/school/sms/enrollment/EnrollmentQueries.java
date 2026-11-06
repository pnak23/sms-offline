package kh.school.sms.enrollment;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

/** Read side for enrollments: class rosters and a student's history. */
@Repository
public class EnrollmentQueries {
    public record RosterRow(long enrollmentId, long studentId, String studentCode, String nameKm, String nameEn, String gender,
                            String dateOfBirth, String photoFile, String studentStatus, String status, String enrolledOn) {}

    public record HistoryRow(long enrollmentId, long academicYearId, String yearName, long classId, String className, long gradeId,
                             String gradeName, String status, String enrolledOn, String leftOn, String endReason, long version) {}

    private final JdbcTemplate jdbc;

    public EnrollmentQueries(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** @param includeEnded false = only students in the class now; true = everyone who was ever enrolled in it */
    public List<RosterRow> roster(long classId, boolean includeEnded) {
        return jdbc.query("""
                SELECT e.id, s.id, s.student_code, s.name_km, s.name_en, s.gender, s.date_of_birth, s.photo_file, s.status, e.status, e.enrolled_on
                FROM enrollments e JOIN students s ON s.id = e.student_id
                WHERE e.class_id = ? AND (? = 1 OR e.status = 'ACTIVE')
                ORDER BY s.id
                """, (rs, n) -> new RosterRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6),
                rs.getString(7), rs.getString(8), rs.getString(9), rs.getString(10), rs.getString(11)), classId, includeEnded ? 1 : 0);
    }

    /** Newest first. */
    public List<HistoryRow> historyOf(long studentId) {
        return jdbc.query("""
                SELECT e.id, e.academic_year_id, y.name_km, e.class_id, c.name_km, g.id, g.name_km, e.status, e.enrolled_on, e.left_on, e.end_reason, e.version
                FROM enrollments e
                JOIN academic_years y ON y.id = e.academic_year_id
                JOIN classes c ON c.id = e.class_id
                JOIN grades g ON g.id = c.grade_id
                WHERE e.student_id = ? ORDER BY y.start_date DESC, e.id DESC
                """, (rs, n) -> new HistoryRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getLong(4), rs.getString(5), rs.getLong(6),
                rs.getString(7), rs.getString(8), rs.getString(9), rs.getString(10), rs.getString(11), rs.getLong(12)), studentId);
    }
}
