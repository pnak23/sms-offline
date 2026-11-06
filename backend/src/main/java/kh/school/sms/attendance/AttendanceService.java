package kh.school.sms.attendance;

import kh.school.sms.academic.AcademicYear;
import kh.school.sms.academic.AcademicYearRepository;
import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.academic.SchoolClass;
import kh.school.sms.academic.SchoolClassRepository;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.Dates;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * Daily attendance. One sheet per class, day and session of the school day (the sessions are the administrator's, see
 * {@link AttendancePeriodService}), one record per student in it. A correction updates the record and writes what it replaced to
 * the audit trail, so the original is never lost. A sheet keeps a snapshot of its session's name and times as they were when it was
 * first saved. A student has at most one record per day and session, whatever class they were in. Nothing is refused because of the
 * time of day. Only codes go into the trail (a status), never names or remarks.
 */
@Service
public class AttendanceService {
    public static final List<String> STATUSES = List.of("PRESENT", "ABSENT", "LATE", "LEAVE");
    static final int MAX_ENTRIES = 500;

    /** The session a sheet belongs to: the snapshot taken when the sheet was first saved (live values while it has not been), and whether it can still start new sheets. */
    public record PeriodRef(long id, String nameKm, String startTime, String endTime, boolean enabled) {}
    /** One student of the sheet; status is null while nothing has been recorded for them on that day. */
    public record Row(long enrollmentId, long studentId, String studentCode, String nameKm, String status, String remark) {}
    /** {@code recordedPeriodIds}: the sessions this class already has a sheet for on this day (the screen ticks them). */
    public record Sheet(long classId, String date, PeriodRef period, Long sessionId, String note, List<Row> rows, List<Long> recordedPeriodIds) {}
    public record Entry(long enrollmentId, String status, String remark) {}
    public record SessionRow(long sessionId, String date, long periodId, String periodNameKm, int present, int absent, int late, int leave, int total) {}
    /**
     * How many DAYS fell in each day status (see {@link DayStatus}); {@code total} is the days recorded, each date counted once however many
     * sessions it had. Partial days are their own figure and are never added to present or absent.
     */
    public record DayTotals(int present, int late, int partial, int absent, int leave, int total) {}
    /** The session figures (one count per sheet) and, beside them, the day figures. */
    public record SummaryRow(long enrollmentId, long studentId, String studentCode, String nameKm, int present, int absent, int late, int leave, int total, DayTotals days) {}
    /** One date of a class: how many students were in each day status, and how many sheets were taken. */
    public record DayRow(String date, int sheets, int students, int present, int late, int partial, int absent, int leave) {}
    public record HistoryRow(String date, String periodNameKm, String className, String status, String remark) {}
    public record StudentHistory(List<HistoryRow> rows, int present, int absent, int late, int leave, int total, DayTotals days) {}

    private record Snapshot(String name, String start, String end, String note) {}

    private final JdbcTemplate jdbc;
    private final SchoolClassRepository classes;
    private final AcademicYearRepository years;
    private final AttendancePeriodService periods;
    private final AuditService audit;
    private final Clock clock;

    public AttendanceService(JdbcTemplate jdbc, SchoolClassRepository classes, AcademicYearRepository years, AttendancePeriodService periods, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.classes = classes;
        this.years = years;
        this.periods = periods;
        this.audit = audit;
        this.clock = clock;
    }

    /** The class list of one day and session: students enrolled in the class on that date (plus anyone who already has a record). Creates nothing. */
    public Sheet sheet(long classId, LocalDate date, Long periodId) {
        SchoolClass c = classes.findById(classId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        AttendancePeriodService.Period live = resolve(c, periodId);
        Long sessionId = existingSession(classId, date, live.id());
        PeriodRef ref = new PeriodRef(live.id(), live.nameKm(), live.startTime(), live.endTime(), live.enabled());
        String note = null;
        if (sessionId != null) {
            RowMapper<Snapshot> mapper = (rs, n) -> new Snapshot(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4));
            Snapshot s = jdbc.queryForObject("SELECT period_name_km, period_start, period_end, note FROM attendance_sessions WHERE id = ?", mapper, sessionId);
            ref = new PeriodRef(live.id(), s.name(), s.start(), s.end(), live.enabled());
            note = s.note();
        }
        List<Long> recorded = jdbc.queryForList("SELECT period_id FROM attendance_sessions WHERE class_id = ? AND date = ? ORDER BY period_id", Long.class, classId, date.toString());
        return new Sheet(c.getId(), date.toString(), ref, sessionId, note, rows(c.getId(), date, sessionId), recorded);
    }

    private List<Row> rows(long classId, LocalDate date, Long sessionId) {
        return jdbc.query("""
                SELECT e.id, s.id, s.student_code, s.name_km, r.status, r.remark
                FROM enrollments e
                JOIN students s ON s.id = e.student_id
                LEFT JOIN attendance_records r ON r.enrollment_id = e.id AND r.session_id = ?
                WHERE e.class_id = ? AND ((e.enrolled_on <= ? AND (e.left_on IS NULL OR e.left_on > ?)) OR r.id IS NOT NULL)
                ORDER BY s.id
                """, (rs, n) -> new Row(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6)),
                sessionId == null ? -1L : sessionId, classId, date.toString(), date.toString());
    }

    /** Creates the day's sheet if needed and stores the records, all in one transaction. Existing records are corrected in place (and audited). */
    @Transactional
    public Sheet save(long classId, LocalDate date, Long periodId, String note, List<Entry> entries) {
        SchoolClass c = classes.findById(classId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        AcademicYear year = years.findById(c.getAcademicYearId()).orElseThrow();
        if (AcademicYearService.CLOSED.equals(year.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
        if (date.isAfter(Dates.today(clock))) throw ApiException.validation("date", "FUTURE_DATE");
        if (entries.size() > MAX_ENTRIES) throw ApiException.validation("records", "INVALID");
        AttendancePeriodService.Period period = resolve(c, periodId);

        Long sessionId = existingSession(classId, date, period.id());
        // a switched-off session cannot start NEW sheets; the sheets already taken with it stay correctable
        if (sessionId == null && !period.enabled()) throw new ApiException(HttpStatus.CONFLICT, "ATTENDANCE_PERIOD_DISABLED");
        Map<Long, Long> studentOf = new HashMap<>();
        for (Row r : rows(classId, date, sessionId)) studentOf.put(r.enrollmentId(), r.studentId());
        Set<Long> seen = new HashSet<>();
        for (Entry e : entries) {
            if (!STATUSES.contains(e.status()) || !studentOf.containsKey(e.enrollmentId()) || !seen.add(e.enrollmentId())) throw ApiException.validation("records", "INVALID");
        }
        // one record per student, day and session even across classes (a student who changed class today is not counted twice)
        Set<Long> takenElsewhere = new HashSet<>(jdbc.queryForList("SELECT student_id FROM attendance_records WHERE date = ? AND period_id = ? AND session_id <> ?",
                Long.class, date.toString(), period.id(), sessionId == null ? -1L : sessionId));
        for (Entry e : entries) {
            if (takenElsewhere.contains(studentOf.get(e.enrollmentId()))) throw new ApiException(HttpStatus.CONFLICT, "ATTENDANCE_ALREADY_RECORDED");
        }

        String now = clock.instant().toString();
        String cleanNote = KhmerText.free(note);
        if (sessionId == null) {
            jdbc.update("INSERT INTO attendance_sessions (class_id, date, period_id, period_name_km, period_start, period_end, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    classId, date.toString(), period.id(), period.nameKm(), period.startTime(), period.endTime(), cleanNote, now, now);
            sessionId = existingSession(classId, date, period.id());
        } else {
            jdbc.update("UPDATE attendance_sessions SET note = ?, updated_at = ? WHERE id = ?", cleanNote, now, sessionId);
        }

        Map<Long, String[]> existing = new HashMap<>();   // enrollment id -> {record id, status, remark}
        long sid = sessionId;
        jdbc.query("SELECT id, enrollment_id, status, remark FROM attendance_records WHERE session_id = ?",
                rs -> { existing.put(rs.getLong(2), new String[]{String.valueOf(rs.getLong(1)), rs.getString(3), rs.getString(4)}); }, sid);
        int added = 0, corrected = 0;
        for (Entry e : entries) {
            String remark = KhmerText.free(e.remark());
            String[] old = existing.get(e.enrollmentId());
            if (old == null) {
                jdbc.update("INSERT INTO attendance_records (session_id, enrollment_id, student_id, date, period_id, status, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        sid, e.enrollmentId(), studentOf.get(e.enrollmentId()), date.toString(), period.id(), e.status(), remark, now, now);
                added++;
            } else if (!old[1].equals(e.status()) || !java.util.Objects.equals(old[2], remark)) {
                jdbc.update("UPDATE attendance_records SET status = ?, remark = ?, updated_at = ? WHERE id = ?", e.status(), remark, now, Long.parseLong(old[0]));
                audit.record("ATTENDANCE_CORRECTED", "attendance_record", Long.parseLong(old[0]), "attendance record corrected",
                        "{\"status\":\"" + old[1] + "\"}", "{\"status\":\"" + e.status() + "\"}");
                corrected++;
            }
        }
        audit.record("ATTENDANCE_SAVED", "attendance_session", sid, "attendance saved: " + added + " recorded, " + corrected + " corrected");
        return sheet(classId, date, period.id());
    }

    public List<SessionRow> sessions(long classId, LocalDate from, LocalDate to) {
        return jdbc.query("""
                SELECT s.id, s.date, s.period_id, s.period_name_km,
                       COALESCE(SUM(r.status = 'PRESENT'), 0), COALESCE(SUM(r.status = 'ABSENT'), 0),
                       COALESCE(SUM(r.status = 'LATE'), 0), COALESCE(SUM(r.status = 'LEAVE'), 0), COUNT(r.id)
                FROM attendance_sessions s
                JOIN attendance_periods p ON p.id = s.period_id
                LEFT JOIN attendance_records r ON r.session_id = s.id
                WHERE s.class_id = ? AND s.date BETWEEN ? AND ?
                GROUP BY s.id ORDER BY s.date DESC, p.sort_order, s.id
                """, (rs, n) -> new SessionRow(rs.getLong(1), rs.getString(2), rs.getLong(3), rs.getString(4), rs.getInt(5), rs.getInt(6), rs.getInt(7), rs.getInt(8), rs.getInt(9)),
                classId, from.toString(), to.toString());
    }

    /**
     * Per student of the class between the two dates, counted BOTH ways: by sessions (every sheet counts) and by days (each date counts
     * once, {@code days}). Which one is the school's official count is a setting; the screens show both.
     */
    public List<SummaryRow> summary(long classId, LocalDate from, LocalDate to) {
        Map<Long, Map<String, List<String>>> perStudentDay = statusesByEnrollmentAndDate(classId, from, to);
        return jdbc.query("""
                SELECT e.id, st.id, st.student_code, st.name_km,
                       COALESCE(SUM(r.status = 'PRESENT'), 0), COALESCE(SUM(r.status = 'ABSENT'), 0),
                       COALESCE(SUM(r.status = 'LATE'), 0), COALESCE(SUM(r.status = 'LEAVE'), 0), COUNT(r.id)
                FROM enrollments e JOIN students st ON st.id = e.student_id
                LEFT JOIN attendance_records r ON r.enrollment_id = e.id
                     AND r.session_id IN (SELECT id FROM attendance_sessions WHERE class_id = e.class_id AND date BETWEEN ? AND ?)
                WHERE e.class_id = ? AND e.status IN ('ACTIVE', 'PROMOTED', 'REPEATED', 'GRADUATED')
                GROUP BY e.id ORDER BY st.id
                """, (rs, n) -> new SummaryRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getInt(6), rs.getInt(7), rs.getInt(8), rs.getInt(9),
                        tally(perStudentDay.getOrDefault(rs.getLong(1), Map.of()).values())),
                from.toString(), to.toString(), classId);
    }

    /** One row per date of the class, newest first: the students in each day status and the sheets taken that day. */
    public List<DayRow> days(long classId, LocalDate from, LocalDate to) {
        Map<String, Map<Long, List<String>>> byDate = new TreeMap<>(Comparator.reverseOrder());
        jdbc.query("""
                SELECT s.date, r.enrollment_id, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
                WHERE s.class_id = ? AND s.date BETWEEN ? AND ?
                """, rs -> { byDate.computeIfAbsent(rs.getString(1), k -> new HashMap<>()).computeIfAbsent(rs.getLong(2), k -> new ArrayList<>()).add(rs.getString(3)); },
                classId, from.toString(), to.toString());
        Map<String, Integer> sheets = new HashMap<>();
        jdbc.query("SELECT date, count(*) FROM attendance_sessions WHERE class_id = ? AND date BETWEEN ? AND ? GROUP BY date",
                rs -> { sheets.put(rs.getString(1), rs.getInt(2)); }, classId, from.toString(), to.toString());
        for (String date : sheets.keySet()) byDate.computeIfAbsent(date, k -> new HashMap<>());   // a sheet with no record yet is still a day with a sheet
        List<DayRow> rows = new ArrayList<>();
        for (Map.Entry<String, Map<Long, List<String>>> day : byDate.entrySet()) {
            DayTotals t = tally(day.getValue().values());
            rows.add(new DayRow(day.getKey(), sheets.getOrDefault(day.getKey(), 0), day.getValue().size(), t.present(), t.late(), t.partial(), t.absent(), t.leave()));
        }
        return rows;
    }

    /** The students of the whole academic year in each day status on one date (across classes: a student who changed class that day is one student). */
    public DayTotals dayTotalsOn(LocalDate date, long academicYearId) {
        Map<Long, List<String>> byStudent = new HashMap<>();
        jdbc.query("""
                SELECT r.student_id, r.status FROM attendance_records r
                JOIN attendance_sessions s ON s.id = r.session_id JOIN classes c ON c.id = s.class_id
                WHERE s.date = ? AND c.academic_year_id = ?
                """, rs -> { byStudent.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>()).add(rs.getString(2)); }, date.toString(), academicYearId);
        return tally(byStudent.values());
    }

    /** enrollment id -> date -> the statuses of that enrollment's records on that date, for the sheets of one class. */
    private Map<Long, Map<String, List<String>>> statusesByEnrollmentAndDate(long classId, LocalDate from, LocalDate to) {
        Map<Long, Map<String, List<String>>> out = new HashMap<>();
        jdbc.query("""
                SELECT r.enrollment_id, s.date, r.status FROM attendance_records r JOIN attendance_sessions s ON s.id = r.session_id
                WHERE s.class_id = ? AND s.date BETWEEN ? AND ?
                """, rs -> { out.computeIfAbsent(rs.getLong(1), k -> new HashMap<>()).computeIfAbsent(rs.getString(2), k -> new ArrayList<>()).add(rs.getString(3)); },
                classId, from.toString(), to.toString());
        return out;
    }

    /** Each element is the list of statuses of ONE student on ONE date: its day status is worked out and counted, once. */
    private static DayTotals tally(Collection<List<String>> studentDays) {
        int present = 0, late = 0, partial = 0, absent = 0, leave = 0;
        for (List<String> statuses : studentDays) {
            switch (DayStatus.of(statuses)) {
                case PRESENT -> present++;
                case LATE -> late++;
                case PARTIAL -> partial++;
                case ABSENT -> absent++;
                case LEAVE -> leave++;
            }
        }
        return new DayTotals(present, late, partial, absent, leave, studentDays.size());
    }

    /** One student's attendance across all their classes, newest first, with the totals. */
    public StudentHistory studentHistory(long studentId, LocalDate from, LocalDate to) {
        List<HistoryRow> rows = jdbc.query("""
                SELECT s.date, s.period_name_km, c.name_km, r.status, r.remark
                FROM attendance_records r
                JOIN attendance_sessions s ON s.id = r.session_id
                JOIN attendance_periods p ON p.id = s.period_id
                JOIN enrollments e ON e.id = r.enrollment_id
                JOIN classes c ON c.id = s.class_id
                WHERE e.student_id = ? AND s.date BETWEEN ? AND ?
                ORDER BY s.date DESC, p.sort_order, s.id
                """, (rs, n) -> new HistoryRow(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5)),
                studentId, from.toString(), to.toString());
        int[] n = new int[4];
        for (HistoryRow r : rows) n[STATUSES.indexOf(r.status())]++;
        Map<String, List<String>> byDate = new HashMap<>();   // across classes: a student who changed class mid-day is one student that day
        for (HistoryRow r : rows) byDate.computeIfAbsent(r.date(), k -> new ArrayList<>()).add(r.status());
        return new StudentHistory(rows, n[0], n[1], n[2], n[3], rows.size(), tally(byDate.values()));
    }

    private Long existingSession(long classId, LocalDate date, long periodId) {
        List<Long> ids = jdbc.queryForList("SELECT id FROM attendance_sessions WHERE class_id = ? AND date = ? AND period_id = ?", Long.class, classId, date.toString(), periodId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** The session asked for (it must belong to the class's academic year), or the year's first enabled one when none was asked for. */
    private AttendancePeriodService.Period resolve(SchoolClass c, Long periodId) {
        if (periodId == null) {
            AttendancePeriodService.Period first = periods.firstEnabled(c.getAcademicYearId());
            if (first == null) throw ApiException.validation("periodId", "REQUIRED");
            return first;
        }
        AttendancePeriodService.Period p = periods.find(periodId);
        if (p == null || p.academicYearId() != c.getAcademicYearId()) throw ApiException.validation("periodId", "INVALID");
        return p;
    }
}
