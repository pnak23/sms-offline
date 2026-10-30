package kh.school.sms.audit;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

import kh.school.sms.security.AuthUser;

/**
 * Append-only audit trail. Summaries describe WHAT happened and must never contain passwords, recovery keys,
 * tokens or personal data (enforced by tests that scan the log and the table).
 */
@Service
public class AuditService {
    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AuditService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public void record(String action, String entityType, Long entityId, String summary) {
        jdbc.update("INSERT INTO audit_logs (at, actor, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?)",
                Instant.now(clock).toString(), actor(), action, entityType, entityId, summary);
    }

    private static String actor() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        return a != null && a.getPrincipal() instanceof AuthUser u ? u.username() : "system";
    }
}
