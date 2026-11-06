package kh.school.sms.settings;

import kh.school.sms.common.KhmerText;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import java.util.function.UnaryOperator;

/** Key/value application settings. Only whitelisted keys can be set through the API; each key has a validator. */
@Service
public class AppSettingsService {
    public static final String SETUP_STEP = "setup.step";
    public static final String SETUP_COMPLETED_AT = "setup.completed_at";

    public static final String FEES_ENABLED = "fees.enabled";
    public static final String FEES_CURRENCIES = "fees.currencies";
    /** The preferred fee currency (KHR until the school says otherwise). It only matters when BOTH currencies are allowed: it is then offered first. It never changes recorded money. */
    public static final String FEES_DEFAULT_CURRENCY = "fees.defaultCurrency";
    /** Which count the dashboard and the report cards use: DAY (a day counts once) or SESSION (every sheet counts). Both are always available on the screens. */
    public static final String ATTENDANCE_BASIS = "attendance.officialBasis";

    /** Public (API-editable) keys with their defaults, a cleaner applied before validation (text is normalised) and a validator. */
    private record Def(String key, String defaultValue, UnaryOperator<String> clean, Predicate<String> valid) {
        Def(String key, String defaultValue, Predicate<String> valid) { this(key, defaultValue, UnaryOperator.identity(), valid); }
    }

    private static final Predicate<String> BOOL = v -> v.equals("true") || v.equals("false");
    /** A line of the printed header: free text, may be empty (the line is then left out). */
    private static final UnaryOperator<String> LINE = v -> { String s = KhmerText.free(v); return s == null ? "" : s; };
    private static final Predicate<String> LINE_OK = v -> v.length() <= 100;
    private static final Predicate<String> CAPTION_OK = v -> v.length() <= 60;
    private static final Predicate<String> NOTE_OK = v -> v.length() <= 200;
    /** The roll of honour's artwork styles (the frontend draws them: utils/honorArt.ts, and a test keeps the two lists equal). */
    private static final List<String> HONOR_STYLES = List.of("classic", "lotus", "angkor", "star", "royal", "laurel", "guilloche", "kids", "mono", "sun",
            "kbach", "rice", "palm", "rose", "moon", "book", "flag", "vintage", "modern", "wave");
    /** A few lines of text for a certificate: line breaks and spaces are kept exactly as typed (only the ends are trimmed and Windows line ends become \n). */
    private static final UnaryOperator<String> BLOCK = v -> { String s = KhmerText.free(v.replace("\r\n", "\n").replace('\r', '\n')); return s == null ? "" : s; };
    /** At most 4 lines and 300 characters, and no control character other than the line break. */
    private static final Predicate<String> BLOCK_OK = v -> v.length() <= 300 && v.lines().count() <= 4 && v.chars().noneMatch(c -> (c < 0x20 && c != '\n') || c == 0x7f);

    /** The five text boxes of the roll of honour (the names the frontend uses in utils/honorRoll.ts). */
    private static final List<String> HONOR_BOXES = List.of("header", "subtitle", "dateLines", "titleRight", "titleLeft");
    private static final JsonMapper JSON = JsonMapper.builder().build();

    /**
     * How each text box of the roll of honour is set (font, size, bold, italic, underline, alignment, shrink-to-fit): a small JSON text such as
     * {"dateLines":{"size":"S","fit":true}}. Only the boxes and fields listed here are accepted, each with its own allowed values; empty means "all standard".
     */
    private static final List<String> RANKING_BOXES = List.of("header", "title", "stats", "dateLines", "titleRight", "titleLeft");
    /** The column headings of the monthly ranking list (eight headings and the two letters for the sexes) the school may rename. */
    private static final List<String> RANKING_COLUMNS = List.of("no", "name", "gender", "total", "average", "rank", "grade", "remarks", "female", "male");

    private static boolean honorFormatsOk(String v) { return formatsOk(v, HONOR_BOXES); }

    private static boolean formatsOk(String v, List<String> allowedBoxes) {
        if (v.isEmpty()) return true;
        if (v.length() > 1200) return false;
        try {
            if (!(JSON.readValue(v, Object.class) instanceof Map<?, ?> boxes)) return false;
            for (Map.Entry<?, ?> box : boxes.entrySet()) {
                if (!allowedBoxes.contains(box.getKey()) || !(box.getValue() instanceof Map<?, ?> fields)) return false;
                for (Map.Entry<?, ?> field : fields.entrySet()) {
                    Object x = field.getValue();
                    boolean ok = switch (String.valueOf(field.getKey())) {
                        case "font" -> List.of("text", "title").contains(x);
                        case "size" -> List.of("S", "M", "L", "XL").contains(x);
                        case "align" -> List.of("left", "center", "right").contains(x);
                        case "bold", "italic", "underline", "fit" -> x instanceof Boolean;
                        default -> false;
                    };
                    if (!ok) return false;
                }
            }
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** The ranking list's column headings: {"name":"...", ...}; only the known keys, each a short text without control characters; empty means all standard. */
    private static boolean rankingColumnsOk(String v) {
        if (v.isEmpty()) return true;
        if (v.length() > 800) return false;
        try {
            if (!(JSON.readValue(v, Object.class) instanceof Map<?, ?> columns)) return false;
            for (Map.Entry<?, ?> column : columns.entrySet()) {
                if (!RANKING_COLUMNS.contains(column.getKey()) || !(column.getValue() instanceof String text)) return false;
                if (text.length() > 40 || text.chars().anyMatch(c -> c < 0x20 || c == 0x7f)) return false;
            }
            return true;
        } catch (RuntimeException e) {
            return false;
        }
    }

    private static final List<Def> PUBLIC = List.of(
            // a reminder to copy a backup to a USB stick: OFF (0) until the school asks for it (the owner's policy of 2026-11-05: local backups are the primary method, a USB copy is optional)
            new Def("backup.reminderDays", "0", v -> intIn(v, 0, 90)),
            new Def("ui.idleLockMinutes", "10", v -> intIn(v, 1, 120)),
            new Def("report.khmerNumerals", "false", BOOL),
            // the national / ministry header above the school name on printed reports (off by default); the wording is editable
            new Def("report.moeysHeader", "false", BOOL),
            new Def("report.headerLine1", "ព្រះរាជាណាចក្រកម្ពុជា", LINE, LINE_OK),
            new Def("report.headerLine2", "ជាតិ សាសនា ព្រះមហាក្សត្រ", LINE, LINE_OK),
            new Def("report.headerLine3", "", LINE, LINE_OK),
            // the report card's layout (Settings > Report card). The defaults are today's card exactly; the real template is still waiting for the school's sample.
            new Def("card.showLogo", "true", BOOL),
            new Def("card.showNationalHeader", "true", BOOL),   // still needs report.moeysHeader: this only lets the card leave it out
            new Def("card.showPhoto", "false", BOOL),
            new Def("card.showAttendance", "true", BOOL),
            new Def("card.showRank", "true", BOOL),
            new Def("card.showComment", "true", BOOL),
            new Def("card.signatureCount", "1", v -> intIn(v, 0, 3)),
            new Def("card.signature1", "", LINE, CAPTION_OK),   // empty = the default caption (the director, with the name from the school profile)
            new Def("card.signature2", "", LINE, CAPTION_OK),
            new Def("card.signature3", "", LINE, CAPTION_OK),
            new Def("card.footerNote", "", LINE, NOTE_OK),
            new Def("card.subjectOrder", "default", v -> v.equals("default") || v.equals("name")),
            // the detail under a main subject made of sub-subjects (V8); off by default: the card lists main subjects only
            new Def("card.showSubSubjects", "false", BOOL),
            // the roll of honour (Settings > Roll of honour): ONE saved default, so printing it only means choosing the date. The five texts are the places the school marked on
            // its sample certificate; the words in braces ({school} {class} {exam} {date} {month} {year}) are filled in by the page. The defaults are the standard wording
            // (a test keeps them equal to the frontend's STANDARD_HONOR_TEXTS); a box saved empty prints nothing.
            new Def("honor.count", "5", v -> v.equals("5") || v.equals("10")),
            new Def("honor.style", "classic", HONOR_STYLES::contains),
            new Def("honor.header", "{school}\n{class}", BLOCK, BLOCK_OK),
            new Def("honor.subtitle", "លទ្ធផល{exam}", BLOCK, BLOCK_OK),
            new Def("honor.dateLines", "{date}", BLOCK, BLOCK_OK),
            new Def("honor.titleRight", "គ្រូប្រចាំថ្នាក់", BLOCK, BLOCK_OK),
            new Def("honor.titleLeft", "បានឃើញ និងឯកភាព\nនាយក/នាយិកា", BLOCK, BLOCK_OK),
            new Def("honor.allClasses", "false", BOOL),
            new Def("honor.formats", "", String::strip, AppSettingsService::honorFormatsOk),
            // the monthly ranking list (every student of a class with total, average and rank): the same idea, with its own six texts (a test keeps the defaults equal to the frontend's)
            new Def("ranking.header", "{school}\n{class}", BLOCK, BLOCK_OK),
            new Def("ranking.title", "ភាពចំណាត់ថ្នាក់ប្រចាំខែ{month} ({schoolYear})", BLOCK, BLOCK_OK),
            new Def("ranking.stats", "បញ្ចប់បញ្ជីត្រឹមចំនួនសិស្សសរុប {total} នាក់ ស្រី {female} នាក់\nសិស្សមានមធ្យមភាគសរុប {passed} នាក់ ស្រី {passedFemale} នាក់\nសិស្សធ្លាក់មធ្យមភាគសរុប {failed} នាក់ ស្រី {failedFemale} នាក់", BLOCK, BLOCK_OK),
            new Def("ranking.dateLines", "{date}", BLOCK, BLOCK_OK),
            new Def("ranking.titleRight", "គ្រូប្រចាំថ្នាក់", BLOCK, BLOCK_OK),
            new Def("ranking.titleLeft", "បានឃើញ និងឯកភាព\nនាយក/នាយិកា", BLOCK, BLOCK_OK),
            new Def("ranking.formats", "", String::strip, v -> formatsOk(v, RANKING_BOXES)),
            new Def("ranking.columns", "", String::strip, AppSettingsService::rankingColumnsOk),
            new Def("ranking.allClasses", "false", BOOL),
            // the table of the ranking list is coloured (heading, rows by grade, remarks column) until the school switches the colours off: then every cell is transparent
            new Def("ranking.colours", "true", BOOL),
            // how attendance is counted officially; the school has not chosen yet, so the default is the owner's rule (a day is one day however many sessions it had)
            new Def(ATTENDANCE_BASIS, "DAY", v -> v.equals("DAY") || v.equals("SESSION")),
            // fees are optional; the currencies a record may use (KHR only until the school says otherwise)
            new Def(FEES_ENABLED, "false", BOOL),
            new Def(FEES_CURRENCIES, "KHR", v -> List.of("KHR", "USD", "KHR,USD").contains(v)),
            new Def(FEES_DEFAULT_CURRENCY, "KHR", v -> List.of("KHR", "USD").contains(v)));

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
        Map<String, String> cleaned = new java.util.LinkedHashMap<>();
        for (Map.Entry<String, String> e : values.entrySet()) {
            Def d = PUBLIC.stream().filter(p -> p.key().equals(e.getKey())).findFirst().orElse(null);
            if (d == null || e.getValue() == null) {
                bad.add(e.getKey());
                continue;
            }
            String value = d.clean().apply(e.getValue());
            if (d.valid().test(value)) cleaned.put(e.getKey(), value);
            else bad.add(e.getKey());
        }
        if (bad.isEmpty()) cleaned.forEach(this::put);
        return bad;
    }

    /** "DAY" or "SESSION": how the dashboard and the report cards count attendance. */
    public String attendanceBasis() { return get(ATTENDANCE_BASIS).filter(v -> v.equals("DAY") || v.equals("SESSION")).orElse("DAY"); }

    public boolean feesEnabled() { return get(FEES_ENABLED).map("true"::equals).orElse(false); }

    /**
     * The currencies a fee may be in, e.g. ["KHR"]. When both are allowed the preferred one (fees.defaultCurrency) comes first: that is the currency a new fee category starts in.
     * A preferred currency that is not allowed is ignored.
     */
    public List<String> feeCurrencies() {
        List<String> allowed = List.of(get(FEES_CURRENCIES).orElse("KHR").split(","));
        String preferred = get(FEES_DEFAULT_CURRENCY).orElse("KHR");
        if (allowed.size() < 2 || !allowed.contains(preferred)) return allowed;
        List<String> ordered = new ArrayList<>();
        ordered.add(preferred);
        for (String c : allowed) if (!c.equals(preferred)) ordered.add(c);
        return ordered;
    }
}
