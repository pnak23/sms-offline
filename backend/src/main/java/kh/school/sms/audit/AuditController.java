package kh.school.sms.audit;

import kh.school.sms.common.Dates;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/**
 * The audit trail, READ ONLY: there is deliberately no method here that changes or deletes a row, and the table is only ever
 * written by {@link AuditService}. Rows carry codes and ids (never names or free text); the frontend turns the action and
 * entity codes into Khmer.
 */
@RestController
@RequestMapping("/api/v1/audit")
public class AuditController {
    public record Row(long id, String at, String actor, String action, String entityType, Long entityId, String summary) {}
    /** {@code hasMore}: another page exists after the last row (ask again with {@code beforeId} = its id). */
    public record Page(List<Row> rows, boolean hasMore) {}
    public record Filters(List<String> actions, List<String> actors, List<String> entityTypes) {}

    private final JdbcTemplate jdbc;

    public AuditController(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /**
     * Newest first. {@code from} / {@code to} are days on this PC's calendar, both included. The table is searched by id (the
     * order rows were written), so paging with {@code beforeId} never skips or repeats a row.
     */
    @GetMapping
    public Page list(@RequestParam(required = false) String from, @RequestParam(required = false) String to,
                     @RequestParam(required = false) String action, @RequestParam(required = false) String actor,
                     @RequestParam(required = false) String entityType, @RequestParam(required = false) Long beforeId,
                     @RequestParam(defaultValue = "50") int limit) {
        int size = Math.max(1, Math.min(limit, 200));
        StringBuilder sql = new StringBuilder("SELECT id, at, actor, action, entity_type, entity_id, summary FROM audit_logs WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        LocalDate first = Dates.optional(from, "from");
        LocalDate last = Dates.optional(to, "to");
        // 'at' is an ISO instant in UTC with a varying number of fraction digits; comparing against a bound WITHOUT the trailing Z
        // is exact for every value (a shorter string sorts before a longer one that starts with it)
        if (first != null) { sql.append(" AND at >= ?"); args.add(bound(first)); }
        if (last != null) { sql.append(" AND at < ?"); args.add(bound(last.plusDays(1))); }
        if (action != null && !action.isBlank()) { sql.append(" AND action = ?"); args.add(action); }
        if (actor != null && !actor.isBlank()) { sql.append(" AND actor = ?"); args.add(actor); }
        if (entityType != null && !entityType.isBlank()) { sql.append(" AND entity_type = ?"); args.add(entityType); }
        if (beforeId != null) { sql.append(" AND id < ?"); args.add(beforeId); }
        sql.append(" ORDER BY id DESC LIMIT ?");
        args.add(size + 1);
        // a typed RowMapper, not a bare lambda: the IDE's compiler finds query(sql, lambda, Object[]) ambiguous (see CLAUDE.md)
        RowMapper<Row> mapper = (rs, n) -> new Row(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5),
                rs.getObject(6) == null ? null : rs.getLong(6), rs.getString(7));
        List<Row> rows = jdbc.query(sql.toString(), mapper, args.toArray());
        boolean more = rows.size() > size;
        return new Page(more ? rows.subList(0, size) : rows, more);
    }

    /** What the filter drop-downs offer: only values that exist in the trail. */
    @GetMapping("/filters")
    public Filters filters() {
        return new Filters(
                jdbc.queryForList("SELECT DISTINCT action FROM audit_logs ORDER BY action", String.class),
                jdbc.queryForList("SELECT DISTINCT actor FROM audit_logs WHERE actor IS NOT NULL ORDER BY actor", String.class),
                jdbc.queryForList("SELECT DISTINCT entity_type FROM audit_logs WHERE entity_type IS NOT NULL ORDER BY entity_type", String.class));
    }

    /** Midnight at the start of {@code day} on this PC, as a UTC instant without the Z. */
    private static String bound(LocalDate day) {
        String s = day.atStartOfDay(ZoneId.systemDefault()).toInstant().toString();   // yyyy-MM-ddTHH:mm:ssZ (no fraction at midnight)
        return s.endsWith("Z") ? s.substring(0, s.length() - 1) : s;
    }
}
