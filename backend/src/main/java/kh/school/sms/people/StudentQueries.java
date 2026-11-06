package kh.school.sms.people;

import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

/** Read side for students: the searchable list with each student's class in one academic year, and guardians. */
@Repository
public class StudentQueries {
    /** The student plus the ACTIVE enrollment in the chosen year (all enrollment columns are null when there is none). */
    public record StudentRow(long id, String studentCode, String nameKm, String nameEn, String gender, String dateOfBirth, String status,
                             String photoFile, Long enrollmentId, Long classId, String className, Long gradeId, String gradeName,
                             Integer gradeLevel, Long yearId, String yearName) {}

    public record GuardianRow(long id, String nameKm, String relationship, String phone, boolean primary) {}

    /** Every filter is optional. {@code pattern} comes from SearchText.contains; {@code yearId} says which year's class to show. */
    public record Filters(String pattern, String gender, String status, Long yearId, Long gradeId, Long classId, boolean unenrolledOnly) {}

    private static final String SELECT = """
            SELECT s.id, s.student_code, s.name_km, s.name_en, s.gender, s.date_of_birth, s.status, s.photo_file,
                   e.id, c.id, c.name_km, g.id, g.name_km, g.level, y.id, y.name_km
            FROM students s
            LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE' AND e.academic_year_id = :yearId
            LEFT JOIN classes c ON c.id = e.class_id
            LEFT JOIN grades g ON g.id = c.grade_id
            LEFT JOIN academic_years y ON y.id = e.academic_year_id
            """;

    private final NamedParameterJdbcTemplate jdbc;

    public StudentQueries(NamedParameterJdbcTemplate jdbc) { this.jdbc = jdbc; }

    private static Long nullableLong(ResultSet rs, int col) throws SQLException {
        long v = rs.getLong(col);
        return rs.wasNull() ? null : v;
    }

    private static Integer nullableInt(ResultSet rs, int col) throws SQLException {
        int v = rs.getInt(col);
        return rs.wasNull() ? null : v;
    }

    private static StudentRow row(ResultSet rs, int n) throws SQLException {
        return new StudentRow(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6),
                rs.getString(7), rs.getString(8), nullableLong(rs, 9), nullableLong(rs, 10), rs.getString(11), nullableLong(rs, 12),
                rs.getString(13), nullableInt(rs, 14), nullableLong(rs, 15), rs.getString(16));
    }

    public List<StudentRow> search(Filters f) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("yearId", f.yearId()).addValue("gender", f.gender()).addValue("status", f.status())
                .addValue("gradeId", f.gradeId()).addValue("classId", f.classId())
                .addValue("unenrolled", f.unenrolledOnly() ? 1 : 0).addValue("pattern", f.pattern());
        return jdbc.query(SELECT + """
                WHERE (:gender IS NULL OR s.gender = :gender)
                  AND (:status IS NULL OR s.status = :status)
                  AND (:gradeId IS NULL OR c.grade_id = :gradeId)
                  AND (:classId IS NULL OR e.class_id = :classId)
                  AND (:unenrolled = 0 OR e.id IS NULL)
                  AND (:pattern IS NULL OR s.name_km LIKE :pattern ESCAPE '\\' OR s.name_en LIKE :pattern ESCAPE '\\'
                       OR s.student_code LIKE :pattern ESCAPE '\\'
                       OR EXISTS (SELECT 1 FROM guardians gu WHERE gu.student_id = s.id
                                  AND (gu.name_km LIKE :pattern ESCAPE '\\' OR gu.phone LIKE :pattern ESCAPE '\\')))
                ORDER BY s.id
                """, p, StudentQueries::row);
    }

    public Optional<StudentRow> find(long id, Long yearId) {
        return jdbc.query(SELECT + " WHERE s.id = :id", new MapSqlParameterSource().addValue("id", id).addValue("yearId", yearId),
                StudentQueries::row).stream().findFirst();
    }

    public List<GuardianRow> guardians(long studentId) {
        return jdbc.query("SELECT id, name_km, relationship, phone, is_primary FROM guardians WHERE student_id = :id ORDER BY is_primary DESC, id",
                new MapSqlParameterSource("id", studentId),
                (rs, n) -> new GuardianRow(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getInt(5) == 1));
    }
}
