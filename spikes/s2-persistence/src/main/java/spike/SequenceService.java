package spike;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Gap-free, duplicate-free human codes (student/teacher/receipt numbers) from one atomic upsert. */
@Service
public class SequenceService {
    private final JdbcTemplate jdbc;

    public SequenceService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

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
