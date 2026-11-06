package kh.school.sms.report;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.attendance.AttendanceService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.Dates;
import kh.school.sms.common.KhmerText;
import kh.school.sms.exam.ResultsService;
import kh.school.sms.settings.AppSettingsService;
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
 * Everything one student's report card shows, as data: the school's own details (name, logo, director) are not here, the page
 * takes them from the school profile. The result, rank and band come from {@link ResultsService}; the attendance summary covers
 * the academic year from its first day to today (or its last day, if the year is over).
 */
@Service
public class ReportCardService {
    /** The detail under a main subject made of sub-subjects (empty for any other); the card shows it only when the school switches it on. */
    public record CardSubSubject(String subjectName, BigDecimal maxScore, BigDecimal score, boolean absent) {}
    public record CardSubject(long examSubjectId, String subjectName, BigDecimal maxScore, BigDecimal weight, BigDecimal score, boolean absent, List<CardSubSubject> subSubjects) {}
    /**
     * The card's attendance, counted the school's official way ({@code basis}, a setting): DAY = days (a day counts once; {@code partial} is its own figure and is
     * never added to present or absent), SESSION = sheets (partial is 0). {@code total} is the days recorded, or the sheets recorded.
     */
    public record Attendance(String basis, int present, int late, int partial, int absent, int leave, int total, String from, String to) {}
    public record Card(long examinationId, String examinationName, String kind, Integer termNo, String yearName, long classId, String className, String gradeName,
                       long enrollmentId, long studentId, String studentCode, String nameKm, String nameEn, String gender, String dateOfBirth, String photoFile,
                       List<CardSubject> subjects, BigDecimal total, BigDecimal totalMax, BigDecimal percent, String bandLetter, String bandLabel,
                       Boolean passed, Integer rank, int rankedCount, boolean complete, Attendance attendance, String comment) {}

    private static final int MAX_COMMENT = 1000;

    private final JdbcTemplate jdbc;
    private final ResultsService results;
    private final AttendanceService attendance;
    private final AppSettingsService settings;
    private final AuditService audit;
    private final Clock clock;

    public ReportCardService(JdbcTemplate jdbc, ResultsService results, AttendanceService attendance, AppSettingsService settings, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.results = results;
        this.attendance = attendance;
        this.settings = settings;
        this.audit = audit;
        this.clock = clock;
    }

    /** The cards of a whole class (one per student, for batch printing) or of one student of it. */
    public List<Card> cards(long examId, long classId, Long studentId) {
        ResultsService.Results r = results.results(examId, classId);
        record Head(String examName, String kind, Integer term, String yearName, String yearStart, String yearEnd, String className, String gradeName) {}
        Head h = jdbc.query("""
                SELECT x.name_km, x.kind, x.term_no, y.name_km, y.start_date, y.end_date, c.name_km, g.name_km
                FROM examinations x JOIN academic_years y ON y.id = x.academic_year_id JOIN classes c ON c.id = ? JOIN grades g ON g.id = c.grade_id
                WHERE x.id = ?
                """, rs -> {
            rs.next();
            int term = rs.getInt(3);
            Integer termNo = rs.wasNull() ? null : term;
            return new Head(rs.getString(1), rs.getString(2), termNo, rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8));
        }, classId, examId);

        String basis = settings.attendanceBasis();
        LocalDate today = Dates.today(clock);
        LocalDate end = LocalDate.parse(h.yearEnd());
        String to = (today.isBefore(end) ? today : end).toString();
        Map<Long, AttendanceService.SummaryRow> attendanceByEnrollment = new HashMap<>();
        for (AttendanceService.SummaryRow s : attendance.summary(classId, LocalDate.parse(h.yearStart()), LocalDate.parse(to))) attendanceByEnrollment.put(s.enrollmentId(), s);

        Map<Long, String> comments = new HashMap<>();
        jdbc.query("SELECT enrollment_id, comment FROM report_card_comments WHERE examination_id = ?", rs -> { comments.put(rs.getLong(1), rs.getString(2)); }, examId);

        record Person(String nameEn, String gender, String dob, String photoFile) {}
        Map<Long, Person> people = new HashMap<>();
        jdbc.query("SELECT id, name_en, gender, date_of_birth, photo_file FROM students", rs -> { people.put(rs.getLong(1), new Person(rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5))); });

        int ranked = (int) r.students().stream().filter(s -> s.rank() != null).count();
        Map<Long, ResultsService.SubjectHeader> headers = new HashMap<>();
        r.subjects().forEach(s -> headers.put(s.examSubjectId(), s));

        List<Card> cards = new ArrayList<>();
        for (ResultsService.StudentResult s : r.students()) {
            if (studentId != null && s.studentId() != studentId) continue;
            Map<Long, ResultsService.SubSubjectScore> subScores = new HashMap<>();
            s.subScores().forEach(ss -> subScores.put(ss.examSubSubjectId(), ss));
            List<CardSubject> subjects = s.scores().stream().map(sc -> {
                ResultsService.SubjectHeader hd = headers.get(sc.examSubjectId());
                List<CardSubSubject> detail = hd.subSubjects().stream().map(sh -> {
                    ResultsService.SubSubjectScore ss = subScores.get(sh.examSubSubjectId());
                    return new CardSubSubject(sh.subjectName(), sh.maxScore(), ss == null ? null : ss.score(), ss != null && ss.absent());
                }).toList();
                return new CardSubject(sc.examSubjectId(), hd.subjectName(), hd.maxScore(), hd.weight(), sc.score(), sc.absent(), detail);
            }).toList();
            AttendanceService.SummaryRow a = attendanceByEnrollment.get(s.enrollmentId());
            Attendance att;
            if (a == null) att = new Attendance(basis, 0, 0, 0, 0, 0, 0, h.yearStart(), to);
            else if ("DAY".equals(basis)) att = new Attendance(basis, a.days().present(), a.days().late(), a.days().partial(), a.days().absent(), a.days().leave(), a.days().total(), h.yearStart(), to);
            else att = new Attendance(basis, a.present(), a.late(), 0, a.absent(), a.leave(), a.total(), h.yearStart(), to);
            Person p = people.get(s.studentId());
            cards.add(new Card(examId, h.examName(), h.kind(), h.term(), h.yearName(), classId, h.className(), h.gradeName(), s.enrollmentId(), s.studentId(), s.studentCode(),
                    s.nameKm(), p.nameEn(), p.gender(), p.dob(), p.photoFile(), subjects, s.total(), s.totalMax(), s.percent(), s.bandLetter(), s.bandLabel(), s.passed(), s.rank(), ranked,
                    s.complete(), att, comments.get(s.enrollmentId())));
        }
        if (studentId != null && cards.isEmpty()) throw ApiException.notFound();
        return cards;
    }

    /** An empty comment removes it. The audit trail records that a comment was saved, never its text. */
    @Transactional
    public void setComment(long examId, long enrollmentId, String comment) {
        List<Long> exam = jdbc.queryForList("SELECT academic_year_id FROM examinations WHERE id = ?", Long.class, examId);
        if (exam.isEmpty()) throw ApiException.notFound();
        List<Long> enr = jdbc.queryForList("SELECT academic_year_id FROM enrollments WHERE id = ? AND status IN ('ACTIVE', 'PROMOTED', 'REPEATED', 'GRADUATED')", Long.class, enrollmentId);
        if (enr.isEmpty() || !enr.get(0).equals(exam.get(0))) throw ApiException.validation("enrollmentId", "INVALID");
        String status = jdbc.queryForObject("SELECT status FROM academic_years WHERE id = ?", String.class, exam.get(0));
        if (AcademicYearService.CLOSED.equals(status)) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
        String text = KhmerText.free(comment);
        if (text != null && text.length() > MAX_COMMENT) throw ApiException.validation("comment", "Size");
        if (text == null) {
            jdbc.update("DELETE FROM report_card_comments WHERE examination_id = ? AND enrollment_id = ?", examId, enrollmentId);
        } else {
            jdbc.update("""
                    INSERT INTO report_card_comments (examination_id, enrollment_id, comment, updated_at) VALUES (?, ?, ?, ?)
                    ON CONFLICT (examination_id, enrollment_id) DO UPDATE SET comment = excluded.comment, updated_at = excluded.updated_at
                    """, examId, enrollmentId, text, clock.instant().toString());
        }
        audit.record("REPORT_COMMENT_SAVED", "examination", examId, text == null ? "report card comment removed" : "report card comment saved");
    }
}
