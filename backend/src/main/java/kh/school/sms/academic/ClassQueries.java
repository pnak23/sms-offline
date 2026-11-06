package kh.school.sms.academic;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/** Read side for classes: joins that are awkward as entities. */
@Repository
public class ClassQueries {
    public record ClassRow(long id, long academicYearId, String yearName, long gradeId, int gradeLevel, String gradeName, String nameKm,
                           int capacity, Long homeroomTeacherId, String homeroomTeacherName, String shift, int studentCount, long version) {}

    public record AssignmentRow(long subjectId, String subjectName, long teacherId, String teacherName) {}

    /** What one teacher teaches: class, grade, year and subject names for the teacher's profile. */
    public record TeacherAssignmentRow(long classId, String className, String gradeName, String yearName, long subjectId, String subjectName) {}

    private static final String SELECT = """
            SELECT c.id, c.academic_year_id, y.name_km, c.grade_id, g.level, g.name_km, c.name_km, c.capacity,
                   c.homeroom_teacher_id, t.name_km, c.shift,
                   (SELECT count(*) FROM enrollments e WHERE e.class_id = c.id AND e.status = 'ACTIVE'), c.version
            FROM classes c
            JOIN academic_years y ON y.id = c.academic_year_id
            JOIN grades g ON g.id = c.grade_id
            LEFT JOIN teachers t ON t.id = c.homeroom_teacher_id
            """;

    private final JdbcTemplate jdbc;

    public ClassQueries(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static ClassRow row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        long teacher = rs.getLong(9);
        Long homeroomTeacherId = rs.wasNull() ? null : teacher;   // wasNull() refers to the column read just before it
        return new ClassRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getLong(4), rs.getInt(5), rs.getString(6), rs.getString(7),
                rs.getInt(8), homeroomTeacherId, rs.getString(10), rs.getString(11), rs.getInt(12), rs.getLong(13));
    }

    /** Both filters are optional (null = any). Ordered by grade, then creation. */
    public List<ClassRow> list(Long yearId, Long gradeId) {
        return jdbc.query(SELECT + " WHERE (? IS NULL OR c.academic_year_id = ?) AND (? IS NULL OR c.grade_id = ?) ORDER BY g.level, c.id",
                ClassQueries::row, yearId, yearId, gradeId, gradeId);
    }

    public Optional<ClassRow> find(long id) {
        return jdbc.query(SELECT + " WHERE c.id = ?", ClassQueries::row, id).stream().findFirst();
    }

    public List<AssignmentRow> assignments(long classId) {
        return jdbc.query("""
                SELECT a.subject_id, s.name_km, a.teacher_id, t.name_km
                FROM teacher_assignments a JOIN subjects s ON s.id = a.subject_id JOIN teachers t ON t.id = a.teacher_id
                WHERE a.class_id = ? ORDER BY s.sort_order, s.id
                """, (rs, n) -> new AssignmentRow(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getString(4)), classId);
    }

    public List<ClassRow> homeroomOf(long teacherId) {
        return jdbc.query(SELECT + " WHERE c.homeroom_teacher_id = ? ORDER BY y.start_date DESC, g.level, c.id", ClassQueries::row, teacherId);
    }

    public List<TeacherAssignmentRow> assignmentsOf(long teacherId) {
        return jdbc.query("""
                SELECT c.id, c.name_km, g.name_km, y.name_km, s.id, s.name_km
                FROM teacher_assignments a
                JOIN classes c ON c.id = a.class_id JOIN grades g ON g.id = c.grade_id
                JOIN academic_years y ON y.id = c.academic_year_id JOIN subjects s ON s.id = a.subject_id
                WHERE a.teacher_id = ? ORDER BY y.start_date DESC, g.level, c.id, s.sort_order
                """, (rs, n) -> new TeacherAssignmentRow(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getLong(5), rs.getString(6)), teacherId);
    }
}
