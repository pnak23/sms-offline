package kh.school.sms.dashboard;

import kh.school.sms.attendance.AttendanceService;
import kh.school.sms.common.Dates;
import kh.school.sms.fees.FeeService;
import kh.school.sms.settings.AppSettingsService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/**
 * The figures on the dashboard, counted when the page opens (no timers, no cache). Everything is about the CURRENT academic year
 * except the student and teacher headcounts, which are about people who are still with the school.
 */
@Service
public class DashboardService {
    public record Year(long id, String nameKm, String startDate, String endDate) {}
    public record Students(int active, int male, int female) {}
    /**
     * Today's attendance, counted the school's official way ({@code basis}): DAY = students in each day status (a student with two sessions is
     * one student, partial is its own figure); SESSION = every sheet's records counted (partial is 0). {@code sheets} is how many class sheets
     * were taken today either way.
     */
    public record Attendance(String date, String basis, int classes, int classesRecorded, int sheets, int present, int late, int partial, int absent, int leave) {}
    public record RecentExam(long id, String nameKm, String kind, int scoreCount) {}
    public record Fees(List<FeeService.Total> outstanding) {}
    /** {@code fees} is null while fees are switched off. */
    public record Dashboard(Year currentYear, Students students, int activeTeachers, int classes, Attendance attendanceToday, List<RecentExam> recentExams,
                            List<SchoolEventService.Event> events, Fees fees) {}

    private final JdbcTemplate jdbc;
    private final SchoolEventService events;
    private final FeeService fees;
    private final AttendanceService attendance;
    private final AppSettingsService settings;
    private final Clock clock;

    public DashboardService(JdbcTemplate jdbc, SchoolEventService events, FeeService fees, AttendanceService attendance, AppSettingsService settings, Clock clock) {
        this.jdbc = jdbc;
        this.events = events;
        this.fees = fees;
        this.attendance = attendance;
        this.settings = settings;
        this.clock = clock;
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    public Dashboard dashboard() {
        LocalDate today = Dates.today(clock);
        List<Year> years = jdbc.query("SELECT id, name_km, start_date, end_date FROM academic_years WHERE is_current = 1",
                (rs, n) -> new Year(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4)));
        Year year = years.isEmpty() ? null : years.get(0);

        Students students = new Students(count("SELECT count(*) FROM students WHERE status = 'ACTIVE'"),
                count("SELECT count(*) FROM students WHERE status = 'ACTIVE' AND gender = 'MALE'"),
                count("SELECT count(*) FROM students WHERE status = 'ACTIVE' AND gender = 'FEMALE'"));
        int teachers = count("SELECT count(*) FROM teachers WHERE status = 'ACTIVE'");

        int classes = 0;
        String basis = settings.attendanceBasis();
        Attendance attendanceToday = new Attendance(today.toString(), basis, 0, 0, 0, 0, 0, 0, 0, 0);
        List<RecentExam> exams = List.of();
        if (year != null) {
            classes = count("SELECT count(*) FROM classes WHERE academic_year_id = ?", year.id());
            // classes recorded, sheets, then the session figures: present, absent, late, leave (one aggregate row; a RowMapper, because a bare lambda is ambiguous to the IDE's compiler)
            int[] sums = jdbc.queryForObject("""
                    SELECT COUNT(DISTINCT s.class_id), COUNT(DISTINCT s.id),
                           COALESCE(SUM(r.status = 'PRESENT'), 0), COALESCE(SUM(r.status = 'ABSENT'), 0), COALESCE(SUM(r.status = 'LATE'), 0), COALESCE(SUM(r.status = 'LEAVE'), 0)
                    FROM attendance_sessions s JOIN classes c ON c.id = s.class_id LEFT JOIN attendance_records r ON r.session_id = s.id
                    WHERE s.date = ? AND c.academic_year_id = ?
                    """, (rs, n) -> new int[]{rs.getInt(1), rs.getInt(2), rs.getInt(3), rs.getInt(4), rs.getInt(5), rs.getInt(6)}, today.toString(), year.id());
            if ("DAY".equals(basis)) {
                AttendanceService.DayTotals d = attendance.dayTotalsOn(today, year.id());
                attendanceToday = new Attendance(today.toString(), basis, classes, sums[0], sums[1], d.present(), d.late(), d.partial(), d.absent(), d.leave());
            } else {
                attendanceToday = new Attendance(today.toString(), basis, classes, sums[0], sums[1], sums[2], sums[4], 0, sums[3], sums[5]);
            }
            exams = jdbc.query("""
                    SELECT e.id, e.name_km, e.kind,
                           ((SELECT count(*) FROM student_scores ss JOIN examination_subjects es ON es.id = ss.examination_subject_id WHERE es.examination_id = e.id)
                            + (SELECT count(*) FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id JOIN examination_subjects es ON es.id = ess.examination_subject_id WHERE es.examination_id = e.id))
                    FROM examinations e WHERE e.academic_year_id = ? ORDER BY e.id DESC LIMIT 3
                    """, (rs, n) -> new RecentExam(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getInt(4)), year.id());
        }
        return new Dashboard(year, students, teachers, classes, attendanceToday, exams, events.list(today, null, 5),
                settings.feesEnabled() ? new Fees(fees.outstanding()) : null);
    }
}
