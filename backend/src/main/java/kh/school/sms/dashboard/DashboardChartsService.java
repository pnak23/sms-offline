package kh.school.sms.dashboard;

import kh.school.sms.attendance.AttendanceService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.Dates;
import kh.school.sms.exam.ResultsService;
import kh.school.sms.fees.Money;
import kh.school.sms.settings.AppSettingsService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The data behind the dashboard's charts. READ ONLY: nothing here writes a row, a file or an audit entry, and nothing is cached or timed. Everything is about the CURRENT
 * academic year except the gender totals and the fees, which follow the people who are still with the school and the money collected in the last six months.
 * <ul>
 *   <li><b>Gender</b>: every active student; {@code unknown} is whatever is left of the total after boys and girls, so an unrecorded value can never fall out of the totals.</li>
 *   <li><b>Attendance</b>: the last (up to) 14 days that have a recorded sheet, counted the way the school's official method says (days or sessions). A weekday in between with no
 *   record at all is a GAP ({@code recorded} false, every figure null), never a zero; a class that did not record a day is not counted as absent, the point says how many classes
 *   did record it. The percentage is the share of recorded students counted Present: late, partial, absent and leave stay separate figures.</li>
 *   <li><b>Class fill</b>: the capacity stored for the class; if none is stored it is null and the chart shows the head count alone. No capacity is ever made up here.</li>
 *   <li><b>Latest examination</b>: the most recent examination of the year that has a score, through {@link ResultsService}, the same source the report cards use. A class's
 *   average is the mean of the percentages of its students whose result is complete; passed and failed are the report cards' own verdicts; nobody is counted in both.</li>
 *   <li><b>Fees</b> (only while fees are switched on): money collected per month, one series per currency. Currencies are never added together or converted.</li>
 * </ul>
 */
@Service
public class DashboardChartsService {
    public record YearRef(long id, String nameKm) {}
    public record Gender(int male, int female, int unknown, int total) {}
    public record GradeBar(long gradeId, int level, String nameKm, int male, int female, int unknown) {}
    public record StudentsByGrade(List<GradeBar> grades, int notInAClass) {}
    /** A day of the attendance chart; for a gap every number is null and {@code recorded} is false. */
    public record AttendancePoint(String date, boolean recorded, int classesRecorded, Integer present, Integer late, Integer partial, Integer absent, Integer leave, Integer total,
                                  BigDecimal presentPercent) {}
    public record AttendanceTrend(String basis, int classes, List<AttendancePoint> days) {}
    public record ClassFill(long classId, String nameKm, String gradeName, int level, int students, Integer capacity) {}
    public record ExamClass(long classId, String nameKm, String gradeName, int students, int complete, int incomplete, BigDecimal averagePercent, int passed, int failed) {}
    public record ExamChart(long examinationId, String nameKm, String kind, BigDecimal passPercent, String scaleName, List<ExamClass> classes) {}
    public record FeeMonth(String month, BigDecimal collected) {}
    public record FeeSeries(String currency, List<FeeMonth> months) {}
    public record Fees(List<String> months, List<FeeSeries> series) {}
    /** {@code year} is null while there is no current year (then every list is empty); {@code latestExam} is null until an examination has a score; {@code fees} is null while fees are off. */
    public record Charts(YearRef year, Gender gender, StudentsByGrade studentsByGrade, AttendanceTrend attendance, List<ClassFill> classFill, ExamChart latestExam, Fees fees) {}

    static final int MAX_DAYS = 14;
    static final int MAX_POINTS = 40;
    static final int FEE_MONTHS = 6;

    private final JdbcTemplate jdbc;
    private final AttendanceService attendance;
    private final ResultsService results;
    private final AppSettingsService settings;
    private final Clock clock;

    public DashboardChartsService(JdbcTemplate jdbc, AttendanceService attendance, ResultsService results, AppSettingsService settings, Clock clock) {
        this.jdbc = jdbc;
        this.attendance = attendance;
        this.results = results;
        this.settings = settings;
        this.clock = clock;
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    public Charts charts() {
        LocalDate today = Dates.today(clock);
        List<YearRef> years = jdbc.query("SELECT id, name_km FROM academic_years WHERE is_current = 1", (rs, n) -> new YearRef(rs.getLong(1), rs.getString(2)));
        YearRef year = years.isEmpty() ? null : years.get(0);

        int total = count("SELECT count(*) FROM students WHERE status = 'ACTIVE'");
        int male = count("SELECT count(*) FROM students WHERE status = 'ACTIVE' AND gender = 'MALE'");
        int female = count("SELECT count(*) FROM students WHERE status = 'ACTIVE' AND gender = 'FEMALE'");
        Gender gender = new Gender(male, female, Math.max(0, total - male - female), total);

        Fees fees = settings.feesEnabled() ? fees(today) : null;
        if (year == null) {
            return new Charts(null, gender, new StudentsByGrade(List.of(), 0), new AttendanceTrend(settings.attendanceBasis(), 0, List.of()), List.of(), null, fees);
        }
        return new Charts(year, gender, studentsByGrade(year.id(), total), attendanceTrend(year.id()), classFill(year.id()), latestExam(year.id()), fees);
    }

    // ---- students by grade ----------------------------------------------------------------------------------------------------------------------------

    private StudentsByGrade studentsByGrade(long yearId, int activeTotal) {
        RowMapper<GradeBar> mapper = (rs, n) -> {
            int boys = rs.getInt(4);
            int girls = rs.getInt(5);
            int all = rs.getInt(6);
            return new GradeBar(rs.getLong(1), rs.getInt(2), rs.getString(3), boys, girls, Math.max(0, all - boys - girls));
        };
        List<GradeBar> grades = jdbc.query("""
                SELECT g.id, g.level, g.name_km, COALESCE(SUM(s.gender = 'MALE'), 0), COALESCE(SUM(s.gender = 'FEMALE'), 0), count(s.id)
                FROM grades g
                LEFT JOIN classes c ON c.grade_id = g.id AND c.academic_year_id = ?
                LEFT JOIN enrollments e ON e.class_id = c.id AND e.status = 'ACTIVE'
                LEFT JOIN students s ON s.id = e.student_id AND s.status = 'ACTIVE'
                GROUP BY g.id ORDER BY g.level
                """, mapper, yearId);
        int placed = count("""
                SELECT count(DISTINCT s.id) FROM students s
                JOIN enrollments e ON e.student_id = s.id AND e.status = 'ACTIVE'
                JOIN classes c ON c.id = e.class_id AND c.academic_year_id = ?
                WHERE s.status = 'ACTIVE'
                """, yearId);
        return new StudentsByGrade(grades, Math.max(0, activeTotal - placed));
    }

    // ---- attendance -----------------------------------------------------------------------------------------------------------------------------------

    private record DayRow(String date, int classesRecorded, int present, int late, int absent, int leave, int records) {}

    private AttendanceTrend attendanceTrend(long yearId) {
        String basis = settings.attendanceBasis();
        int classes = count("SELECT count(*) FROM classes WHERE academic_year_id = ?", yearId);
        List<String> recorded = jdbc.queryForList("""
                SELECT DISTINCT s.date FROM attendance_sessions s JOIN classes c ON c.id = s.class_id
                WHERE c.academic_year_id = ? ORDER BY s.date DESC LIMIT ?
                """, String.class, yearId, MAX_DAYS);
        if (recorded.isEmpty()) return new AttendanceTrend(basis, classes, List.of());
        List<LocalDate> dates = recorded.stream().map(LocalDate::parse).sorted().toList();
        LocalDate first = dates.get(0);
        LocalDate last = dates.get(dates.size() - 1);

        RowMapper<DayRow> mapper = (rs, n) -> new DayRow(rs.getString(1), rs.getInt(2), rs.getInt(3), rs.getInt(4), rs.getInt(5), rs.getInt(6), rs.getInt(7));
        Map<String, DayRow> rows = new HashMap<>();
        for (DayRow r : jdbc.query("""
                SELECT s.date, COUNT(DISTINCT s.class_id), COALESCE(SUM(r.status = 'PRESENT'), 0), COALESCE(SUM(r.status = 'LATE'), 0), COALESCE(SUM(r.status = 'ABSENT'), 0),
                       COALESCE(SUM(r.status = 'LEAVE'), 0), COUNT(r.id)
                FROM attendance_sessions s JOIN classes c ON c.id = s.class_id LEFT JOIN attendance_records r ON r.session_id = s.id
                WHERE c.academic_year_id = ? AND s.date BETWEEN ? AND ? GROUP BY s.date
                """, mapper, yearId, first.toString(), last.toString())) rows.put(r.date(), r);

        // the axis: every recorded day, and every weekday in between that has no record at all (a gap)
        List<AttendancePoint> points = new ArrayList<>();
        for (LocalDate d = first; !d.isAfter(last); d = d.plusDays(1)) {
            DayRow row = rows.get(d.toString());
            boolean weekend = d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY;
            if (row == null) {
                if (!weekend) points.add(new AttendancePoint(d.toString(), false, 0, null, null, null, null, null, null, null));
                continue;
            }
            int present = row.present(), late = row.late(), partial = 0, absent = row.absent(), leave = row.leave();
            if ("DAY".equals(basis)) {
                AttendanceService.DayTotals t = attendance.dayTotalsOn(d, yearId);
                present = t.present(); late = t.late(); partial = t.partial(); absent = t.absent(); leave = t.leave();
            }
            int all = present + late + partial + absent + leave;
            BigDecimal percent = all == 0 ? null : BigDecimal.valueOf(present).multiply(BigDecimal.valueOf(100)).divide(BigDecimal.valueOf(all), 1, RoundingMode.HALF_UP);
            points.add(new AttendancePoint(d.toString(), true, row.classesRecorded(), present, late, partial, absent, leave, all, percent));
        }
        // a very long break between recorded days must not stretch the chart: keep the newest points
        if (points.size() > MAX_POINTS) points = new ArrayList<>(points.subList(points.size() - MAX_POINTS, points.size()));
        return new AttendanceTrend(basis, classes, points);
    }

    // ---- class fill -----------------------------------------------------------------------------------------------------------------------------------

    private List<ClassFill> classFill(long yearId) {
        RowMapper<ClassFill> mapper = (rs, n) -> {
            int capacity = rs.getInt(6);
            boolean none = rs.wasNull() || capacity <= 0;
            return new ClassFill(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getInt(4), rs.getInt(5), none ? null : capacity);
        };
        return jdbc.query("""
                SELECT c.id, c.name_km, g.name_km, g.level,
                       (SELECT count(*) FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = c.id AND e.status = 'ACTIVE' AND s.status = 'ACTIVE'),
                       c.capacity
                FROM classes c JOIN grades g ON g.id = c.grade_id WHERE c.academic_year_id = ? ORDER BY g.level, c.name_km, c.id
                """, mapper, yearId);
    }

    // ---- the latest examination ---------------------------------------------------------------------------------------------------------------------------

    private record Exam(long id, String nameKm, String kind) {}

    private ExamChart latestExam(long yearId) {
        List<Exam> found = jdbc.query("""
                SELECT e.id, e.name_km, e.kind FROM examinations e
                WHERE e.academic_year_id = ?
                  AND (EXISTS (SELECT 1 FROM student_scores ss JOIN examination_subjects es ON es.id = ss.examination_subject_id WHERE es.examination_id = e.id)
                    OR EXISTS (SELECT 1 FROM sub_subject_scores sc JOIN examination_sub_subjects ess ON ess.id = sc.examination_sub_subject_id
                               JOIN examination_subjects es ON es.id = ess.examination_subject_id WHERE es.examination_id = e.id))
                ORDER BY e.id DESC LIMIT 1
                """, (rs, n) -> new Exam(rs.getLong(1), rs.getString(2), rs.getString(3)), yearId);
        if (found.isEmpty()) return null;
        Exam exam = found.get(0);
        RowMapper<long[]> ids = (rs, n) -> new long[]{rs.getLong(1)};
        List<long[]> classIds = jdbc.query("""
                SELECT c.id FROM classes c JOIN grades g ON g.id = c.grade_id
                WHERE c.academic_year_id = ? AND c.grade_id IN (SELECT grade_id FROM examination_subjects WHERE examination_id = ?)
                ORDER BY g.level, c.name_km, c.id
                """, ids, yearId, exam.id());
        List<ExamClass> classes = new ArrayList<>();
        BigDecimal passPercent = null;
        String scaleName = null;
        for (long[] c : classIds) {
            ResultsService.Results r;
            try {
                r = results.results(exam.id(), c[0]);
            } catch (ApiException e) {
                continue;   // a class the examination cannot be shown for is simply not on the chart
            }
            passPercent = r.passPercent();
            scaleName = r.scaleName();
            int complete = 0, incomplete = 0, passed = 0, failed = 0;
            BigDecimal sum = BigDecimal.ZERO;
            for (ResultsService.StudentResult s : r.students()) {
                if (!s.complete() || s.percent() == null) { incomplete++; continue; }
                complete++;
                sum = sum.add(s.percent());
                if (Boolean.TRUE.equals(s.passed())) passed++;
                else if (Boolean.FALSE.equals(s.passed())) failed++;
            }
            BigDecimal average = complete == 0 ? null : sum.divide(BigDecimal.valueOf(complete), 1, RoundingMode.HALF_UP);
            String[] names = jdbc.queryForObject("SELECT c.name_km, g.name_km FROM classes c JOIN grades g ON g.id = c.grade_id WHERE c.id = ?", (rs, n) -> new String[]{rs.getString(1), rs.getString(2)}, c[0]);
            classes.add(new ExamClass(c[0], names[0], names[1], r.students().size(), complete, incomplete, average, passed, failed));
        }
        return new ExamChart(exam.id(), exam.nameKm(), exam.kind(), passPercent, scaleName, classes);
    }

    // ---- fees ---------------------------------------------------------------------------------------------------------------------------------------------

    private Fees fees(LocalDate today) {
        YearMonth current = YearMonth.from(today);
        List<String> months = new ArrayList<>();
        for (int i = FEE_MONTHS - 1; i >= 0; i--) months.add(current.minusMonths(i).toString());
        String from = current.minusMonths(FEE_MONTHS - 1L).atDay(1).toString();
        // currency -> month -> whole units of the currency's smallest denomination; every payment counts in its own charge's currency, a voided one not at all
        Map<String, Map<String, Long>> sums = new LinkedHashMap<>();
        for (String c : settings.feeCurrencies()) sums.put(c, new TreeMap<>());
        jdbc.query("""
                SELECT f.currency, substr(p.paid_on, 1, 7), SUM(p.amount) FROM fee_payments p JOIN student_fees f ON f.id = p.student_fee_id
                WHERE p.voided_at IS NULL AND p.paid_on >= ? GROUP BY f.currency, substr(p.paid_on, 1, 7)
                """, (rs, n) -> {
                    sums.computeIfAbsent(rs.getString(1), k -> new TreeMap<>()).put(rs.getString(2), rs.getLong(3));
                    return 0;
                }, from);
        List<FeeSeries> series = new ArrayList<>();
        for (Map.Entry<String, Map<String, Long>> e : sums.entrySet()) {
            List<FeeMonth> list = new ArrayList<>();
            for (String m : months) list.add(new FeeMonth(m, Money.toMajor(e.getValue().getOrDefault(m, 0L), e.getKey())));
            series.add(new FeeSeries(e.getKey(), list));
        }
        return new Fees(months, series);
    }
}
