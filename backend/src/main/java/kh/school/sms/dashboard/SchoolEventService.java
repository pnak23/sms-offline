package kh.school.sms.dashboard;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/** The school's own calendar entries (an exam week, a holiday, a meeting), shown as "upcoming events" on the dashboard. */
@Service
public class SchoolEventService {
    public record Event(long id, String titleKm, String startDate, String endDate, String note, long version) {}
    public record Input(String titleKm, LocalDate startDate, LocalDate endDate, String note) {}

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public SchoolEventService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    private static Event row(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        return new Event(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getLong(6));
    }

    private static final String SELECT = "SELECT id, title_km, start_date, end_date, note, version FROM school_events";

    /** Events that overlap {@code from}..{@code to}; both optional (no limit on that side). Earliest first. */
    public List<Event> list(LocalDate from, LocalDate to, int limit) {
        return jdbc.query(SELECT + """
                 WHERE (? IS NULL OR COALESCE(end_date, start_date) >= ?) AND (? IS NULL OR start_date <= ?)
                 ORDER BY start_date, id LIMIT ?
                """, SchoolEventService::row, str(from), str(from), str(to), str(to), limit);
    }

    private static String str(LocalDate d) { return d == null ? null : d.toString(); }

    public Event get(long id) {
        List<Event> found = jdbc.query(SELECT + " WHERE id = ?", SchoolEventService::row, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    private record Checked(String title, String note) {}

    private static Checked check(Input in) {
        String title = KhmerText.name(in.titleKm());
        if (title == null) throw ApiException.validation("titleKm", "REQUIRED");
        if (title.length() > 150) throw ApiException.validation("titleKm", "Size");
        if (in.startDate() == null) throw ApiException.validation("startDate", "REQUIRED");
        if (in.endDate() != null && in.endDate().isBefore(in.startDate())) throw ApiException.validation("endDate", "END_BEFORE_START");
        String note = KhmerText.free(in.note());
        if (note != null && note.length() > 500) throw ApiException.validation("note", "Size");
        return new Checked(title, note);
    }

    @Transactional
    public Event create(Input in) {
        Checked c = check(in);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO school_events (title_km, start_date, end_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                c.title(), in.startDate().toString(), str(in.endDate()), c.note(), now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM school_events", Long.class);
        audit.record("SCHOOL_EVENT_CREATED", "school_event", id, "school event created");
        return get(id);
    }

    @Transactional
    public Event update(long id, Input in, long version) {
        get(id);
        Checked c = check(in);
        int changed = jdbc.update("UPDATE school_events SET title_km = ?, start_date = ?, end_date = ?, note = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
                c.title(), in.startDate().toString(), str(in.endDate()), c.note(), clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("SCHOOL_EVENT_UPDATED", "school_event", id, "school event updated");
        return get(id);
    }

    @Transactional
    public void delete(long id) {
        get(id);
        jdbc.update("DELETE FROM school_events WHERE id = ?", id);
        audit.record("SCHOOL_EVENT_DELETED", "school_event", id, "school event deleted");
    }
}
