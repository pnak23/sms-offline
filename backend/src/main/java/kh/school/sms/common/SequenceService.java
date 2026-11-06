package kh.school.sms.common;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gap-free, duplicate-free human codes (subject, student and teacher numbers, receipts) from one atomic upsert on
 * {@code id_sequences}. It joins the caller's transaction, so a rolled-back save gives its number back (proven by spike S2).
 */
@Service
public class SequenceService {
    private final JdbcTemplate jdbc;

    public SequenceService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** @param year 0 for a sequence that never restarts, otherwise the year it belongs to */
    @Transactional
    public long next(String name, int year) {
        Long v = jdbc.queryForObject(
                "INSERT INTO id_sequences (name, year, next_value) VALUES (?, ?, 1) "
                        + "ON CONFLICT (name, year) DO UPDATE SET next_value = next_value + 1 RETURNING next_value",
                Long.class, name, year);
        if (v == null) throw new IllegalStateException("sequence returned null");
        return v;
    }
}
