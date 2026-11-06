package kh.school.sms.exam;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Grading scales: a pass mark and the bands (the letter and Khmer wording for each range of percentages). The default scale is the
 * one every result uses. There is no per-grade override. The seeded scale is only a starting point; the school's real one replaces it.
 */
@Service
public class GradingScaleService {
    public record Band(BigDecimal minPercent, String labelKm, String letter) {}
    public record Scale(long id, String nameKm, boolean isDefault, BigDecimal passPercent, long version, List<Band> bands) {}
    public record Input(String nameKm, BigDecimal passPercent, List<Band> bands) {}

    static final int MAX_BANDS = 12;

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public GradingScaleService(JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    /** The scales the school can choose from. Archived versions (kept only for examinations that were graded with them) are not listed. */
    public List<Scale> list() {
        return jdbc.queryForList("SELECT id FROM grading_scales WHERE archived = 0 ORDER BY is_default DESC, id", Long.class).stream().map(this::get).toList();
    }

    public Scale get(long id) {
        List<Scale> found = jdbc.query("SELECT id, name_km, is_default, pass_percent_x100, version FROM grading_scales WHERE id = ?",
                (rs, n) -> new Scale(rs.getLong(1), rs.getString(2), rs.getInt(3) == 1, Grading.fromX100(rs.getLong(4)), rs.getLong(5), bands(rs.getLong(1))), id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    /** The scale new examinations are graded with. */
    public Scale defaultScale() {
        List<Long> ids = jdbc.queryForList("SELECT id FROM grading_scales WHERE is_default = 1", Long.class);
        if (ids.isEmpty()) throw ApiException.notFound();
        return get(ids.get(0));
    }

    /**
     * The scale one examination is graded with: the one recorded when its first score was entered, or the current default while
     * nothing has been scored yet. This is what keeps an old report card from changing when the school later edits its scale.
     */
    public Scale forExamination(long examId) {
        List<Long> frozen = jdbc.queryForList("SELECT grading_scale_id FROM examinations WHERE id = ? AND grading_scale_id IS NOT NULL", Long.class, examId);
        return frozen.isEmpty() ? defaultScale() : get(frozen.get(0));
    }

    private boolean archived(long id) {
        Integer n = jdbc.queryForObject("SELECT archived FROM grading_scales WHERE id = ?", Integer.class, id);
        return n != null && n == 1;
    }

    private List<Band> bands(long scaleId) {
        return jdbc.query("SELECT min_percent_x100, label_km, letter FROM grading_scale_bands WHERE scale_id = ? ORDER BY min_percent_x100 DESC",
                (rs, n) -> new Band(Grading.fromX100(rs.getLong(1)), rs.getString(2), rs.getString(3)), scaleId);
    }

    @Transactional
    public Scale create(Input in) {
        Valid v = validate(in);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO grading_scales (name_km, is_default, pass_percent_x100, created_at, updated_at) VALUES (?, 0, ?, ?, ?)", v.name, v.passX100, now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM grading_scales", Long.class);
        insertBands(id, v.bands);
        audit.record("GRADING_SCALE_CREATED", "grading_scale", id, "grading scale created");
        return get(id);
    }

    /**
     * A scale no examination was graded with is edited in place. One that was is NOT: the edit becomes a new scale (which takes over
     * as the default if the old one was) and the old scale is archived for the examinations that used it, so their results never change.
     * The answer is the scale as it is now, which has a new id in the second case.
     */
    @Transactional
    public Scale update(long id, Input in, long version) {
        Scale current = get(id);
        if (archived(id) || current.version() != version) throw ApiException.staleVersion();   // an archived scale was already replaced by a newer one
        Valid v = validate(in);
        String now = clock.instant().toString();
        Integer users = jdbc.queryForObject("SELECT count(*) FROM examinations WHERE grading_scale_id = ?", Integer.class, id);
        if (users == null || users == 0) {
            jdbc.update("UPDATE grading_scales SET name_km = ?, pass_percent_x100 = ?, version = version + 1, updated_at = ? WHERE id = ?", v.name, v.passX100, now, id);
            jdbc.update("DELETE FROM grading_scale_bands WHERE scale_id = ?", id);
            insertBands(id, v.bands);
            audit.record("GRADING_SCALE_UPDATED", "grading_scale", id, "grading scale updated");
            return get(id);
        }
        jdbc.update("UPDATE grading_scales SET archived = 1, is_default = 0, updated_at = ? WHERE id = ?", now, id);
        jdbc.update("INSERT INTO grading_scales (name_km, is_default, pass_percent_x100, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", v.name, current.isDefault() ? 1 : 0, v.passX100, now, now);
        long fresh = jdbc.queryForObject("SELECT max(id) FROM grading_scales", Long.class);
        insertBands(fresh, v.bands);
        audit.record("GRADING_SCALE_UPDATED", "grading_scale", fresh, "grading scale updated as a new version; the previous one is kept for examinations already graded with it");
        return get(fresh);
    }

    @Transactional
    public Scale setDefault(long id) {
        get(id);
        if (archived(id)) throw ApiException.staleVersion();
        jdbc.update("UPDATE grading_scales SET is_default = 0 WHERE is_default = 1");
        jdbc.update("UPDATE grading_scales SET is_default = 1, version = version + 1, updated_at = ? WHERE id = ?", clock.instant().toString(), id);
        audit.record("GRADING_SCALE_DEFAULT_CHANGED", "grading_scale", id, "default grading scale changed");
        return get(id);
    }

    private record Valid(String name, long passX100, List<Band> bands) {}

    private Valid validate(Input in) {
        String name = KhmerText.name(in.nameKm());
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        long pass = percentX100(in.passPercent(), "passPercent");
        if (in.bands() == null || in.bands().isEmpty() || in.bands().size() > MAX_BANDS) throw ApiException.validation("bands", "INVALID");
        List<Band> bands = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (Band b : in.bands()) {
            long min = percentX100(b.minPercent(), "bands");
            String label = KhmerText.name(b.labelKm());
            String letter = KhmerText.name(b.letter());
            if (label == null || letter == null || label.length() > 50 || letter.length() > 5 || !seen.add(min)) throw ApiException.validation("bands", "INVALID");
            bands.add(new Band(Grading.fromX100(min), label, letter));
        }
        if (!seen.contains(0L)) throw ApiException.validation("bands", "INVALID");   // everybody must fall into some band
        bands.sort(Comparator.comparing(Band::minPercent).reversed());
        return new Valid(name, pass, bands);
    }

    private static long percentX100(BigDecimal value, String field) {
        try {
            long x100 = Grading.toX100(value);
            if (x100 > 10000) throw new ArithmeticException("above 100");
            return x100;
        } catch (ArithmeticException | NullPointerException e) {
            throw ApiException.validation(field, "INVALID_NUMBER");
        }
    }

    private void insertBands(long scaleId, List<Band> sortedDesc) {
        int order = 1;
        for (Band b : sortedDesc) {
            jdbc.update("INSERT INTO grading_scale_bands (scale_id, min_percent_x100, label_km, letter, sort_order) VALUES (?, ?, ?, ?, ?)",
                    scaleId, Grading.toX100(b.minPercent()), b.labelKm(), b.letter(), order++);
        }
    }
}
