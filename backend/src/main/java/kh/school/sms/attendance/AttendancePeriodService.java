package kh.school.sms.attendance;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The sessions of the school day ("វគ្គវត្តមាន"), kept per academic year by the administrator because the school's timetable changes.
 * The times are information only: nothing here, and nothing in taking attendance, is ever refused because of the clock. A session
 * that has been used by a sheet can be renamed, re-timed or switched off but not deleted, and the sheets keep a snapshot of the
 * name and times they were saved with, so editing the schedule never rewrites history. An example time is never "official":
 * a schedule counts as confirmed only after the administrator says so, and any later edit of it takes the confirmation back.
 */
@Service
public class AttendancePeriodService {
    /** What every academic year starts with: one session for the whole day, no times. Teachers can add more, or switch it off. */
    public static final String DEFAULT_NAME = "ពេញមួយថ្ងៃ";
    private static final Pattern TIME = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    public record Period(long id, long academicYearId, String nameKm, String startTime, String endTime, int sortOrder, boolean enabled,
                         String confirmedAt, String confirmedBy, int sheets, long version) {}

    private static final String SELECT = """
            SELECT p.id, p.academic_year_id, p.name_km, p.start_time, p.end_time, p.sort_order, p.enabled, p.confirmed_at, p.confirmed_by,
                   (SELECT count(*) FROM attendance_sessions s WHERE s.period_id = p.id), p.version
            FROM attendance_periods p
            """;
    private static final RowMapper<Period> MAPPER = (rs, n) -> new Period(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5),
            rs.getInt(6), rs.getInt(7) == 1, rs.getString(8), rs.getString(9), rs.getInt(10), rs.getLong(11));

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public AttendancePeriodService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    public List<Period> list(long yearId) {
        yearStatus(yearId);
        return jdbc.query(SELECT + " WHERE p.academic_year_id = ? ORDER BY p.sort_order, p.id", MAPPER, yearId);
    }

    public Period get(long id) {
        Period p = find(id);
        if (p == null) throw ApiException.notFound();
        return p;
    }

    /** The session with this id, or null. */
    public Period find(long id) {
        List<Period> found = jdbc.query(SELECT + " WHERE p.id = ?", MAPPER, id);
        return found.isEmpty() ? null : found.get(0);
    }

    /** The session a sheet opens on when nobody chose one: the first enabled session of the year, or null if the year has none enabled. */
    public Period firstEnabled(long yearId) {
        List<Period> found = jdbc.query(SELECT + " WHERE p.academic_year_id = ? AND p.enabled = 1 ORDER BY p.sort_order, p.id LIMIT 1", MAPPER, yearId);
        return found.isEmpty() ? null : found.get(0);
    }

    /** Called when an academic year is created (inside its transaction): the year starts with the whole-day session. */
    public void createDefault(long yearId) {
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO attendance_periods (academic_year_id, name_km, sort_order, enabled, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?)", yearId, DEFAULT_NAME, now, now);
    }

    @Transactional
    public Period create(long yearId, String nameKm, String startTime, String endTime) {
        openYear(yearId);
        String name = uniqueName(nameKm, yearId, -1);
        String[] t = times(startTime, endTime);
        String now = clock.instant().toString();
        Integer next = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM attendance_periods WHERE academic_year_id = ?", Integer.class, yearId);
        jdbc.update("INSERT INTO attendance_periods (academic_year_id, name_km, start_time, end_time, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
                yearId, name, t[0], t[1], next == null ? 0 : next, now, now);
        Long id = jdbc.queryForObject("SELECT id FROM attendance_periods WHERE academic_year_id = ? AND name_km = ?", Long.class, yearId, name);
        audit.record("ATTENDANCE_PERIOD_CREATED", "attendance_period", id, "attendance session created");
        return get(id);
    }

    @Transactional
    public Period update(long id, String nameKm, String startTime, String endTime, long version) {
        Period p = get(id);
        openYear(p.academicYearId());
        if (p.version() != version) throw ApiException.staleVersion();
        String name = uniqueName(nameKm, p.academicYearId(), id);
        String[] t = times(startTime, endTime);
        if (name.equals(p.nameKm()) && Objects.equals(t[0], p.startTime()) && Objects.equals(t[1], p.endTime())) return p;
        // a changed schedule is a new claim: the school has not confirmed THIS name and these times
        jdbc.update("UPDATE attendance_periods SET name_km = ?, start_time = ?, end_time = ?, confirmed_at = NULL, confirmed_by = NULL, version = version + 1, updated_at = ? WHERE id = ?",
                name, t[0], t[1], clock.instant().toString(), id);
        audit.record("ATTENDANCE_PERIOD_UPDATED", "attendance_period", id, "attendance session edited");
        return get(id);
    }

    /** Switching off hides a session from the sheet's choices; the sheets already taken stay readable and correctable. */
    @Transactional
    public Period setEnabled(long id, boolean enabled, long version) {
        Period p = get(id);
        openYear(p.academicYearId());
        if (p.version() != version) throw ApiException.staleVersion();
        if (p.enabled() == enabled) return p;
        if (!enabled && enabledCount(p.academicYearId()) <= 1) throw new ApiException(HttpStatus.CONFLICT, "LAST_ENABLED_PERIOD");
        jdbc.update("UPDATE attendance_periods SET enabled = ?, version = version + 1, updated_at = ? WHERE id = ?", enabled ? 1 : 0, clock.instant().toString(), id);
        audit.record(enabled ? "ATTENDANCE_PERIOD_ENABLED" : "ATTENDANCE_PERIOD_DISABLED", "attendance_period", id, enabled ? "attendance session switched on" : "attendance session switched off");
        return get(id);
    }

    /** {@code ids} is the whole year's sessions in the new order. */
    @Transactional
    public List<Period> reorder(long yearId, List<Long> ids) {
        openYear(yearId);
        List<Long> current = jdbc.queryForList("SELECT id FROM attendance_periods WHERE academic_year_id = ?", Long.class, yearId);
        if (ids.size() != current.size() || !new HashSet<>(ids).equals(new HashSet<>(current))) throw ApiException.validation("ids", "INVALID");
        String now = clock.instant().toString();
        for (int i = 0; i < ids.size(); i++) jdbc.update("UPDATE attendance_periods SET sort_order = ?, updated_at = ? WHERE id = ?", i, now, ids.get(i));
        audit.record("ATTENDANCE_PERIOD_REORDERED", "attendance_period", null, "attendance sessions reordered");
        return list(yearId);
    }

    /** Only a session no sheet has used. One that has been used is switched off instead, so the history keeps pointing at it. */
    @Transactional
    public void delete(long id) {
        Period p = get(id);
        openYear(p.academicYearId());
        if (p.sheets() > 0) throw new ApiException(HttpStatus.CONFLICT, "ATTENDANCE_PERIOD_IN_USE");
        if (p.enabled() && enabledCount(p.academicYearId()) <= 1) throw new ApiException(HttpStatus.CONFLICT, "LAST_ENABLED_PERIOD");
        jdbc.update("DELETE FROM attendance_periods WHERE id = ?", id);
        audit.record("ATTENDANCE_PERIOD_DELETED", "attendance_period", id, "attendance session deleted");
    }

    /** The administrator states that this name and these times are what the school really uses (not an example). */
    @Transactional
    public Period confirm(long id, AuthUser user) {
        Period p = get(id);
        openYear(p.academicYearId());
        String who = jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, user.id());
        jdbc.update("UPDATE attendance_periods SET confirmed_at = ?, confirmed_by = ?, version = version + 1, updated_at = ? WHERE id = ?",
                clock.instant().toString(), who, clock.instant().toString(), id);
        audit.record("ATTENDANCE_PERIOD_CONFIRMED", "attendance_period", id, "attendance session confirmed by the school");
        return get(id);
    }

    /** A new year rarely starts from nothing: take over the other year's sessions (those whose name is not already there). They start unconfirmed. */
    @Transactional
    public List<Period> copyFromYear(long fromYearId, long toYearId) {
        if (fromYearId == toYearId) throw ApiException.validation("fromYearId", "INVALID");
        yearStatus(fromYearId);
        openYear(toYearId);
        Set<String> have = new HashSet<>(jdbc.queryForList("SELECT name_km FROM attendance_periods WHERE academic_year_id = ?", String.class, toYearId));
        Integer start = jdbc.queryForObject("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM attendance_periods WHERE academic_year_id = ?", Integer.class, toYearId);
        int order = start == null ? 0 : start;
        String now = clock.instant().toString();
        List<Period> copied = new ArrayList<>();
        for (Period p : list(fromYearId)) {
            if (have.contains(p.nameKm())) continue;
            jdbc.update("INSERT INTO attendance_periods (academic_year_id, name_km, start_time, end_time, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    toYearId, p.nameKm(), p.startTime(), p.endTime(), order++, p.enabled() ? 1 : 0, now, now);
            copied.add(p);
        }
        audit.record("ATTENDANCE_PERIOD_COPIED", "attendance_period", null, "attendance sessions copied from another year: " + copied.size());
        return list(toYearId);
    }

    // ---- rules ----------------------------------------------------------------------------------------------------

    private String yearStatus(long yearId) {
        List<String> s = jdbc.queryForList("SELECT status FROM academic_years WHERE id = ?", String.class, yearId);
        if (s.isEmpty()) throw ApiException.validation("academicYearId", "INVALID");
        return s.get(0);
    }

    private void openYear(long yearId) {
        if (AcademicYearService.CLOSED.equals(yearStatus(yearId))) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private int enabledCount(long yearId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM attendance_periods WHERE academic_year_id = ? AND enabled = 1", Integer.class, yearId);
        return n == null ? 0 : n;
    }

    private String uniqueName(String raw, long yearId, long ownId) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        Integer taken = jdbc.queryForObject("SELECT count(*) FROM attendance_periods WHERE academic_year_id = ? AND name_km = ? AND id <> ?", Integer.class, yearId, name, ownId);
        if (taken != null && taken > 0) throw ApiException.duplicate("nameKm");
        return name;
    }

    /** Both times or neither; "HH:mm"; the end after the start. Overlapping sessions are allowed: the school decides, not the program. */
    private static String[] times(String start, String end) {
        String s = start == null || start.isBlank() ? null : start.trim();
        String e = end == null || end.isBlank() ? null : end.trim();
        if (s == null && e == null) return new String[]{null, null};
        if (s == null) throw ApiException.validation("startTime", "REQUIRED");
        if (e == null) throw ApiException.validation("endTime", "REQUIRED");
        if (!TIME.matcher(s).matches()) throw ApiException.validation("startTime", "INVALID_TIME");
        if (!TIME.matcher(e).matches()) throw ApiException.validation("endTime", "INVALID_TIME");
        if (e.compareTo(s) <= 0) throw ApiException.validation("endTime", "END_TIME_BEFORE_START");
        return new String[]{s, e};
    }
}
