package kh.school.sms.exam;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.academic.SchoolClass;
import kh.school.sms.academic.SchoolClassRepository;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Score entry for one subject of one class in one examination. The subject is a main subject typed directly, or a sub-subject (a main subject made of sub-subjects is
 * the sum of them and is not typed: its score is worked out by ResultsService). A blank score is "not entered yet", ABSENT is "did not sit the
 * exam", and 0 is a real zero: three different things. Entering a score for a student who already has one is a correction and
 * keeps the old value in the audit trail (numbers only).
 */
@Service
public class ScoreService {
    /** Enrollments that finished the year in the class (or are still in it): the people an exam of that year is sat by. */
    public static final String ROSTER_STATUSES = "('ACTIVE', 'PROMOTED', 'REPEATED', 'GRADUATED')";
    static final int MAX_ENTRIES = 500;

    public record ScoreRow(long enrollmentId, long studentId, String studentCode, String nameKm, BigDecimal score, boolean absent, String remark) {}
    /** {@code examSubjectId} is the row the scores belong to: an examination_subjects row, or, when {@code subSubject}, an examination_sub_subjects row. */
    public record ScoreSheet(long examinationId, long classId, long subjectId, long examSubjectId, BigDecimal maxScore, List<ScoreRow> rows, boolean subSubject) {}
    public record ScoreEntry(long enrollmentId, BigDecimal score, boolean absent, String remark) {}

    private record Ctx(SchoolClass schoolClass, long examSubjectId, long maxX100, boolean sub) {
        String table() { return sub ? "sub_subject_scores" : "student_scores"; }
        String column() { return sub ? "examination_sub_subject_id" : "examination_subject_id"; }
    }

    private final JdbcTemplate jdbc;
    private final SchoolClassRepository classes;
    private final AuditService audit;
    private final Clock clock;

    public ScoreService(JdbcTemplate jdbc, SchoolClassRepository classes, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.classes = classes;
        this.audit = audit;
        this.clock = clock;
    }

    private Ctx context(long examId, long classId, long subjectId) {
        List<Long> years = jdbc.queryForList("SELECT academic_year_id FROM examinations WHERE id = ?", Long.class, examId);
        if (years.isEmpty()) throw ApiException.notFound();
        SchoolClass c = classes.findById(classId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        if (!c.getAcademicYearId().equals(years.get(0))) throw ApiException.validation("classId", "INVALID");   // the class belongs to another year
        List<Object[]> es = jdbc.query("SELECT id, max_score_x100, score_source FROM examination_subjects WHERE examination_id = ? AND grade_id = ? AND subject_id = ?",
                (rs, n) -> new Object[]{rs.getLong(1), rs.getLong(2), rs.getString(3)}, examId, c.getGradeId(), subjectId);
        if (!es.isEmpty()) {
            // a main subject made of sub-subjects is not typed: its score is the sum of theirs
            if ("SUB_SUBJECTS".equals(es.get(0)[2])) throw ApiException.validation("subjectId", "ENTER_AT_SUB_SUBJECTS");
            return new Ctx(c, (long) es.get(0)[0], (long) es.get(0)[1], false);
        }
        List<long[]> sub = jdbc.query("""
                SELECT ess.id, ess.max_score_x100 FROM examination_sub_subjects ess JOIN examination_subjects es ON es.id = ess.examination_subject_id
                WHERE es.examination_id = ? AND es.grade_id = ? AND ess.subject_id = ?
                """, (rs, n) -> new long[]{rs.getLong(1), rs.getLong(2)}, examId, c.getGradeId(), subjectId);
        if (sub.isEmpty()) throw ApiException.validation("subjectId", "INVALID");   // this examination does not cover that subject for the grade
        return new Ctx(c, sub.get(0)[0], sub.get(0)[1], true);
    }

    public ScoreSheet sheet(long examId, long classId, long subjectId) {
        Ctx ctx = context(examId, classId, subjectId);
        String sql = "SELECT e.id, s.id, s.student_code, s.name_km, sc.score_x100, COALESCE(sc.is_absent, 0), sc.remark "
                + "FROM enrollments e JOIN students s ON s.id = e.student_id "
                + "LEFT JOIN " + ctx.table() + " sc ON sc.enrollment_id = e.id AND sc." + ctx.column() + " = ? "
                + "WHERE e.class_id = ? AND e.status IN " + ROSTER_STATUSES + " ORDER BY s.id";
        List<ScoreRow> rows = jdbc.query(sql,
                (rs, n) -> {
                    long score = rs.getLong(5);
                    BigDecimal shown = rs.wasNull() ? null : Grading.fromX100(score);   // wasNull() refers to the column read just before it
                    return new ScoreRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), shown, rs.getInt(6) == 1, rs.getString(7));
                }, ctx.examSubjectId(), classId);
        return new ScoreSheet(examId, classId, subjectId, ctx.examSubjectId(), Grading.fromX100(ctx.maxX100()), rows, ctx.sub());
    }

    @Transactional
    public ScoreSheet save(long examId, long classId, long subjectId, List<ScoreEntry> entries) {
        Ctx ctx = context(examId, classId, subjectId);
        String status = jdbc.queryForObject("SELECT status FROM academic_years WHERE id = ?", String.class, ctx.schoolClass().getAcademicYearId());
        if (AcademicYearService.CLOSED.equals(status)) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
        if (entries.size() > MAX_ENTRIES) throw ApiException.validation("scores", "INVALID");

        Set<Long> roster = new HashSet<>(jdbc.queryForList("SELECT id FROM enrollments WHERE class_id = ? AND status IN " + ROSTER_STATUSES, Long.class, classId));
        Set<Long> seen = new HashSet<>();
        Map<Long, Long> x100 = new HashMap<>();
        for (ScoreEntry e : entries) {
            if (!roster.contains(e.enrollmentId()) || !seen.add(e.enrollmentId()) || (e.absent() && e.score() != null)) throw ApiException.validation("scores", "INVALID");
            if (e.score() != null) {
                long v;
                try {
                    v = Grading.toX100(e.score());
                } catch (ArithmeticException ex) {
                    throw ApiException.validation("scores", "INVALID_NUMBER");
                }
                if (v > ctx.maxX100()) throw ApiException.validation("scores", "OUT_OF_RANGE");
                x100.put(e.enrollmentId(), v);
            }
        }

        // enrollment id -> {row id, score or null, absent}
        Map<Long, Object[]> existing = new HashMap<>();
        jdbc.query("SELECT id, enrollment_id, score_x100, is_absent, remark FROM " + ctx.table() + " WHERE " + ctx.column() + " = ?", rs -> {
            long score = rs.getLong(3);
            Long value = rs.wasNull() ? null : score;   // wasNull() refers to the column read just before it
            existing.put(rs.getLong(2), new Object[]{rs.getLong(1), value, rs.getInt(4) == 1, rs.getString(5)});
        }, ctx.examSubjectId());

        String now = clock.instant().toString();
        int added = 0, corrected = 0;
        for (ScoreEntry e : entries) {
            Long score = x100.get(e.enrollmentId());
            String remark = KhmerText.free(e.remark());
            Object[] old = existing.get(e.enrollmentId());
            if (old == null) {
                if (score == null && !e.absent() && remark == null) continue;   // nothing to store
                jdbc.update("INSERT INTO " + ctx.table() + " (" + ctx.column() + ", enrollment_id, score_x100, is_absent, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        ctx.examSubjectId(), e.enrollmentId(), score, e.absent() ? 1 : 0, remark, now, now);
                added++;
            } else if (!Objects.equals(old[1], score) || (boolean) old[2] != e.absent() || !Objects.equals(old[3], remark)) {
                jdbc.update("UPDATE " + ctx.table() + " SET score_x100 = ?, is_absent = ?, remark = ?, updated_at = ? WHERE id = ?", score, e.absent() ? 1 : 0, remark, now, old[0]);
                if (old[1] != null || (boolean) old[2]) {   // it had a value: the correction keeps it
                    audit.record("SCORE_CORRECTED", ctx.sub() ? "sub_subject_score" : "student_score", (Long) old[0], "score corrected", json(old[1], (boolean) old[2]), json(score, e.absent()));
                }
                corrected++;
            }
        }
        // From the first stored score of any kind on, the examination is graded with the scale that is the default right now (V5): later edits of the scale or a
        // different default never change this examination's results. Its subject structure is frozen at the same moment (V8).
        String anyScore = "(EXISTS (SELECT 1 FROM student_scores sc JOIN examination_subjects es ON es.id = sc.examination_subject_id WHERE es.examination_id = ?)"
                + " OR EXISTS (SELECT 1 FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id"
                + " JOIN examination_subjects es ON es.id = ess.examination_subject_id WHERE es.examination_id = ?))";
        jdbc.update("UPDATE examinations SET grading_scale_id = (SELECT id FROM grading_scales WHERE is_default = 1) WHERE id = ? AND grading_scale_id IS NULL AND " + anyScore, examId, examId, examId);
        jdbc.update("UPDATE examinations SET structure_frozen_at = ? WHERE id = ? AND structure_frozen_at IS NULL AND " + anyScore, now, examId, examId, examId);
        audit.record("SCORES_SAVED", "examination", examId, "scores saved: " + added + " entered, " + corrected + " changed");
        return sheet(examId, classId, subjectId);
    }

    /** Hundredths and a flag only: no names, no free text. */
    private static String json(Object scoreX100, boolean absent) {
        return "{\"scoreX100\":" + (scoreX100 == null ? "null" : scoreX100) + ",\"absent\":" + absent + "}";
    }
}
