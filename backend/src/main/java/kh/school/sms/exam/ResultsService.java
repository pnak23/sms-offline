package kh.school.sms.exam;

import kh.school.sms.academic.SchoolClass;
import kh.school.sms.academic.SchoolClassRepository;
import kh.school.sms.common.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Totals, percentages, bands, pass / fail and ranks of an examination for one class, and one student's results across
 * examinations. All arithmetic is in {@link Grading}; this class only gathers the numbers.
 *
 * <p>Only MAIN subjects are ever counted. A main subject made of sub-subjects (score source SUB_SUBJECTS) has no score of its own: its maximum is the sum of its
 * sub-subjects' maxima and its score the sum of theirs (a sub-subject the student was absent from counts 0, one not entered yet makes the main subject incomplete), so a
 * sub-subject can never be counted on top of its main subject. Names and order are the examination's own copy, never the live subject list.
 */
@Service
public class ResultsService {
    public record SubHeader(long examSubSubjectId, long subjectId, String subjectName, BigDecimal maxScore) {}
    /** {@code scoreSource} is DIRECT or SUB_SUBJECTS; {@code subSubjects} is empty for a subject typed directly. */
    public record SubjectHeader(long examSubjectId, long subjectId, String subjectName, BigDecimal maxScore, BigDecimal weight, String scoreSource, List<SubHeader> subSubjects) {}
    public record SubjectScore(long examSubjectId, BigDecimal score, boolean absent) {}
    public record SubSubjectScore(long examSubSubjectId, BigDecimal score, boolean absent) {}
    /** percent, band, passed and rank are null while the result is incomplete (some subject has nothing entered). {@code subScores} is the detail under the main subjects. */
    public record StudentResult(long enrollmentId, long studentId, String studentCode, String nameKm, List<SubjectScore> scores, BigDecimal total, BigDecimal totalMax,
                                BigDecimal percent, String bandLetter, String bandLabel, Boolean passed, Integer rank, boolean complete, int absentCount, List<SubSubjectScore> subScores) {}
    /** {@code scaleName} is the grading scale this examination is graded with (frozen once its first score was entered). */
    public record Results(long examinationId, long classId, BigDecimal passPercent, String scaleName, List<SubjectHeader> subjects, List<StudentResult> students) {}
    public record StudentExamResult(long examinationId, String examinationName, String kind, Integer termNo, String yearName, long classId, String className,
                                    String gradeName, StudentResult result) {}

    private final JdbcTemplate jdbc;
    private final SchoolClassRepository classes;
    private final GradingScaleService scales;

    public ResultsService(JdbcTemplate jdbc, SchoolClassRepository classes, GradingScaleService scales) {
        this.jdbc = jdbc;
        this.classes = classes;
        this.scales = scales;
    }

    public Results results(long examId, long classId) {
        List<Long> years = jdbc.queryForList("SELECT academic_year_id FROM examinations WHERE id = ?", Long.class, examId);
        if (years.isEmpty()) throw ApiException.notFound();
        SchoolClass c = classes.findById(classId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        if (!c.getAcademicYearId().equals(years.get(0))) throw ApiException.validation("classId", "INVALID");

        // the sub-subject rows of this examination and grade, by the main-subject row they belong to
        Map<Long, List<SubHeader>> subsOf = new HashMap<>();
        jdbc.query("""
                SELECT ess.examination_subject_id, ess.id, ess.subject_id, ess.name_km, ess.max_score_x100
                FROM examination_sub_subjects ess JOIN examination_subjects es ON es.id = ess.examination_subject_id
                WHERE es.examination_id = ? AND es.grade_id = ? ORDER BY ess.sort_order, ess.id
                """, rs -> {
            subsOf.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
                    .add(new SubHeader(rs.getLong(2), rs.getLong(3), rs.getString(4), Grading.fromX100(rs.getLong(5))));
        }, examId, c.getGradeId());

        List<SubjectHeader> subjects = jdbc.query("""
                SELECT es.id, s.id, COALESCE(es.name_km, s.name_km), es.max_score_x100, es.weight_x100, es.score_source
                FROM examination_subjects es JOIN subjects s ON s.id = es.subject_id
                WHERE es.examination_id = ? AND es.grade_id = ? ORDER BY COALESCE(es.sort_order, s.sort_order), s.id
                """, (rs, n) -> {
            List<SubHeader> subs = "SUB_SUBJECTS".equals(rs.getString(6)) ? subsOf.getOrDefault(rs.getLong(1), List.of()) : List.of();
            // a main subject made of sub-subjects is as big as they are together
            long max = subs.isEmpty() ? rs.getLong(4) : subs.stream().mapToLong(sh -> Grading.toX100(sh.maxScore())).sum();
            return new SubjectHeader(rs.getLong(1), rs.getLong(2), rs.getString(3), Grading.fromX100(max), Grading.fromX100(rs.getLong(5)), rs.getString(6), subs);
        }, examId, c.getGradeId());

        // every score of the class in this examination: enrollment id -> exam subject id -> {score or null, absent}
        Map<Long, Map<Long, Object[]>> scores = new HashMap<>();
        jdbc.query("""
                SELECT sc.enrollment_id, sc.examination_subject_id, sc.score_x100, sc.is_absent
                FROM student_scores sc JOIN examination_subjects es ON es.id = sc.examination_subject_id
                JOIN enrollments e ON e.id = sc.enrollment_id
                WHERE es.examination_id = ? AND e.class_id = ?
                """, rs -> {
            long score = rs.getLong(3);
            Long value = rs.wasNull() ? null : score;   // wasNull() refers to the column read just before it
            scores.computeIfAbsent(rs.getLong(1), k -> new HashMap<>()).put(rs.getLong(2), new Object[]{value, rs.getInt(4) == 1});
        }, examId, classId);

        // the same for the sub-subject rows: enrollment id -> sub-subject row id -> {score or null, absent}
        Map<Long, Map<Long, Object[]>> subScores = new HashMap<>();
        jdbc.query("""
                SELECT sc.enrollment_id, sc.examination_sub_subject_id, sc.score_x100, sc.is_absent
                FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id
                JOIN examination_subjects es ON es.id = ess.examination_subject_id
                JOIN enrollments e ON e.id = sc.enrollment_id
                WHERE es.examination_id = ? AND e.class_id = ?
                """, rs -> {
            long score = rs.getLong(3);
            Long value = rs.wasNull() ? null : score;   // wasNull() refers to the column read just before it
            subScores.computeIfAbsent(rs.getLong(1), k -> new HashMap<>()).put(rs.getLong(2), new Object[]{value, rs.getInt(4) == 1});
        }, examId, classId);

        GradingScaleService.Scale scale = scales.forExamination(examId);
        List<Grading.Band> bands = scale.bands().stream().map(b -> new Grading.Band(b.minPercent(), b.labelKm(), b.letter())).toList();

        record Person(long enrollmentId, long studentId, String code, String name) {}
        List<Person> people = jdbc.query("SELECT e.id, s.id, s.student_code, s.name_km FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = ? AND e.status IN "
                + ScoreService.ROSTER_STATUSES + " ORDER BY s.id", (rs, n) -> new Person(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4)), classId);

        List<Grading.Outcome> outcomes = new ArrayList<>();
        List<List<SubjectScore>> perStudent = new ArrayList<>();
        List<List<SubSubjectScore>> perStudentSubs = new ArrayList<>();
        for (Person p : people) {
            Map<Long, Object[]> mine = scores.getOrDefault(p.enrollmentId(), Map.of());
            Map<Long, Object[]> mySubs = subScores.getOrDefault(p.enrollmentId(), Map.of());
            List<Grading.SubjectInput> inputs = new ArrayList<>();
            List<SubjectScore> shown = new ArrayList<>();
            List<SubSubjectScore> shownSubs = new ArrayList<>();
            for (SubjectHeader h : subjects) {
                Long score;
                boolean absent;
                if (h.subSubjects().isEmpty()) {
                    Object[] s = mine.get(h.examSubjectId());
                    score = s == null ? null : (Long) s[0];
                    absent = s != null && (boolean) s[1];
                } else {
                    long sum = 0;
                    boolean allEntered = true, allAbsent = true;
                    for (SubHeader sh : h.subSubjects()) {
                        Object[] e = mySubs.get(sh.examSubSubjectId());
                        Long v = e == null ? null : (Long) e[0];
                        boolean gone = e != null && (boolean) e[1];
                        shownSubs.add(new SubSubjectScore(sh.examSubSubjectId(), v == null ? null : Grading.fromX100(v), gone));
                        if (v == null && !gone) allEntered = false;   // not entered yet: the main subject is incomplete
                        else if (!gone) { allAbsent = false; sum += v; }
                    }
                    if (!allEntered) allAbsent = false;
                    score = allEntered && !allAbsent ? sum : null;
                    absent = allEntered && allAbsent;
                }
                inputs.add(new Grading.SubjectInput(Grading.toX100(h.maxScore()), Grading.toX100(h.weight()), score, absent));
                shown.add(new SubjectScore(h.examSubjectId(), score == null ? null : Grading.fromX100(score), absent));
            }
            outcomes.add(Grading.outcome(inputs));
            perStudent.add(shown);
            perStudentSubs.add(shownSubs);
        }
        List<Integer> ranks = Grading.ranks(outcomes.stream().map(Grading.Outcome::percent).toList());

        List<StudentResult> students = new ArrayList<>();
        for (int i = 0; i < people.size(); i++) {
            Person p = people.get(i);
            Grading.Outcome o = outcomes.get(i);
            Grading.Band band = o.percent() == null ? null : Grading.bandFor(o.percent(), bands);
            students.add(new StudentResult(p.enrollmentId(), p.studentId(), p.code(), p.name(), perStudent.get(i), o.total(), o.totalMax(), o.percent(),
                    band == null ? null : band.letter(), band == null ? null : band.labelKm(),
                    o.percent() == null ? null : Grading.passed(o.percent(), scale.passPercent()), ranks.get(i), o.complete(), o.absentCount(), perStudentSubs.get(i)));
        }
        return new Results(examId, classId, scale.passPercent(), scale.nameKm(), subjects, students);
    }

    /** One student's result in every examination of every year they were enrolled (newest year first). */
    public List<StudentExamResult> forStudent(long studentId) {
        record Enr(long id, long classId, String className, String gradeName, long gradeId, long yearId, String yearName) {}
        List<Enr> enrollments = jdbc.query("""
                SELECT e.id, c.id, c.name_km, g.name_km, g.id, y.id, y.name_km
                FROM enrollments e JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id JOIN academic_years y ON y.id = e.academic_year_id
                WHERE e.student_id = ? AND e.status IN """ + ScoreService.ROSTER_STATUSES + " ORDER BY y.start_date DESC, e.id DESC",
                (rs, n) -> new Enr(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getLong(5), rs.getLong(6), rs.getString(7)), studentId);
        List<StudentExamResult> out = new ArrayList<>();
        for (Enr e : enrollments) {
            record Ex(long id, String name, String kind, Integer term) {}
            List<Ex> exams = jdbc.query("""
                    SELECT x.id, x.name_km, x.kind, x.term_no FROM examinations x
                    WHERE x.academic_year_id = ? AND EXISTS (SELECT 1 FROM examination_subjects es WHERE es.examination_id = x.id AND es.grade_id = ?)
                    ORDER BY x.id
                    """, (rs, n) -> {
                int term = rs.getInt(4);
                Integer termNo = rs.wasNull() ? null : term;
                return new Ex(rs.getLong(1), rs.getString(2), rs.getString(3), termNo);
            }, e.yearId(), e.gradeId());
            for (Ex x : exams) {
                results(x.id(), e.classId()).students().stream().filter(s -> s.enrollmentId() == e.id()).findFirst()
                        .ifPresent(r -> out.add(new StudentExamResult(x.id(), x.name(), x.kind(), x.term(), e.yearName(), e.classId(), e.className(), e.gradeName(), r)));
            }
        }
        return out;
    }
}
