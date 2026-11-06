package kh.school.sms.acceptance;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

import java.io.IOException;
import java.io.InputStream;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

/**
 * What is still pending before the school accepts the system, and the school's own sign-off. The items ship with the program
 * ({@code acceptance.json}: only "development completed / in progress" and what is pending); a sign-off is a row written by the
 * administrator. The two are kept apart on purpose: a build can never mark something accepted.
 */
@Service
public class AcceptanceService {
    public record Item(String id, String group, String development, String pending) {}
    private record Registry(int format, List<Item> items) {}
    public record SignOff(String signedBy, String at, String note) {}
    public record View(String id, String group, String development, String pending, SignOff signOff) {}
    private record Row(String itemId, SignOff signOff) {}

    private static final JsonMapper JSON = JsonMapper.builder().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).build();

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;
    private final List<Item> items;

    public AcceptanceService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
        this.items = load();
    }

    private static List<Item> load() {
        try (InputStream in = AcceptanceService.class.getResourceAsStream("/acceptance.json")) {
            if (in == null) throw new IllegalStateException("acceptance.json is missing from the program");
            Registry r = JSON.readValue(in, Registry.class);
            if (r.items() == null || r.items().isEmpty()) throw new IllegalStateException("acceptance.json has no items");
            return List.copyOf(r.items());
        } catch (IOException e) {
            throw new IllegalStateException("acceptance.json cannot be read", e);
        }
    }

    public List<Item> registry() { return items; }

    public List<View> list() {
        RowMapper<Row> mapper = (rs, n) -> new Row(rs.getString(1), new SignOff(rs.getString(2), rs.getString(3), rs.getString(4)));
        List<Row> signed = jdbc.query("SELECT item_id, signed_by, signed_at, note FROM acceptance_signoffs", mapper);
        return items.stream().map(i -> new View(i.id(), i.group(), i.development(), i.pending(),
                signed.stream().filter(s -> s.itemId().equals(i.id())).map(Row::signOff).findFirst().orElse(null))).toList();
    }

    private Item item(String id) {
        return items.stream().filter(i -> i.id().equals(id)).findFirst().orElseThrow(ApiException::notFound);
    }

    /** The rule: only an item whose development is complete can be accepted (kept apart so a test can try it on items that are not finished, which the shipped list may have none of). */
    static boolean readyForSignOff(Item item) { return "COMPLETED".equals(item.development()); }

    /** Records that the administrator checked this item for the school. Only an item whose development is complete can be accepted. */
    public View signOff(String id, String note, AuthUser user) {
        Item item = item(id);
        if (!readyForSignOff(item)) throw new ApiException(HttpStatus.CONFLICT, "NOT_READY_FOR_SIGN_OFF");
        Integer already = jdbc.queryForObject("SELECT count(*) FROM acceptance_signoffs WHERE item_id = ?", Integer.class, id);
        if (already != null && already > 0) throw new ApiException(HttpStatus.CONFLICT, "ALREADY_SIGNED_OFF");
        String name = jdbc.queryForObject("SELECT display_name FROM app_users WHERE id = ?", String.class, user.id());
        jdbc.update("INSERT INTO acceptance_signoffs (item_id, signed_by, username, signed_at, note) VALUES (?, ?, ?, ?, ?)",
                id, name, user.username(), Instant.now(clock).toString(), KhmerText.free(note));
        audit.record("ACCEPTANCE_SIGNED_OFF", "acceptance", null, "acceptance item signed off: " + id);
        return list().stream().filter(v -> v.id().equals(id)).findFirst().orElseThrow();
    }

    /** Takes a sign-off back (a mistake, or something changed). Audited, never silent. */
    public void withdraw(String id) {
        item(id);
        if (jdbc.update("DELETE FROM acceptance_signoffs WHERE item_id = ?", id) == 0) throw ApiException.notFound();
        audit.record("ACCEPTANCE_WITHDRAWN", "acceptance", null, "acceptance sign-off withdrawn: " + id);
    }
}
