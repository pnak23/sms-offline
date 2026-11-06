package kh.school.sms.timetable;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * The school days and the time slots of an academic year (Settings &gt; Timetable). Everything here is typed by the school: a new year, and every school that existed before
 * the timetable did, starts with NO slot and no lesson, and the program never invents a time. The one thing the program supplies is the default school week, Monday to
 * Friday, which is used while a year has no school-day rows of its own (nothing is written for it). Slots of a year are listed by start time and never overlap, so a
 * teacher can only be in one place at a time with a plain unique key. A CLOSED year is read-only. Every change is written to the audit trail with the signed-in user and
 * the time (the audit service adds both); the trail holds ids, codes and times, never names.
 */
@Service
public class TimetableSettingsService {
    /** 1 = Monday ... 7 = Sunday. Used while a year has no school-day rows: the school's own choice replaces it. */
    public static final List<Integer> DEFAULT_DAYS = List.of(1, 2, 3, 4, 5);
    private static final Pattern TIME = Pattern.compile("^([01]\\d|2[0-3]):[0-5]\\d$");

    public record Slot(long id, long academicYearId, String nameKm, String startTime, String endTime, boolean breakSlot, long version, int lessons) {}
    public record YearInfo(long id, String nameKm, boolean closed) {}
    public record Settings(long yearId, String yearName, boolean yearClosed, List<Integer> days, boolean daysAreDefault, List<Slot> slots, int lessons) {}

    private static final String SELECT = """
            SELECT s.id, s.academic_year_id, s.name_km, s.start_time, s.end_time, s.is_break, s.version,
                   (SELECT count(*) FROM timetable_entries e WHERE e.slot_id = s.id)
            FROM timetable_slots s
            """;
    private static final RowMapper<Slot> MAPPER = (rs, n) -> new Slot(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5),
            rs.getInt(6) == 1, rs.getLong(7), rs.getInt(8));

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public TimetableSettingsService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    // ---- reading --------------------------------------------------------------------------------------------------

    public Settings settings(long yearId) {
        YearInfo y = year(yearId);
        List<Slot> slots = slots(yearId);
        int lessons = slots.stream().mapToInt(Slot::lessons).sum();
        return new Settings(y.id(), y.nameKm(), y.closed(), days(yearId), daysAreDefault(yearId), slots, lessons);
    }

    /** The academic year, or a 404. */
    public YearInfo year(long yearId) {
        List<YearInfo> found = jdbc.query("SELECT id, name_km, status FROM academic_years WHERE id = ?",
                (rs, n) -> new YearInfo(rs.getLong(1), rs.getString(2), AcademicYearService.CLOSED.equals(rs.getString(3))), yearId);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    /** The slots of a year, earliest first. */
    public List<Slot> slots(long yearId) {
        return jdbc.query(SELECT + " WHERE s.academic_year_id = ? ORDER BY s.start_time, s.id", MAPPER, yearId);
    }

    public Slot slot(long id) {
        List<Slot> found = jdbc.query(SELECT + " WHERE s.id = ?", MAPPER, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    /** The school days of the year (the default Monday to Friday while the year has chosen none). */
    public List<Integer> days(long yearId) {
        List<Integer> own = jdbc.queryForList("SELECT day_of_week FROM timetable_days WHERE academic_year_id = ? ORDER BY day_of_week", Integer.class, yearId);
        return own.isEmpty() ? DEFAULT_DAYS : own;
    }

    public boolean daysAreDefault(long yearId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM timetable_days WHERE academic_year_id = ?", Integer.class, yearId);
        return n == null || n == 0;
    }

    // ---- school days ----------------------------------------------------------------------------------------------

    @Transactional
    public Settings setDays(long yearId, List<Integer> requested) {
        openYear(yearId);
        if (requested == null || requested.isEmpty()) throw ApiException.validation("days", "REQUIRED");
        TreeSet<Integer> wanted = new TreeSet<>();
        for (Integer d : requested) {
            if (d == null || d < 1 || d > 7 || !wanted.add(d)) throw ApiException.validation("days", "INVALID");
        }
        List<Integer> before = days(yearId);
        boolean own = !daysAreDefault(yearId);
        if (own && before.equals(new ArrayList<>(wanted))) return settings(yearId);
        for (int d : before) {
            if (wanted.contains(d)) continue;
            Integer used = jdbc.queryForObject("SELECT count(*) FROM timetable_entries e JOIN timetable_slots s ON s.id = e.slot_id WHERE s.academic_year_id = ? AND e.day_of_week = ?",
                    Integer.class, yearId, d);
            if (used != null && used > 0) throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_DAY_IN_USE", List.of(new ApiException.FieldError("days", "TIMETABLE_DAY_IN_USE")), Map.of("dayOfWeek", d));
        }
        jdbc.update("DELETE FROM timetable_days WHERE academic_year_id = ?", yearId);
        for (int d : wanted) jdbc.update("INSERT INTO timetable_days (academic_year_id, day_of_week) VALUES (?, ?)", yearId, d);
        audit.record("TIMETABLE_DAYS_CHANGED", "academic_year", yearId, "timetable school days changed", "{\"days\":" + before + "}", "{\"days\":" + wanted + "}");
        return settings(yearId);
    }

    // ---- slots ----------------------------------------------------------------------------------------------------

    @Transactional
    public Slot create(long yearId, String nameKm, String startTime, String endTime, boolean breakSlot) {
        openYear(yearId);
        String name = uniqueName(nameKm, yearId, -1);
        String[] t = times(startTime, endTime);
        noOverlap(yearId, t[0], t[1], -1);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO timetable_slots (academic_year_id, name_km, start_time, end_time, is_break, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                yearId, name, t[0], t[1], breakSlot ? 1 : 0, now, now);
        Long id = jdbc.queryForObject("SELECT id FROM timetable_slots WHERE academic_year_id = ? AND name_km = ?", Long.class, yearId, name);
        audit.record("TIMETABLE_SLOT_CREATED", "timetable_slot", id, "timetable time slot created", null, slotJson(t[0], t[1], breakSlot));
        return slot(id);
    }

    @Transactional
    public Slot update(long id, String nameKm, String startTime, String endTime, boolean breakSlot, long version) {
        Slot s = slot(id);
        openYear(s.academicYearId());
        if (s.version() != version) throw ApiException.staleVersion();
        String name = uniqueName(nameKm, s.academicYearId(), id);
        String[] t = times(startTime, endTime);
        noOverlap(s.academicYearId(), t[0], t[1], id);
        if (breakSlot && s.lessons() > 0) throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_SLOT_IN_USE");   // a break never holds a lesson
        if (name.equals(s.nameKm()) && t[0].equals(s.startTime()) && t[1].equals(s.endTime()) && breakSlot == s.breakSlot()) return s;
        jdbc.update("UPDATE timetable_slots SET name_km = ?, start_time = ?, end_time = ?, is_break = ?, version = version + 1, updated_at = ? WHERE id = ?",
                name, t[0], t[1], breakSlot ? 1 : 0, clock.instant().toString(), id);
        audit.record("TIMETABLE_SLOT_UPDATED", "timetable_slot", id, "timetable time slot changed", slotJson(s.startTime(), s.endTime(), s.breakSlot()), slotJson(t[0], t[1], breakSlot));
        return slot(id);
    }

    /** Only a slot that holds no lesson. One that does is renamed or moved instead, so that no lesson loses its place. */
    @Transactional
    public void delete(long id) {
        Slot s = slot(id);
        openYear(s.academicYearId());
        if (s.lessons() > 0) throw new ApiException(HttpStatus.CONFLICT, "TIMETABLE_SLOT_IN_USE");
        jdbc.update("DELETE FROM timetable_slots WHERE id = ?", id);
        audit.record("TIMETABLE_SLOT_DELETED", "timetable_slot", id, "timetable time slot deleted", slotJson(s.startTime(), s.endTime(), s.breakSlot()), null);
    }

    // ---- rules ----------------------------------------------------------------------------------------------------

    /** The year must exist and be open: a closed year is read-only. */
    void openYear(long yearId) {
        List<String> s = jdbc.queryForList("SELECT status FROM academic_years WHERE id = ?", String.class, yearId);
        if (s.isEmpty()) throw ApiException.validation("academicYearId", "INVALID");
        if (AcademicYearService.CLOSED.equals(s.get(0))) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private String uniqueName(String raw, long yearId, long ownId) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        Integer taken = jdbc.queryForObject("SELECT count(*) FROM timetable_slots WHERE academic_year_id = ? AND name_km = ? AND id <> ?", Integer.class, yearId, name, ownId);
        if (taken != null && taken > 0) throw ApiException.duplicate("nameKm");
        return name;
    }

    /** Both times, "HH:mm", the end after the start. A slot without times is not a slot: the school types its own. */
    static String[] times(String start, String end) {
        String s = start == null || start.isBlank() ? null : start.trim();
        String e = end == null || end.isBlank() ? null : end.trim();
        if (s == null) throw ApiException.validation("startTime", "REQUIRED");
        if (e == null) throw ApiException.validation("endTime", "REQUIRED");
        if (!TIME.matcher(s).matches()) throw ApiException.validation("startTime", "INVALID_TIME");
        if (!TIME.matcher(e).matches()) throw ApiException.validation("endTime", "INVALID_TIME");
        if (e.compareTo(s) <= 0) throw ApiException.validation("endTime", "END_TIME_BEFORE_START");
        return new String[]{s, e};
    }

    /** Slots of a year never overlap (a break counts too). If the school one day needs two groups at the same clock time, this is the one rule to lift. */
    private void noOverlap(long yearId, String start, String end, long ownId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM timetable_slots WHERE academic_year_id = ? AND id <> ? AND start_time < ? AND end_time > ?", Integer.class, yearId, ownId, end, start);
        if (n != null && n > 0) throw ApiException.validation("startTime", "TIMETABLE_SLOT_OVERLAP");
    }

    private static String slotJson(String start, String end, boolean breakSlot) {
        return "{\"start\":\"" + start + "\",\"end\":\"" + end + "\",\"break\":" + breakSlot + "}";
    }
}
