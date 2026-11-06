package kh.school.sms.exam;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Examinations (monthly, midterm, final or your own) of an academic year, and what each covers per grade: the main subjects, the
 * maximum score and the weight of each, and, for a main subject that has sub-subjects, the sub-subject rows its score is the sum of.
 * A new examination starts with every active main subject of every grade (and its active sub-subjects of that grade) at maximum 100 and
 * weight 1; the school edits that. An examination keeps its OWN copy of what it was set up with (names, order, structure): changing the
 * subject list later never reaches it. From the first stored score on the structure is frozen: no row is added or removed, and only a
 * maximum or a weight may still be corrected. Nothing changes in a CLOSED year, and nothing that already has scores can be removed.
 */
@Service
public class ExaminationService {
    public static final List<String> KINDS = List.of("MONTHLY", "MIDTERM", "FINAL", "OTHER");
    /** The placeholder maximum a row starts with (100, in hundredths): the school's real maxima replace it. */
    static final long PLACEHOLDER_MAX_X100 = 10000;

    /** {@code frozen}: the first score of any kind was stored, so the subject structure can no longer change. */
    public record Exam(long id, long academicYearId, String yearName, String nameKm, String kind, Integer termNo, String startDate, String endDate, long version, int scoreCount, boolean frozen) {}
    public record Input(String nameKm, String kind, Integer termNo, LocalDate startDate, LocalDate endDate) {}
    public record ExamSubSubject(long id, long subjectId, String subjectName, BigDecimal maxScore, int scoreCount) {}
    /**
     * A main subject of an examination and grade. {@code scoreSource} is DIRECT (scores are typed on this row) or SUB_SUBJECTS (its maximum is the sum of the
     * sub-subjects' and its score the sum of theirs: read-only). {@code subjectName} is the name the examination was set up with.
     */
    public record ExamSubject(long id, long gradeId, int gradeLevel, long subjectId, String subjectName, BigDecimal maxScore, BigDecimal weight, int scoreCount, String scoreSource,
                              List<ExamSubSubject> subSubjects) {}

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public ExaminationService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    private static final String SELECT = """
            SELECT e.id, e.academic_year_id, y.name_km, e.name_km, e.kind, e.term_no, e.start_date, e.end_date, e.version,
                   (SELECT count(*) FROM student_scores ss JOIN examination_subjects es ON es.id = ss.examination_subject_id WHERE es.examination_id = e.id)
                   + (SELECT count(*) FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id
                      JOIN examination_subjects es ON es.id = ess.examination_subject_id WHERE es.examination_id = e.id),
                   e.structure_frozen_at IS NOT NULL
            FROM examinations e JOIN academic_years y ON y.id = e.academic_year_id
            """;

    private static Exam row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        int term = rs.getInt(6);
        Integer termNo = rs.wasNull() ? null : term;
        return new Exam(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), termNo, rs.getString(7), rs.getString(8), rs.getLong(9), rs.getInt(10), rs.getInt(11) == 1);
    }

    public List<Exam> list(Long yearId) {
        return jdbc.query(SELECT + " WHERE (? IS NULL OR e.academic_year_id = ?) ORDER BY y.start_date DESC, e.id", ExaminationService::row, yearId, yearId);
    }

    public Exam get(long id) {
        List<Exam> found = jdbc.query(SELECT + " WHERE e.id = ?", ExaminationService::row, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    @Transactional
    public Exam create(long yearId, Input in) {
        requireOpenYear(yearId, true);
        Checked c = check(in, yearId, null);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO examinations (academic_year_id, name_km, kind, term_no, start_date, end_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                yearId, c.name, in.kind(), in.termNo(), c.start, c.end, now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM examinations", Long.class);
        // every active MAIN subject of every grade, maximum 100, weight 1: the school edits it afterwards. The examination keeps its own copy of the name and order.
        jdbc.update("""
                INSERT INTO examination_subjects (examination_id, grade_id, subject_id, max_score_x100, weight_x100, name_km, sort_order, created_at)
                SELECT ?, gs.grade_id, gs.subject_id, ?, 100, s.name_km, s.sort_order, ?
                FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id WHERE s.is_active = 1 AND s.parent_id IS NULL
                """, id, PLACEHOLDER_MAX_X100, now);
        // the active sub-subjects each main subject has in that grade, at the same placeholder maximum; the main subject then becomes the sum of them
        jdbc.update("""
                INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at)
                SELECT es.id, s.id, s.name_km, s.sort_order, ?, ?
                FROM examination_subjects es JOIN subjects s ON s.parent_id = es.subject_id AND s.is_active = 1
                JOIN grade_subjects gs ON gs.grade_id = es.grade_id AND gs.subject_id = s.id
                WHERE es.examination_id = ?
                """, PLACEHOLDER_MAX_X100, now, id);
        for (Long esId : jdbc.queryForList("SELECT id FROM examination_subjects WHERE examination_id = ?", Long.class, id)) syncMain(esId);
        audit.record("EXAMINATION_CREATED", "examination", id, "examination created");
        return get(id);
    }

    @Transactional
    public Exam update(long id, Input in, long version) {
        Exam current = get(id);
        requireOpenYear(current.academicYearId(), false);
        Checked c = check(in, current.academicYearId(), id);
        int changed = jdbc.update("UPDATE examinations SET name_km = ?, kind = ?, term_no = ?, start_date = ?, end_date = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
                c.name, in.kind(), in.termNo(), c.start, c.end, clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("EXAMINATION_UPDATED", "examination", id, "examination updated");
        return get(id);
    }

    /** Only an examination nobody entered a score or a comment for. */
    @Transactional
    public void delete(long id) {
        Exam e = get(id);
        requireOpenYear(e.academicYearId(), false);
        Integer comments = jdbc.queryForObject("SELECT count(*) FROM report_card_comments WHERE examination_id = ?", Integer.class, id);
        if (e.scoreCount() > 0 || (comments != null && comments > 0)) throw new ApiException(HttpStatus.CONFLICT, "EXAMINATION_HAS_SCORES");
        jdbc.update("DELETE FROM examination_sub_subjects WHERE examination_subject_id IN (SELECT id FROM examination_subjects WHERE examination_id = ?)", id);
        jdbc.update("DELETE FROM examination_subjects WHERE examination_id = ?", id);
        jdbc.update("DELETE FROM examinations WHERE id = ?", id);
        audit.record("EXAMINATION_DELETED", "examination", id, "examination deleted (it had no scores)");
    }

    public List<ExamSubject> subjects(long examId) {
        get(examId);
        Map<Long, List<ExamSubSubject>> subsOf = new HashMap<>();
        jdbc.query("""
                SELECT ess.examination_subject_id, ess.id, ess.subject_id, ess.name_km, ess.max_score_x100,
                       (SELECT count(*) FROM sub_subject_scores sc WHERE sc.examination_sub_subject_id = ess.id)
                FROM examination_sub_subjects ess JOIN examination_subjects es ON es.id = ess.examination_subject_id
                WHERE es.examination_id = ? ORDER BY ess.sort_order, ess.id
                """, rs -> {
            subsOf.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
                    .add(new ExamSubSubject(rs.getLong(2), rs.getLong(3), rs.getString(4), Grading.fromX100(rs.getLong(5)), rs.getInt(6)));
        }, examId);
        return jdbc.query("""
                SELECT es.id, es.grade_id, g.level, es.subject_id, COALESCE(es.name_km, s.name_km), es.max_score_x100, es.weight_x100,
                       (SELECT count(*) FROM student_scores ss WHERE ss.examination_subject_id = es.id)
                       + (SELECT count(*) FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id WHERE ess.examination_subject_id = es.id),
                       es.score_source
                FROM examination_subjects es JOIN grades g ON g.id = es.grade_id JOIN subjects s ON s.id = es.subject_id
                WHERE es.examination_id = ? ORDER BY g.level, COALESCE(es.sort_order, s.sort_order), s.id
                """, (rs, n) -> new ExamSubject(rs.getLong(1), rs.getLong(2), rs.getInt(3), rs.getLong(4), rs.getString(5), Grading.fromX100(rs.getLong(6)), Grading.fromX100(rs.getLong(7)), rs.getInt(8),
                rs.getString(9), subsOf.getOrDefault(rs.getLong(1), List.of())), examId);
    }

    /** Adds a main subject to an examination for one grade. A main subject that has sub-subjects in that grade brings them along; its maximum is then their sum. */
    @Transactional
    public ExamSubject addSubject(long examId, long gradeId, long subjectId, BigDecimal max, BigDecimal weight) {
        requireOpenYear(get(examId).academicYearId(), false);
        if (count("SELECT count(*) FROM grades WHERE id = ?", gradeId) == 0) throw ApiException.validation("gradeId", "INVALID");
        if (count("SELECT count(*) FROM subjects WHERE id = ? AND parent_id IS NULL", subjectId) == 0) throw ApiException.validation("subjectId", "INVALID");   // a sub-subject joins through its main subject
        if (count("SELECT count(*) FROM examination_subjects WHERE examination_id = ? AND grade_id = ? AND subject_id = ?", examId, gradeId, subjectId) > 0) throw ApiException.duplicate("subjectId");
        requireNotFrozen(examId);
        long maxX100 = positiveX100(max, "maxScore");
        long weightX100 = positiveX100(weight, "weight");
        String now = clock.instant().toString();
        jdbc.update("""
                INSERT INTO examination_subjects (examination_id, grade_id, subject_id, max_score_x100, weight_x100, name_km, sort_order, created_at)
                SELECT ?, ?, s.id, ?, ?, s.name_km, s.sort_order, ? FROM subjects s WHERE s.id = ?
                """, examId, gradeId, maxX100, weightX100, now, subjectId);
        long id = jdbc.queryForObject("SELECT max(id) FROM examination_subjects", Long.class);
        jdbc.update("""
                INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at)
                SELECT ?, s.id, s.name_km, s.sort_order, ?, ?
                FROM subjects s JOIN grade_subjects gs ON gs.subject_id = s.id AND gs.grade_id = ?
                WHERE s.parent_id = ? AND s.is_active = 1
                """, id, PLACEHOLDER_MAX_X100, now, gradeId, subjectId);
        syncMain(id);
        audit.record("EXAMINATION_SUBJECT_ADDED", "examination", examId, "subject added to the examination");
        return subjects(examId).stream().filter(s -> s.id() == id).findFirst().orElseThrow();
    }

    /** The new maximum may not be below a score already entered; a main subject made of sub-subjects takes its maximum from them. Allowed after the first score, as before. */
    @Transactional
    public ExamSubject updateSubject(long examId, long esId, BigDecimal max, BigDecimal weight) {
        requireOpenYear(get(examId).academicYearId(), false);
        ExamSubject s = subjects(examId).stream().filter(x -> x.id() == esId).findFirst().orElseThrow(ApiException::notFound);
        long maxX100 = positiveX100(max, "maxScore");
        long weightX100 = positiveX100(weight, "weight");
        if ("SUB_SUBJECTS".equals(s.scoreSource())) {
            if (maxX100 != Grading.toX100(s.maxScore())) throw ApiException.validation("maxScore", "DERIVED_MAXIMUM");   // change the sub-subjects' maxima instead
            jdbc.update("UPDATE examination_subjects SET weight_x100 = ? WHERE id = ?", weightX100, esId);
        } else {
            Long highest = jdbc.queryForObject("SELECT COALESCE(MAX(score_x100), 0) FROM student_scores WHERE examination_subject_id = ?", Long.class, esId);
            if (highest != null && maxX100 < highest) throw ApiException.validation("maxScore", "OUT_OF_RANGE");
            jdbc.update("UPDATE examination_subjects SET max_score_x100 = ?, weight_x100 = ? WHERE id = ?", maxX100, weightX100, esId);
        }
        audit.record("EXAMINATION_SUBJECT_UPDATED", "examination", examId, "maximum score or weight of a subject changed");
        return subjects(examId).stream().filter(x -> x.id() == s.id()).findFirst().orElseThrow();
    }

    @Transactional
    public void removeSubject(long examId, long esId) {
        requireOpenYear(get(examId).academicYearId(), false);
        ExamSubject s = subjects(examId).stream().filter(x -> x.id() == esId).findFirst().orElseThrow(ApiException::notFound);
        if (s.scoreCount() > 0) throw new ApiException(HttpStatus.CONFLICT, "EXAM_SUBJECT_HAS_SCORES");
        requireNotFrozen(examId);
        jdbc.update("DELETE FROM examination_sub_subjects WHERE examination_subject_id = ?", esId);
        jdbc.update("DELETE FROM examination_subjects WHERE id = ?", esId);
        audit.record("EXAMINATION_SUBJECT_REMOVED", "examination", examId, "subject removed from the examination");
    }

    // ---- sub-subject rows ---------------------------------------------------------------------------------------

    /** Adds a sub-subject to the examination for one grade; its main subject must already be in the examination for that grade. */
    @Transactional
    public ExamSubject addSubSubject(long examId, long gradeId, long subjectId, BigDecimal max) {
        requireOpenYear(get(examId).academicYearId(), false);
        if (count("SELECT count(*) FROM grades WHERE id = ?", gradeId) == 0) throw ApiException.validation("gradeId", "INVALID");
        List<Long> parent = jdbc.queryForList("SELECT parent_id FROM subjects WHERE id = ? AND parent_id IS NOT NULL", Long.class, subjectId);
        if (parent.isEmpty()) throw ApiException.validation("subjectId", "INVALID");   // only a sub-subject can be added here
        List<Long> main = jdbc.queryForList("SELECT id FROM examination_subjects WHERE examination_id = ? AND grade_id = ? AND subject_id = ?", Long.class, examId, gradeId, parent.get(0));
        if (main.isEmpty()) throw ApiException.validation("subjectId", "MAIN_NOT_IN_EXAMINATION");
        if (count("SELECT count(*) FROM examination_sub_subjects WHERE examination_subject_id = ? AND subject_id = ?", main.get(0), subjectId) > 0) throw ApiException.duplicate("subjectId");
        requireNotFrozen(examId);
        jdbc.update("""
                INSERT INTO examination_sub_subjects (examination_subject_id, subject_id, name_km, sort_order, max_score_x100, created_at)
                SELECT ?, s.id, s.name_km, s.sort_order, ?, ? FROM subjects s WHERE s.id = ?
                """, main.get(0), positiveX100(max, "maxScore"), clock.instant().toString(), subjectId);
        syncMain(main.get(0));
        audit.record("EXAMINATION_SUB_SUBJECT_ADDED", "examination", examId, "sub-subject added to the examination");
        return subjects(examId).stream().filter(s -> s.id() == main.get(0)).findFirst().orElseThrow();
    }

    /** The new maximum may not be below a score already entered; allowed after the first score. The main subject's maximum follows. */
    @Transactional
    public ExamSubject updateSubSubject(long examId, long rowId, BigDecimal max) {
        requireOpenYear(get(examId).academicYearId(), false);
        long main = mainRowOf(examId, rowId);
        long maxX100 = positiveX100(max, "maxScore");
        Long highest = jdbc.queryForObject("SELECT COALESCE(MAX(score_x100), 0) FROM sub_subject_scores WHERE examination_sub_subject_id = ?", Long.class, rowId);
        if (highest != null && maxX100 < highest) throw ApiException.validation("maxScore", "OUT_OF_RANGE");
        jdbc.update("UPDATE examination_sub_subjects SET max_score_x100 = ? WHERE id = ?", maxX100, rowId);
        syncMain(main);
        audit.record("EXAMINATION_SUB_SUBJECT_UPDATED", "examination", examId, "maximum score of a sub-subject changed");
        return subjects(examId).stream().filter(s -> s.id() == main).findFirst().orElseThrow();
    }

    @Transactional
    public void removeSubSubject(long examId, long rowId) {
        requireOpenYear(get(examId).academicYearId(), false);
        long main = mainRowOf(examId, rowId);
        if (count("SELECT count(*) FROM sub_subject_scores WHERE examination_sub_subject_id = ?", rowId) > 0) throw new ApiException(HttpStatus.CONFLICT, "EXAM_SUBJECT_HAS_SCORES");
        requireNotFrozen(examId);
        jdbc.update("DELETE FROM examination_sub_subjects WHERE id = ?", rowId);
        syncMain(main);
        audit.record("EXAMINATION_SUB_SUBJECT_REMOVED", "examination", examId, "sub-subject removed from the examination");
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    /** The main-subject row a sub-subject row belongs to, which must be one of this examination's. */
    private long mainRowOf(long examId, long subRowId) {
        List<Long> main = jdbc.queryForList("""
                SELECT es.id FROM examination_sub_subjects ess JOIN examination_subjects es ON es.id = ess.examination_subject_id
                WHERE ess.id = ? AND es.examination_id = ?
                """, Long.class, subRowId, examId);
        if (main.isEmpty()) throw ApiException.notFound();
        return main.get(0);
    }

    /** A main-subject row with sub-subject rows is the sum of them (its maximum is kept equal to their sum); without any it is typed directly again. */
    private void syncMain(long esId) {
        if (count("SELECT count(*) FROM examination_sub_subjects WHERE examination_subject_id = ?", esId) > 0) {
            jdbc.update("""
                    UPDATE examination_subjects SET score_source = 'SUB_SUBJECTS',
                           max_score_x100 = (SELECT sum(max_score_x100) FROM examination_sub_subjects WHERE examination_subject_id = ?)
                    WHERE id = ?
                    """, esId, esId);
        } else {
            jdbc.update("UPDATE examination_subjects SET score_source = 'DIRECT' WHERE id = ? AND score_source = 'SUB_SUBJECTS'", esId);
        }
    }

    /** From the first stored score of any kind on the structure of the examination is frozen. */
    private void requireNotFrozen(long examId) {
        if (count("SELECT count(*) FROM examinations WHERE id = ? AND structure_frozen_at IS NOT NULL", examId) > 0) throw new ApiException(HttpStatus.CONFLICT, "EXAM_STRUCTURE_FROZEN");
    }

    private record Checked(String name, String start, String end) {}

    private Checked check(Input in, long yearId, Long ownId) {
        String name = KhmerText.name(in.nameKm());
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        if (!KINDS.contains(in.kind())) throw ApiException.validation("kind", "INVALID");
        if (in.termNo() != null && (in.termNo() < 1 || in.termNo() > 12)) throw ApiException.validation("termNo", "OUT_OF_RANGE");
        if (in.startDate() != null && in.endDate() != null && in.endDate().isBefore(in.startDate())) throw ApiException.validation("endDate", "END_BEFORE_START");
        int clash = ownId == null
                ? count("SELECT count(*) FROM examinations WHERE academic_year_id = ? AND name_km = ?", yearId, name)
                : count("SELECT count(*) FROM examinations WHERE academic_year_id = ? AND name_km = ? AND id <> ?", yearId, name, ownId);
        if (clash > 0) throw ApiException.duplicate("nameKm");
        return new Checked(name, in.startDate() == null ? null : in.startDate().toString(), in.endDate() == null ? null : in.endDate().toString());
    }

    /** @param body true when the year id comes from the request body (an unknown year is then a field error, not a 404) */
    private void requireOpenYear(long yearId, boolean body) {
        List<String> status = jdbc.queryForList("SELECT status FROM academic_years WHERE id = ?", String.class, yearId);
        if (status.isEmpty()) throw body ? ApiException.validation("academicYearId", "INVALID") : ApiException.notFound();
        if (AcademicYearService.CLOSED.equals(status.get(0))) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    private static long positiveX100(BigDecimal value, String field) {
        try {
            long x100 = Grading.toX100(value);
            if (x100 <= 0 || x100 > 100_000_00L) throw new ArithmeticException("range");
            return x100;
        } catch (ArithmeticException | NullPointerException e) {
            throw ApiException.validation(field, "INVALID_NUMBER");
        }
    }
}
