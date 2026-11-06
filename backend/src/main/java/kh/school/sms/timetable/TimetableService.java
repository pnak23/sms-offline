package kh.school.sms.timetable;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * The weekly timetable of a class, a teacher and a student. A lesson is a class, a day, a slot, ONE subject (a main subject offered to the class's grade) and ONE teacher (an
 * active one): a cell with only a subject or only a teacher is never stored. A teacher is never in two classes at the same day and slot (the refusal names the other class).
 * A class with no lessons, a year with no slots and a student with no class are normal, empty states, not errors. The student's timetable is the class's: nothing is stored
 * about the student. A CLOSED year is read-only. Every change is written to the audit trail (ids only) with the signed-in user and the time. The timetable is independent of
 * the rest of the program (no result, attendance sheet or fee reads it, and it reads none of theirs).
 */
@Service
public class TimetableService {
    public record Lesson(long id, long classId, String className, String gradeName, int dayOfWeek, long slotId, long subjectId, String subjectName,
                         long teacherId, String teacherName, boolean teacherActive, long version) {}
    public record Grid(List<Integer> days, boolean daysAreDefault, List<TimetableSettingsService.Slot> slots, List<Lesson> lessons) {}
    public record SubjectChoice(long id, String nameKm, Long teacherId, String teacherName, boolean teacherActive) {}
    public record TeacherChoice(long id, String nameKm, String teacherCode, boolean assigned) {}
    public record ClassView(long classId, String className, long gradeId, String gradeName, long yearId, String yearName, boolean yearClosed, Grid grid,
                            List<SubjectChoice> subjects, List<TeacherChoice> teachers) {}
    public record TeacherView(long teacherId, String teacherName, boolean teacherActive, long yearId, String yearName, boolean yearClosed, Grid grid, int lessonCount) {}
    /** {@code state} is OK, or NOT_ENROLLED when the student has no class in that year (an empty grid, not an error). */
    public record StudentView(long studentId, String state, Long classId, String className, String gradeName, long yearId, String yearName, boolean yearClosed, Grid grid) {}
    public record TeacherLoad(long teacherId, int lessons) {}
    record ClassInfo(long id, long yearId, long gradeId, String nameKm, String gradeName) {}

    private static final String LESSONS = """
            SELECT e.id, e.class_id, c.name_km, g.name_km, e.day_of_week, e.slot_id, e.subject_id, sub.name_km, e.teacher_id, t.name_km, t.status, e.version
            FROM timetable_entries e
            JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id
            JOIN subjects sub ON sub.id = e.subject_id JOIN teachers t ON t.id = e.teacher_id
            JOIN timetable_slots s ON s.id = e.slot_id
            """;
    private static final RowMapper<Lesson> LESSON = (rs, n) -> new Lesson(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getLong(6),
            rs.getLong(7), rs.getString(8), rs.getLong(9), rs.getString(10), "ACTIVE".equals(rs.getString(11)), rs.getLong(12));
    private static final String LESSON_ORDER = " ORDER BY s.start_time, e.day_of_week, e.id";

    private final JdbcTemplate jdbc;
    private final TimetableSettingsService settings;
    private final AuditService audit;
    private final Clock clock;

    public TimetableService(JdbcTemplate jdbc, TimetableSettingsService settings, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.settings = settings;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- the views (read-only, always 200: no lessons is an empty grid) -----------------------------------------------

    public ClassView classView(long classId) {
        ClassInfo c = classInfo(classId);
        TimetableSettingsService.YearInfo y = settings.year(c.yearId());
        Grid grid = gridWhere(c.yearId(), LESSONS + " WHERE e.class_id = ?" + LESSON_ORDER, classId);
        List<SubjectChoice> subjects = jdbc.query("""
                SELECT s.id, s.name_km, a.teacher_id, t.name_km, t.status
                FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id
                LEFT JOIN teacher_assignments a ON a.class_id = ? AND a.subject_id = s.id
                LEFT JOIN teachers t ON t.id = a.teacher_id
                WHERE gs.grade_id = ? AND s.is_active = 1 AND s.parent_id IS NULL
                ORDER BY s.sort_order, s.id
                """, (rs, n) -> {
                    long tid = rs.getLong(3);
                    boolean has = !rs.wasNull();
                    return new SubjectChoice(rs.getLong(1), rs.getString(2), has ? tid : null, has ? rs.getString(4) : null, has && "ACTIVE".equals(rs.getString(5)));
                }, classId, c.gradeId());
        List<TeacherChoice> teachers = jdbc.query("""
                SELECT t.id, t.name_km, t.teacher_code, EXISTS (SELECT 1 FROM teacher_assignments a WHERE a.class_id = ? AND a.teacher_id = t.id)
                FROM teachers t WHERE t.status = 'ACTIVE' ORDER BY t.name_km, t.id
                """, (rs, n) -> new TeacherChoice(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getInt(4) == 1), classId);
        return new ClassView(c.id(), c.nameKm(), c.gradeId(), c.gradeName(), c.yearId(), y.nameKm(), y.closed(), grid, subjects, teachers);
    }

    /** The teacher's whole week across every class of the year, and how many lessons that is. */
    public TeacherView teacherView(long teacherId, long yearId) {
        List<Object[]> t = jdbc.query("SELECT name_km, status FROM teachers WHERE id = ?", (rs, n) -> new Object[]{rs.getString(1), rs.getString(2)}, teacherId);
        if (t.isEmpty()) throw ApiException.notFound();
        TimetableSettingsService.YearInfo y = settings.year(yearId);
        Grid grid = gridWhere(yearId, LESSONS + " WHERE e.teacher_id = ? AND s.academic_year_id = ?" + LESSON_ORDER, teacherId, yearId);
        return new TeacherView(teacherId, (String) t.get(0)[0], "ACTIVE".equals(t.get(0)[1]), y.id(), y.nameKm(), y.closed(), grid, grid.lessons().size());
    }

    /** How many lessons each teacher has in the year (a teacher with none is not listed: zero). */
    public List<TeacherLoad> teacherLoads(long yearId) {
        settings.year(yearId);
        return jdbc.query("SELECT e.teacher_id, count(*) FROM timetable_entries e JOIN timetable_slots s ON s.id = e.slot_id WHERE s.academic_year_id = ? GROUP BY e.teacher_id ORDER BY e.teacher_id",
                (rs, n) -> new TeacherLoad(rs.getLong(1), rs.getInt(2)), yearId);
    }

    /** The timetable of the class the student is in (default year: the current one, else the latest year the student has a class in). Read-only. */
    public StudentView studentView(long studentId, Long requestedYearId) {
        Integer exists = jdbc.queryForObject("SELECT count(*) FROM students WHERE id = ?", Integer.class, studentId);
        if (exists == null || exists == 0) throw ApiException.notFound();
        long yearId = requestedYearId != null ? requestedYearId : defaultYearFor(studentId);
        TimetableSettingsService.YearInfo y = settings.year(yearId);
        List<Long> classIds = jdbc.queryForList("SELECT class_id FROM enrollments WHERE student_id = ? AND academic_year_id = ? AND status = 'ACTIVE'", Long.class, studentId, yearId);
        if (classIds.isEmpty()) {
            Grid empty = new Grid(settings.days(yearId), settings.daysAreDefault(yearId), settings.slots(yearId), List.of());
            return new StudentView(studentId, "NOT_ENROLLED", null, null, null, y.id(), y.nameKm(), y.closed(), empty);
        }
        ClassInfo c = classInfo(classIds.get(0));
        Grid grid = gridWhere(yearId, LESSONS + " WHERE e.class_id = ?" + LESSON_ORDER, c.id());
        return new StudentView(studentId, "OK", c.id(), c.nameKm(), c.gradeName(), y.id(), y.nameKm(), y.closed(), grid);
    }

    // ---- one cell ---------------------------------------------------------------------------------------------------

    /** Saves one cell: a new lesson, or a replacement of what the cell held. BOTH a subject and a teacher are required. */
    @Transactional
    public Lesson setCell(long classId, Integer dayOfWeek, Long slotId, Long subjectId, Long teacherId) {
        ClassInfo c = classInfo(classId);
        settings.openYear(c.yearId());
        if (dayOfWeek == null) throw ApiException.validation("dayOfWeek", "REQUIRED");
        if (slotId == null) throw ApiException.validation("slotId", "REQUIRED");
        if (subjectId == null) throw ApiException.validation("subjectId", "REQUIRED");
        if (teacherId == null) throw ApiException.validation("teacherId", "REQUIRED");
        if (dayOfWeek < 1 || dayOfWeek > 7) throw ApiException.validation("dayOfWeek", "INVALID");
        if (!settings.days(c.yearId()).contains(dayOfWeek)) throw ApiException.validation("dayOfWeek", "TIMETABLE_DAY_DISABLED");

        List<Object[]> slot = jdbc.query("SELECT academic_year_id, is_break, name_km FROM timetable_slots WHERE id = ?", (rs, n) -> new Object[]{rs.getLong(1), rs.getInt(2) == 1, rs.getString(3)}, slotId);
        if (slot.isEmpty()) throw ApiException.validation("slotId", "INVALID");
        if ((long) slot.get(0)[0] != c.yearId()) throw ApiException.validation("slotId", "TIMETABLE_YEAR_MISMATCH");
        if ((boolean) slot.get(0)[1]) throw ApiException.validation("slotId", "TIMETABLE_BREAK_SLOT");
        String slotName = (String) slot.get(0)[2];

        List<Long> held = jdbc.queryForList("SELECT subject_id FROM timetable_entries WHERE class_id = ? AND slot_id = ? AND day_of_week = ?", Long.class, classId, slotId, dayOfWeek);
        Integer subjectExists = jdbc.queryForObject("SELECT count(*) FROM subjects WHERE id = ? AND parent_id IS NULL", Integer.class, subjectId);
        if (subjectExists == null || subjectExists == 0) throw ApiException.validation("subjectId", "SUBJECT_NOT_OFFERED");   // missing, or a sub-subject: lessons are main subjects
        Integer offered = jdbc.queryForObject("""
                SELECT count(*) FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id
                WHERE gs.grade_id = ? AND gs.subject_id = ? AND s.is_active = 1 AND s.parent_id IS NULL
                """, Integer.class, c.gradeId(), subjectId);
        boolean sameSubjectAsBefore = !held.isEmpty() && held.get(0).equals(subjectId);
        if ((offered == null || offered == 0) && !sameSubjectAsBefore) throw ApiException.validation("subjectId", "SUBJECT_NOT_OFFERED");

        List<String> status = jdbc.queryForList("SELECT status FROM teachers WHERE id = ?", String.class, teacherId);
        if (status.isEmpty()) throw ApiException.validation("teacherId", "INVALID");
        if (!"ACTIVE".equals(status.get(0))) throw ApiException.validation("teacherId", "TEACHER_INACTIVE");

        // a teacher is in one place at a time: name the class they are already in
        List<Object[]> clash = jdbc.query("""
                SELECT c.name_km, g.name_km FROM timetable_entries e JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id
                WHERE e.teacher_id = ? AND e.slot_id = ? AND e.day_of_week = ? AND e.class_id <> ?
                """, (rs, n) -> new Object[]{rs.getString(1), rs.getString(2)}, teacherId, slotId, dayOfWeek, classId);
        if (!clash.isEmpty()) {
            throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_TEACHER_CLASH", List.of(new ApiException.FieldError("teacherId", "TIMETABLE_TEACHER_CLASH")),
                    Map.of("className", clash.get(0)[0], "gradeName", clash.get(0)[1], "dayOfWeek", dayOfWeek, "slotName", slotName));
        }

        String now = clock.instant().toString();
        List<Object[]> existing = jdbc.query("SELECT id, subject_id, teacher_id FROM timetable_entries WHERE class_id = ? AND slot_id = ? AND day_of_week = ?",
                (rs, n) -> new Object[]{rs.getLong(1), rs.getLong(2), rs.getLong(3)}, classId, slotId, dayOfWeek);
        long id;
        if (existing.isEmpty()) {
            jdbc.update("INSERT INTO timetable_entries (class_id, slot_id, day_of_week, subject_id, teacher_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    classId, slotId, dayOfWeek, subjectId, teacherId, now, now);
            id = Objects.requireNonNull(jdbc.queryForObject("SELECT id FROM timetable_entries WHERE class_id = ? AND slot_id = ? AND day_of_week = ?", Long.class, classId, slotId, dayOfWeek));
            audit.record("TIMETABLE_LESSON_SET", "timetable_entry", id, "timetable lesson added", null, lessonJson(classId, dayOfWeek, slotId, subjectId, teacherId));
        } else {
            id = (long) existing.get(0)[0];
            long oldSubject = (long) existing.get(0)[1];
            long oldTeacher = (long) existing.get(0)[2];
            if (oldSubject == subjectId && oldTeacher == teacherId) return lesson(id);   // nothing changed: no history entry
            jdbc.update("UPDATE timetable_entries SET subject_id = ?, teacher_id = ?, version = version + 1, updated_at = ? WHERE id = ?", subjectId, teacherId, now, id);
            audit.record("TIMETABLE_LESSON_CHANGED", "timetable_entry", id, "timetable lesson changed", lessonJson(classId, dayOfWeek, slotId, oldSubject, oldTeacher),
                    lessonJson(classId, dayOfWeek, slotId, subjectId, teacherId));
        }
        return lesson(id);
    }

    /** Empties one cell. A cell that is already empty is not an error (nothing is recorded). */
    @Transactional
    public void clearCell(long classId, int dayOfWeek, long slotId) {
        ClassInfo c = classInfo(classId);
        settings.openYear(c.yearId());
        List<Object[]> existing = jdbc.query("SELECT id, subject_id, teacher_id FROM timetable_entries WHERE class_id = ? AND slot_id = ? AND day_of_week = ?",
                (rs, n) -> new Object[]{rs.getLong(1), rs.getLong(2), rs.getLong(3)}, classId, slotId, dayOfWeek);
        if (existing.isEmpty()) return;
        long id = (long) existing.get(0)[0];
        jdbc.update("DELETE FROM timetable_entries WHERE id = ?", id);
        audit.record("TIMETABLE_LESSON_CLEARED", "timetable_entry", id, "timetable lesson removed", lessonJson(classId, dayOfWeek, slotId, (long) existing.get(0)[1], (long) existing.get(0)[2]), null);
    }

    // ---- helpers shared with the copy ---------------------------------------------------------------------------------

    ClassInfo classInfo(long classId) {
        List<ClassInfo> found = jdbc.query("SELECT c.id, c.academic_year_id, c.grade_id, c.name_km, g.name_km FROM classes c JOIN grades g ON g.id = c.grade_id WHERE c.id = ?",
                (rs, n) -> new ClassInfo(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getString(4), rs.getString(5)), classId);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    private Lesson lesson(long id) {
        return jdbc.query(LESSONS + " WHERE e.id = ?", LESSON, id).get(0);
    }

    private Grid gridWhere(long yearId, String lessonsSql, Object... args) {
        return new Grid(settings.days(yearId), settings.daysAreDefault(yearId), settings.slots(yearId), jdbc.query(lessonsSql, LESSON, args));
    }

    private long defaultYearFor(long studentId) {
        List<Long> current = jdbc.queryForList("SELECT id FROM academic_years WHERE is_current = 1", Long.class);
        if (!current.isEmpty()) return current.get(0);
        List<Long> latest = jdbc.queryForList("SELECT y.id FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.student_id = ? ORDER BY y.start_date DESC LIMIT 1", Long.class, studentId);
        if (latest.isEmpty()) throw ApiException.validation("yearId", "REQUIRED");
        return latest.get(0);
    }

    /** Ids only: the trail never holds a name. */
    static String lessonJson(long classId, int day, long slotId, long subjectId, long teacherId) {
        return "{\"classId\":" + classId + ",\"day\":" + day + ",\"slotId\":" + slotId + ",\"subjectId\":" + subjectId + ",\"teacherId\":" + teacherId + "}";
    }
}
