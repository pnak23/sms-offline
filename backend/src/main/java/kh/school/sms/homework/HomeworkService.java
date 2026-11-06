package kh.school.sms.homework;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.exam.Grading;
import kh.school.sms.exam.ScoreService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Homework is an INDEPENDENT module: what was assigned to which class (a main subject or a sub-subject), when it is due, whether it is done, and, when the assignment has a
 * maximum mark, each student's record: a submission status the teacher chooses, a mark and a remark. Nothing changes for a class of a CLOSED academic year.
 *
 * <p>Homework marks are NEVER part of an examination (the school's rule): they live in their own table and no result, rank, report card or dashboard figure reads them.
 * Marks are whole hundredths like every score; an empty mark is "not entered", never 0, and a "not submitted" student is never turned into a 0 anywhere.
 */
@Service
public class HomeworkService {
    public static final List<String> STATUSES = List.of("ASSIGNED", "DONE", "CANCELLED");
    /** What a student did with one assignment. No record at all means "not recorded yet". The teacher chooses; the clock never does. */
    public static final List<String> RECORD_STATUSES = List.of("SUBMITTED", "LATE", "NOT_SUBMITTED", "EXCUSED");
    /** Only handed-in work can have a mark. */
    private static final Set<String> MARKABLE = Set.of("SUBMITTED", "LATE");
    static final int MAX_ENTRIES = 500;
    /** The largest maximum mark (the same limit as an examination subject). */
    private static final long MAX_LIMIT_X100 = 100_000_00L;

    /**
     * {@code subjectId} is the main subject or the sub-subject the homework is about; for a sub-subject {@code parentSubjectId} / {@code parentSubjectName} are its main
     * subject. {@code maxScore} null = a homework without marks. The counts say how the students of the class stand (a student with no record is in none of them);
     * {@code scoreSum} is the sum of the marks entered, so a screen can show the class average without another request.
     */
    public record Item(long id, long classId, String className, String gradeName, long subjectId, String subjectName, Long parentSubjectId, String parentSubjectName,
                       String title, String description, String assignedDate, String dueDate, String status, String remark, long version,
                       BigDecimal maxScore, int studentCount, int submittedCount, int lateCount, int notSubmittedCount, int excusedCount, int markedCount, BigDecimal scoreSum) {}
    public record Input(long classId, long subjectId, String title, String description, LocalDate assignedDate, LocalDate dueDate, String remark, BigDecimal maxScore) {}

    public record RecordRow(long enrollmentId, long studentId, String studentCode, String nameKm, String status, BigDecimal score, String remark) {}
    public record RecordSheet(Item homework, List<RecordRow> rows) {}
    public record RecordEntry(long enrollmentId, String status, BigDecimal score, String remark) {}

    /** One student's line in the history of their homework (every assignment of the classes they were in, with or without a record). */
    public record HistoryRow(long homeworkId, String title, long classId, String className, String gradeName, String yearName, long subjectId, String subjectName,
                             String parentSubjectName, String assignedDate, String dueDate, String homeworkStatus, BigDecimal maxScore, String status, BigDecimal score, String remark) {}

    /** Per student of a class, over the assignments due in a period (cancelled ones are left out). {@code earned} and {@code possible} cover only the marked ones. */
    public record SummaryRow(long enrollmentId, long studentId, String studentCode, String nameKm, int assigned, int submitted, int late, int notSubmitted, int excused,
                             int marked, BigDecimal earned, BigDecimal possible) {}

    private static final String SELECT = """
            SELECT h.id, h.class_id, c.name_km, g.name_km, h.subject_id, s.name_km, s.parent_id, ps.name_km, h.title, h.description, h.assigned_date, h.due_date, h.status, h.remark, h.version,
                   h.max_score_x100,
                   (SELECT count(*) FROM enrollments e WHERE e.class_id = h.class_id AND e.status IN %s),
                   (SELECT count(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'SUBMITTED'),
                   (SELECT count(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'LATE'),
                   (SELECT count(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'NOT_SUBMITTED'),
                   (SELECT count(*) FROM homework_records r WHERE r.homework_id = h.id AND r.status = 'EXCUSED'),
                   (SELECT count(*) FROM homework_records r WHERE r.homework_id = h.id AND r.score_x100 IS NOT NULL),
                   (SELECT COALESCE(sum(r.score_x100), 0) FROM homework_records r WHERE r.homework_id = h.id)
            FROM homework h JOIN classes c ON c.id = h.class_id JOIN grades g ON g.id = c.grade_id
                 JOIN subjects s ON s.id = h.subject_id LEFT JOIN subjects ps ON ps.id = s.parent_id
            """.formatted(ScoreService.ROSTER_STATUSES);

    private static final RowMapper<Item> ITEM = (rs, n) -> {
        long parent = rs.getLong(7);
        Long parentId = rs.wasNull() ? null : parent;   // wasNull() refers to the column read just before it
        String parentName = rs.getString(8);
        long max = rs.getLong(16);
        BigDecimal maxScore = rs.wasNull() ? null : Grading.fromX100(max);
        return new Item(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getLong(5), rs.getString(6), parentId, parentName, rs.getString(9), rs.getString(10),
                rs.getString(11), rs.getString(12), rs.getString(13), rs.getString(14), rs.getLong(15), maxScore,
                rs.getInt(17), rs.getInt(18), rs.getInt(19), rs.getInt(20), rs.getInt(21), rs.getInt(22), Grading.fromX100(rs.getLong(23)));
    };

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public HomeworkService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    /**
     * Every filter is optional; {@code from}/{@code to} limit the DUE date; {@code subjectId} is a subject, and a main subject also matches its sub-subjects.
     * Soonest due first.
     */
    public List<Item> list(Long classId, String status, LocalDate from, LocalDate to, Long subjectId) {
        return jdbc.query(SELECT + """
                WHERE (? IS NULL OR h.class_id = ?) AND (? IS NULL OR h.status = ?) AND (? IS NULL OR h.due_date >= ?) AND (? IS NULL OR h.due_date <= ?)
                  AND (? IS NULL OR h.subject_id = ? OR s.parent_id = ?)
                ORDER BY h.due_date, h.id
                """, ITEM, classId, classId, status, status, from == null ? null : from.toString(), from == null ? null : from.toString(),
                to == null ? null : to.toString(), to == null ? null : to.toString(), subjectId, subjectId, subjectId);
    }

    public Item get(long id) {
        List<Item> found = jdbc.query(SELECT + " WHERE h.id = ?", ITEM, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    @Transactional
    public Item create(Input in) {
        Checked c = check(in, null);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO homework (class_id, subject_id, title, description, assigned_date, due_date, remark, max_score_x100, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                in.classId(), in.subjectId(), c.title, c.description, in.assignedDate().toString(), in.dueDate().toString(), c.remark, c.maxX100, now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM homework", Long.class);
        audit.record("HOMEWORK_CREATED", "homework", id, c.maxX100 == null ? "homework recorded" : "homework recorded, with marks");
        return get(id);
    }

    @Transactional
    public Item update(long id, Input in, long version) {
        Item current = get(id);
        requireOpenYear(current.classId());
        Checked c = check(in, current);
        int changed = jdbc.update("""
                UPDATE homework SET class_id = ?, subject_id = ?, title = ?, description = ?, assigned_date = ?, due_date = ?, remark = ?, max_score_x100 = ?, version = version + 1, updated_at = ?
                WHERE id = ? AND version = ?
                """, in.classId(), in.subjectId(), c.title, c.description, in.assignedDate().toString(), in.dueDate().toString(), c.remark, c.maxX100, clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("HOMEWORK_UPDATED", "homework", id, "homework updated");
        return get(id);
    }

    @Transactional
    public Item setStatus(long id, String status, long version) {
        if (!STATUSES.contains(status)) throw ApiException.validation("status", "INVALID");
        Item current = get(id);
        requireOpenYear(current.classId());
        int changed = jdbc.update("UPDATE homework SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?", status, clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("HOMEWORK_STATUS_CHANGED", "homework", id, "homework marked " + status.toLowerCase());
        return get(id);
    }

    // ---- the students' records of one assignment ---------------------------------------------------------------------------------------------------------------

    /** The students of the class (and anyone who already has a record for this assignment, even if they have since left the class), each with their record or none. */
    public RecordSheet records(long id) {
        Item h = get(id);
        RowMapper<RecordRow> row = (rs, n) -> {
            long score = rs.getLong(6);
            BigDecimal shown = rs.wasNull() ? null : Grading.fromX100(score);   // wasNull() refers to the column read just before it
            return new RecordRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), shown, rs.getString(7));
        };
        List<RecordRow> rows = jdbc.query("SELECT e.id, s.id, s.student_code, s.name_km, r.status, r.score_x100, r.remark "
                + "FROM enrollments e JOIN students s ON s.id = e.student_id "
                + "LEFT JOIN homework_records r ON r.enrollment_id = e.id AND r.homework_id = ? "
                + "WHERE e.class_id = ? AND (e.status IN " + ScoreService.ROSTER_STATUSES + " OR r.id IS NOT NULL) ORDER BY s.id", row, id, h.classId());
        return new RecordSheet(h, rows);
    }

    @Transactional
    public RecordSheet saveRecords(long id, List<RecordEntry> entries) {
        Item h = get(id);
        requireOpenYear(h.classId());
        if (entries.size() > MAX_ENTRIES) throw ApiException.validation("records", "INVALID");
        Long maxX100 = h.maxScore() == null ? null : Grading.toX100(h.maxScore());

        // who may have a record: the class roster, and anyone who already has one
        Set<Long> allowed = new HashSet<>(jdbc.queryForList("SELECT id FROM enrollments WHERE class_id = ? AND status IN " + ScoreService.ROSTER_STATUSES, Long.class, h.classId()));
        // enrollment id -> {row id, status, score x100 or null, remark}
        Map<Long, Object[]> existing = new HashMap<>();
        RowCallbackHandler keep = rs -> {
            long score = rs.getLong(4);
            Long value = rs.wasNull() ? null : score;   // wasNull() refers to the column read just before it
            existing.put(rs.getLong(2), new Object[]{rs.getLong(1), rs.getString(3), value, rs.getString(5)});
        };
        jdbc.query("SELECT id, enrollment_id, status, score_x100, remark FROM homework_records WHERE homework_id = ?", keep, id);
        allowed.addAll(existing.keySet());

        Set<Long> seen = new HashSet<>();
        Map<Long, Long> x100 = new HashMap<>();
        for (RecordEntry e : entries) {
            if (!allowed.contains(e.enrollmentId()) || !seen.add(e.enrollmentId())) throw ApiException.validation("records", "INVALID");
            if (e.status() != null && !RECORD_STATUSES.contains(e.status())) throw ApiException.validation("records", "INVALID");
            if (e.score() == null) continue;
            if (maxX100 == null) throw ApiException.validation("records", "NO_MAXIMUM");                 // a homework without marks cannot have one
            if (e.status() == null || !MARKABLE.contains(e.status())) throw ApiException.validation("records", "INVALID");   // a mark belongs to work that was handed in
            long v;
            try {
                v = Grading.toX100(e.score());
            } catch (ArithmeticException ex) {
                throw ApiException.validation("records", "INVALID_NUMBER");
            }
            if (v > maxX100) throw ApiException.validation("records", "OUT_OF_RANGE");
            x100.put(e.enrollmentId(), v);
        }

        String now = clock.instant().toString();
        int added = 0, changed = 0, cleared = 0;
        for (RecordEntry e : entries) {
            Long score = x100.get(e.enrollmentId());
            String remark = KhmerText.free(e.remark());
            boolean empty = e.status() == null && score == null && remark == null;
            Object[] old = existing.get(e.enrollmentId());
            if (old == null) {
                if (empty) continue;   // nothing to keep
                jdbc.update("INSERT INTO homework_records (homework_id, enrollment_id, status, score_x100, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        id, e.enrollmentId(), e.status(), score, remark, now, now);
                added++;
            } else if (empty) {
                jdbc.update("DELETE FROM homework_records WHERE id = ?", old[0]);
                audit.record("HOMEWORK_RECORD_CLEARED", "homework_record", (Long) old[0], "homework record cleared", json((String) old[1], (Long) old[2]), null);
                cleared++;
            } else if (!Objects.equals(old[1], e.status()) || !Objects.equals(old[2], score) || !Objects.equals(old[3], remark)) {
                jdbc.update("UPDATE homework_records SET status = ?, score_x100 = ?, remark = ?, updated_at = ? WHERE id = ?", e.status(), score, remark, now, old[0]);
                if (!Objects.equals(old[1], e.status()) || !Objects.equals(old[2], score)) {   // a status or a mark that was there is kept in the history (numbers and the status only)
                    audit.record("HOMEWORK_RECORD_CORRECTED", "homework_record", (Long) old[0], "homework record corrected", json((String) old[1], (Long) old[2]), json(e.status(), score));
                }
                changed++;
            }
        }
        if (added + changed + cleared > 0) {
            audit.record("HOMEWORK_RECORDS_SAVED", "homework", id, "homework records saved: " + added + " entered, " + changed + " changed, " + cleared + " cleared");
        }
        return records(id);
    }

    /** The status and the mark in hundredths only: no names, no free text. */
    private static String json(String status, Long scoreX100) {
        return "{\"status\":" + (status == null ? "null" : "\"" + status + "\"") + ",\"scoreX100\":" + (scoreX100 == null ? "null" : scoreX100) + "}";
    }

    // ---- history and summaries ----------------------------------------------------------------------------------------------------------------------------------

    /** Every assignment of every class the student was in, newest due date first, with the student's own record (or none). */
    public List<HistoryRow> historyOf(long studentId) {
        if (count("SELECT count(*) FROM students WHERE id = ?", studentId) == 0) throw ApiException.notFound();
        RowMapper<HistoryRow> row = (rs, n) -> {
            long max = rs.getLong(13);
            BigDecimal maxScore = rs.wasNull() ? null : Grading.fromX100(max);   // wasNull() refers to the column read just before it
            String status = rs.getString(14);
            long score = rs.getLong(15);
            BigDecimal shown = rs.wasNull() ? null : Grading.fromX100(score);
            return new HistoryRow(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getLong(7), rs.getString(8), rs.getString(9),
                    rs.getString(10), rs.getString(11), rs.getString(12), maxScore, status, shown, rs.getString(16));
        };
        return jdbc.query("""
                SELECT h.id, h.title, h.class_id, c.name_km, g.name_km, y.name_km, h.subject_id, s.name_km, ps.name_km, h.assigned_date, h.due_date, h.status, h.max_score_x100,
                       r.status, r.score_x100, r.remark
                FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id JOIN academic_years y ON y.id = c.academic_year_id
                     JOIN homework h ON h.class_id = c.id JOIN subjects s ON s.id = h.subject_id LEFT JOIN subjects ps ON ps.id = s.parent_id
                     LEFT JOIN homework_records r ON r.homework_id = h.id AND r.enrollment_id = e.id
                WHERE e.student_id = ? AND (e.status IN %s OR r.id IS NOT NULL)
                ORDER BY h.due_date DESC, h.id DESC
                """.formatted(ScoreService.ROSTER_STATUSES), row, studentId);
    }

    /** Per student of the class, over the assignments due between {@code from} and {@code to} (both optional) about the subject (optional; a main subject includes its sub-subjects). */
    public List<SummaryRow> summary(long classId, LocalDate from, LocalDate to, Long subjectId) {
        if (count("SELECT count(*) FROM classes WHERE id = ?", classId) == 0) throw ApiException.notFound();
        String f = from == null ? null : from.toString();
        String t = to == null ? null : to.toString();
        RowMapper<SummaryRow> row = (rs, n) -> new SummaryRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getInt(6), rs.getInt(7), rs.getInt(8), rs.getInt(9),
                rs.getInt(10), Grading.fromX100(rs.getLong(11)), Grading.fromX100(rs.getLong(12)));
        return jdbc.query("""
                SELECT e.id, s.id, s.student_code, s.name_km,
                       count(h.id),
                       COALESCE(sum(CASE WHEN r.status = 'SUBMITTED' THEN 1 ELSE 0 END), 0),
                       COALESCE(sum(CASE WHEN r.status = 'LATE' THEN 1 ELSE 0 END), 0),
                       COALESCE(sum(CASE WHEN r.status = 'NOT_SUBMITTED' THEN 1 ELSE 0 END), 0),
                       COALESCE(sum(CASE WHEN r.status = 'EXCUSED' THEN 1 ELSE 0 END), 0),
                       COALESCE(sum(CASE WHEN r.score_x100 IS NOT NULL THEN 1 ELSE 0 END), 0),
                       COALESCE(sum(r.score_x100), 0),
                       COALESCE(sum(CASE WHEN r.score_x100 IS NOT NULL THEN h.max_score_x100 END), 0)
                FROM enrollments e JOIN students s ON s.id = e.student_id
                     LEFT JOIN homework h ON h.class_id = e.class_id AND h.status <> 'CANCELLED' AND (? IS NULL OR h.due_date >= ?) AND (? IS NULL OR h.due_date <= ?)
                          AND (? IS NULL OR h.subject_id = ? OR h.subject_id IN (SELECT id FROM subjects WHERE parent_id = ?))
                     LEFT JOIN homework_records r ON r.homework_id = h.id AND r.enrollment_id = e.id
                WHERE e.class_id = ? AND e.status IN %s
                GROUP BY e.id, s.id, s.student_code, s.name_km
                ORDER BY s.id
                """.formatted(ScoreService.ROSTER_STATUSES), row, f, f, t, t, subjectId, subjectId, subjectId, classId);
    }

    // ---- validation -------------------------------------------------------------------------------------------------------------------------------------------------

    private record Checked(String title, String description, String remark, Long maxX100) {}

    /** {@code current} is the stored homework when it is being edited, so the rules about what already has marks can be applied. */
    private Checked check(Input in, Item current) {
        String title = KhmerText.name(in.title());
        if (title == null) throw ApiException.validation("title", "REQUIRED");
        if (in.assignedDate() == null || in.dueDate() == null) throw ApiException.validation(in.assignedDate() == null ? "assignedDate" : "dueDate", "REQUIRED");
        if (in.dueDate().isBefore(in.assignedDate())) throw ApiException.validation("dueDate", "DUE_BEFORE_ASSIGNED");
        if (count("SELECT count(*) FROM classes WHERE id = ?", in.classId()) == 0) throw ApiException.validation("classId", "INVALID");
        // a main subject or a sub-subject (the owner's decision of 2026-11-05: homework may be about either)
        if (count("SELECT count(*) FROM subjects WHERE id = ?", in.subjectId()) == 0) throw ApiException.validation("subjectId", "INVALID");
        requireOpenYear(in.classId());

        Long maxX100 = null;
        if (in.maxScore() != null) {
            try {
                maxX100 = Grading.toX100(in.maxScore());
            } catch (ArithmeticException e) {
                throw ApiException.validation("maxScore", "INVALID_NUMBER");
            }
            if (maxX100 <= 0 || maxX100 > MAX_LIMIT_X100) throw ApiException.validation("maxScore", "OUT_OF_RANGE");
        }
        if (current != null) {
            if (current.classId() != in.classId() && count("SELECT count(*) FROM homework_records WHERE homework_id = ?", current.id()) > 0) {
                throw ApiException.validation("classId", "HOMEWORK_HAS_RECORDS");   // the records belong to the students of the first class
            }
            long marked = count("SELECT count(*) FROM homework_records WHERE homework_id = ? AND score_x100 IS NOT NULL", current.id());
            if (maxX100 == null && marked > 0) throw ApiException.validation("maxScore", "HOMEWORK_HAS_MARKS");   // marks cannot be switched off: cancel the homework instead
            Long highest = jdbc.queryForObject("SELECT MAX(score_x100) FROM homework_records WHERE homework_id = ?", Long.class, current.id());
            if (maxX100 != null && highest != null && maxX100 < highest) throw ApiException.validation("maxScore", "OUT_OF_RANGE");   // not below a mark already entered
        }
        return new Checked(title, KhmerText.free(in.description()), KhmerText.free(in.remark()), maxX100);
    }

    private void requireOpenYear(long classId) {
        List<String> status = jdbc.queryForList("SELECT y.status FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = ?", String.class, classId);
        if (!status.isEmpty() && AcademicYearService.CLOSED.equals(status.get(0))) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }
}
