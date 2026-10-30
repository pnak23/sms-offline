package kh.school.sms.settings;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;

/** Key/value application settings. Only whitelisted keys can be set through the API; each key has a validator. */
@Service
public class AppSettingsService {
    public static final String SETUP_STEP = "setup.step";
    public static final String SETUP_COMPLETED_AT = "setup.completed_at";

    /** Public (API-editable) keys with their defaults and validators. */
    private record Def(String key, String defaultValue, Predicate<String> valid) {}

    private static final List<Def> PUBLIC = List.of(
            new Def("backup.reminderDays", "7", v -> intIn(v, 1, 90)),
            new Def("ui.idleLockMinutes", "10", v -> intIn(v, 1, 120)),
            new Def("report.khmerNumerals", "false", v -> v.equals("true") || v.equals("false")));

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public AppSettingsService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    private static boolean intIn(String v, int min, int max) {
        try {
            int n = Integer.parseInt(v);
            return n >= min && n <= max;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    public Optional<String> get(String key) {
        List<String> r = jdbc.queryForList("SELECT setting_value FROM app_settings WHERE setting_key = ?", String.class, key);
        return r.isEmpty() ? Optional.empty() : Optional.of(r.get(0));
    }

    public void put(String key, String value) {
        jdbc.update("INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) "
                + "ON CONFLICT (setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at",
                key, value, Instant.now(clock).toString());
    }

    /** All public keys, defaults filled in. */
    public Map<String, String> allPublic() {
        Map<String, String> m = new java.util.LinkedHashMap<>();
        for (Def d : PUBLIC) m.put(d.key(), get(d.key()).orElse(d.defaultValue()));
        return m;
    }

    /** @return the keys that were rejected (unknown key or invalid value); empty means everything was stored */
    public List<String> putPublic(Map<String, String> values) {
        List<String> bad = new java.util.ArrayList<>();
        for (Map.Entry<String, String> e : values.entrySet()) {
            Def d = PUBLIC.stream().filter(p -> p.key().equals(e.getKey())).findFirst().orElse(null);
            if (d == null || e.getValue() == null || !d.valid().test(e.getValue())) bad.add(e.getKey());
        }
        if (bad.isEmpty()) values.forEach(this::put);
        return bad;
    }
}
