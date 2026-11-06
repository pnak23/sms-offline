package kh.school.sms.fees;

import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.common.SequenceService;
import kh.school.sms.settings.AppSettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * Optional school fees (switched on in Settings; every call answers 409 FEES_DISABLED while it is off). A category (what is charged)
 * is charged to an enrollment as a charge; payments are recorded against a charge and are never deleted: a mistake is VOIDED with a
 * reason and its receipt number stays on record. Amounts are whole units of the currency's smallest denomination ({@link Money}).
 * A closed academic year freezes charges; payments and voids are still allowed, because money owed does not disappear with the year.
 */
@Service
public class FeeService {
    public static final List<String> METHODS = List.of("CASH", "BANK", "OTHER");
    private static final String ROSTER = "('ACTIVE', 'PROMOTED', 'REPEATED', 'GRADUATED')";

    public record Category(long id, String nameKm, BigDecimal defaultAmount, String currency, boolean active, long version) {}
    public record Payment(long id, long chargeId, BigDecimal amount, String currency, String paidOn, String method, String reference, String receiptNo,
                          boolean voided, String voidedAt, String voidReason) {}
    public record Charge(long id, long enrollmentId, long categoryId, String categoryName, BigDecimal amountDue, String currency, String dueDate, String note,
                         BigDecimal paid, BigDecimal balance, long version, List<Payment> payments) {}
    public record Total(String currency, BigDecimal due, BigDecimal paid, BigDecimal balance) {}
    public record Ledger(long enrollmentId, long studentId, String studentCode, String nameKm, String className, String gradeName, String yearName,
                         boolean yearClosed, boolean enrollmentActive, List<Charge> charges, List<Total> totals) {}
    public record ClassRow(long enrollmentId, long studentId, String studentCode, String nameKm, List<Total> totals) {}
    public record ClassSummary(long classId, List<ClassRow> rows, List<Total> totals) {}
    public record BulkResult(int created, int skipped) {}
    public record Receipt(Payment payment, String studentCode, String studentNameKm, String className, String gradeName, String yearName, String categoryName,
                          BigDecimal amountDue, BigDecimal balanceAfter) {}

    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final AppSettingsService settings;
    private final SequenceService sequences;
    private final Clock clock;

    public FeeService(JdbcTemplate jdbc, AuditService audit, AppSettingsService settings, SequenceService sequences, Clock clock) {
        this.jdbc = jdbc;
        this.audit = audit;
        this.settings = settings;
        this.sequences = sequences;
        this.clock = clock;
    }

    private void requireEnabled() {
        if (!settings.feesEnabled()) throw new ApiException(HttpStatus.CONFLICT, "FEES_DISABLED");
    }

    private LocalDate today() { return LocalDate.now(clock.withZone(java.time.ZoneId.systemDefault())); }

    // ---- categories ---------------------------------------------------------------------------------------------------

    public List<Category> categories() {
        requireEnabled();
        return jdbc.query("SELECT id, name_km, default_amount, currency, is_active, version FROM fee_categories ORDER BY is_active DESC, id", FeeService::category);
    }

    private static Category category(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        String currency = rs.getString(4);
        return new Category(rs.getLong(1), rs.getString(2), Money.toMajor(rs.getLong(3), currency), currency, rs.getInt(5) == 1, rs.getLong(6));
    }

    private Category category(long id) {
        List<Category> found = jdbc.query("SELECT id, name_km, default_amount, currency, is_active, version FROM fee_categories WHERE id = ?", FeeService::category, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    private String checkedCurrency(String currency) {
        String c = currency == null || currency.isBlank() ? settings.feeCurrencies().get(0) : currency;
        if (!settings.feeCurrencies().contains(c)) throw ApiException.validation("currency", "CURRENCY_NOT_ALLOWED");
        return c;
    }

    private static String checkedName(String raw) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        if (name.length() > 100) throw ApiException.validation("nameKm", "Size");
        return name;
    }

    private static long minor(BigDecimal amount, String currency, boolean allowZero, String field) {
        try {
            return Money.toMinor(amount, currency, allowZero);
        } catch (ArithmeticException e) {
            throw ApiException.validation(field, "INVALID_NUMBER");
        }
    }

    private void requireUniqueName(String name, Long exceptId) {
        Integer n = jdbc.queryForObject("SELECT count(*) FROM fee_categories WHERE name_km = ? AND (? IS NULL OR id <> ?)", Integer.class, name, exceptId, exceptId);
        if (n != null && n > 0) throw ApiException.duplicate("nameKm");
    }

    @Transactional
    public Category createCategory(String nameKm, BigDecimal defaultAmount, String currency) {
        requireEnabled();
        String name = checkedName(nameKm);
        String cur = checkedCurrency(currency);
        long amount = defaultAmount == null ? 0 : minor(defaultAmount, cur, true, "defaultAmount");
        requireUniqueName(name, null);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO fee_categories (name_km, default_amount, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", name, amount, cur, now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM fee_categories", Long.class);
        audit.record("FEE_CATEGORY_CREATED", "fee_category", id, "fee category created");
        return category(id);
    }

    @Transactional
    public Category updateCategory(long id, String nameKm, BigDecimal defaultAmount, String currency, long version) {
        requireEnabled();
        Category current = category(id);
        String name = checkedName(nameKm);
        String cur = checkedCurrency(currency == null ? current.currency() : currency);
        long amount = defaultAmount == null ? 0 : minor(defaultAmount, cur, true, "defaultAmount");
        requireUniqueName(name, id);
        Integer charged = jdbc.queryForObject("SELECT count(*) FROM student_fees WHERE category_id = ?", Integer.class, id);
        if (charged != null && charged > 0 && !cur.equals(current.currency())) throw ApiException.validation("currency", "INVALID");   // charges already use it
        int changed = jdbc.update("UPDATE fee_categories SET name_km = ?, default_amount = ?, currency = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
                name, amount, cur, clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("FEE_CATEGORY_UPDATED", "fee_category", id, "fee category updated");
        return category(id);
    }

    @Transactional
    public Category setCategoryActive(long id, boolean active, long version) {
        requireEnabled();
        category(id);
        int changed = jdbc.update("UPDATE fee_categories SET is_active = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?", active ? 1 : 0, clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("FEE_CATEGORY_ACTIVE_CHANGED", "fee_category", id, "fee category " + (active ? "activated" : "deactivated"));
        return category(id);
    }

    // ---- charges ------------------------------------------------------------------------------------------------------

    private record Enr(long id, long classId, long yearId, String status, boolean yearClosed) {}

    private Enr enrollment(long id) {
        List<Enr> found = jdbc.query("SELECT e.id, e.class_id, e.academic_year_id, e.status, y.status FROM enrollments e JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = ?",
                (rs, n) -> new Enr(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getString(4), AcademicYearService.CLOSED.equals(rs.getString(5))), id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    private static void requireOpen(boolean closed) {
        if (closed) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private Category activeCategory(long categoryId) {
        List<Category> found = jdbc.query("SELECT id, name_km, default_amount, currency, is_active, version FROM fee_categories WHERE id = ?", FeeService::category, categoryId);
        if (found.isEmpty()) throw ApiException.validation("categoryId", "INVALID");
        if (!found.get(0).active()) throw ApiException.validation("categoryId", "FEE_CATEGORY_INACTIVE");
        return found.get(0);
    }

    private static String cleanNote(String note) {
        String n = KhmerText.free(note);
        if (n != null && n.length() > 200) throw ApiException.validation("note", "Size");
        return n;
    }

    /** One charge for one student; an omitted amount means the category's default amount (which must then be above 0). */
    @Transactional
    public Charge charge(long enrollmentId, long categoryId, BigDecimal amount, LocalDate dueDate, String note) {
        requireEnabled();
        Enr e = enrollment(enrollmentId);
        requireOpen(e.yearClosed());
        if (!"ACTIVE".equals(e.status())) throw ApiException.validation("enrollmentId", "ENROLLMENT_NOT_ACTIVE");
        Category c = activeCategory(categoryId);
        long due = amount == null ? minor(c.defaultAmount(), c.currency(), false, "amount") : minor(amount, c.currency(), false, "amount");
        String n = cleanNote(note);
        String now = clock.instant().toString();
        jdbc.update("INSERT INTO student_fees (enrollment_id, category_id, amount_due, currency, due_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                enrollmentId, categoryId, due, c.currency(), dueDate == null ? null : dueDate.toString(), n, now, now);
        long id = jdbc.queryForObject("SELECT max(id) FROM student_fees", Long.class);
        audit.record("FEE_CHARGED", "student_fee", id, "fee charged to a student");
        return charge(id);
    }

    /** The same charge for every student currently in the class; a student who already has that category with that due date is skipped (so a repeat cannot double-charge). */
    @Transactional
    public BulkResult chargeClass(long classId, long categoryId, BigDecimal amount, LocalDate dueDate, String note) {
        requireEnabled();
        List<Boolean> closed = jdbc.query("SELECT y.status FROM classes c JOIN academic_years y ON y.id = c.academic_year_id WHERE c.id = ?", (rs, n) -> AcademicYearService.CLOSED.equals(rs.getString(1)), classId);
        if (closed.isEmpty()) throw ApiException.validation("classId", "INVALID");
        requireOpen(closed.get(0));
        Category c = activeCategory(categoryId);
        long due = amount == null ? minor(c.defaultAmount(), c.currency(), false, "amount") : minor(amount, c.currency(), false, "amount");
        String n = cleanNote(note);
        String when = dueDate == null ? null : dueDate.toString();
        String now = clock.instant().toString();
        int created = 0, skipped = 0;
        for (long enrollmentId : jdbc.queryForList("SELECT id FROM enrollments WHERE class_id = ? AND status = 'ACTIVE' ORDER BY id", Long.class, classId)) {
            Integer same = jdbc.queryForObject("SELECT count(*) FROM student_fees WHERE enrollment_id = ? AND category_id = ? AND due_date IS ?", Integer.class, enrollmentId, categoryId, when);
            if (same != null && same > 0) {
                skipped++;
                continue;
            }
            jdbc.update("INSERT INTO student_fees (enrollment_id, category_id, amount_due, currency, due_date, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    enrollmentId, categoryId, due, c.currency(), when, n, now, now);
            created++;
        }
        audit.record("FEE_CHARGED", "class", classId, "fee charged to a class: " + created + " students charged, " + skipped + " already had it");
        return new BulkResult(created, skipped);
    }

    @Transactional
    public Charge updateCharge(long id, BigDecimal amount, LocalDate dueDate, String note, long version) {
        requireEnabled();
        Charge current = charge(id);
        requireOpen(enrollment(current.enrollmentId()).yearClosed());
        long due = minor(amount, current.currency(), false, "amount");
        long paid = paidMinor(id, current.currency());
        if (due < paid) throw ApiException.validation("amount", "BELOW_PAID");
        int changed = jdbc.update("UPDATE student_fees SET amount_due = ?, due_date = ?, note = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?",
                due, dueDate == null ? null : dueDate.toString(), cleanNote(note), clock.instant().toString(), id, version);
        if (changed == 0) throw ApiException.staleVersion();
        audit.record("FEE_CHARGE_UPDATED", "student_fee", id, "fee charge updated");
        return charge(id);
    }

    /** Only a charge nobody ever paid (a voided payment counts: it is history). */
    @Transactional
    public void deleteCharge(long id) {
        requireEnabled();
        Charge current = charge(id);
        requireOpen(enrollment(current.enrollmentId()).yearClosed());
        Integer payments = jdbc.queryForObject("SELECT count(*) FROM fee_payments WHERE student_fee_id = ?", Integer.class, id);
        if (payments != null && payments > 0) throw new ApiException(HttpStatus.CONFLICT, "FEE_HAS_PAYMENTS");
        jdbc.update("DELETE FROM student_fees WHERE id = ?", id);
        audit.record("FEE_CHARGE_DELETED", "student_fee", id, "fee charge deleted (nothing had been paid)");
    }

    private long paidMinor(long chargeId, String currency) {
        Long sum = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE student_fee_id = ? AND voided_at IS NULL", Long.class, chargeId);
        return sum == null ? 0 : sum;
    }

    // ---- payments -----------------------------------------------------------------------------------------------------

    @Transactional
    public Payment pay(long chargeId, BigDecimal amount, LocalDate paidOn, String method, String reference) {
        requireEnabled();
        Charge c = charge(chargeId);
        if (paidOn.isAfter(today())) throw ApiException.validation("paidOn", "FUTURE_DATE");
        String m = method == null || method.isBlank() ? "CASH" : method;
        if (!METHODS.contains(m)) throw ApiException.validation("method", "INVALID");
        String ref = KhmerText.free(reference);
        if (ref != null && ref.length() > 100) throw ApiException.validation("reference", "Size");
        long pay = minor(amount, c.currency(), false, "amount");
        long due = Money.toMinor(c.amountDue(), c.currency(), false);
        if (pay > due - paidMinor(chargeId, c.currency())) throw ApiException.validation("amount", "OVERPAYMENT");
        // the receipt number counts up gap-free within the calendar year of the payment: R-2026-00001
        String receipt = String.format("R-%d-%05d", paidOn.getYear(), sequences.next("receipt", paidOn.getYear()));
        jdbc.update("INSERT INTO fee_payments (student_fee_id, amount, paid_on, method, reference, receipt_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                chargeId, pay, paidOn.toString(), m, ref, receipt, clock.instant().toString());
        long id = jdbc.queryForObject("SELECT max(id) FROM fee_payments", Long.class);
        audit.record("PAYMENT_RECORDED", "fee_payment", id, "payment recorded, receipt " + receipt);
        return payment(id);
    }

    @Transactional
    public Payment voidPayment(long id, String reason) {
        requireEnabled();
        Payment p = payment(id);
        if (p.voided()) throw new ApiException(HttpStatus.CONFLICT, "ALREADY_VOIDED");
        String why = KhmerText.free(reason);
        if (why == null) throw ApiException.validation("reason", "REQUIRED");
        if (why.length() > 200) throw ApiException.validation("reason", "Size");
        jdbc.update("UPDATE fee_payments SET voided_at = ?, void_reason = ? WHERE id = ?", clock.instant().toString(), why, id);
        audit.record("PAYMENT_VOIDED", "fee_payment", id, "payment voided, receipt " + p.receiptNo());   // the reason is free text: it stays in the payment, not in the trail
        return payment(id);
    }

    private static final String PAYMENT_SELECT = """
            SELECT p.id, p.student_fee_id, p.amount, f.currency, p.paid_on, p.method, p.reference, p.receipt_no, p.voided_at, p.void_reason
            FROM fee_payments p JOIN student_fees f ON f.id = p.student_fee_id
            """;

    private static Payment payment(java.sql.ResultSet rs, int n) throws java.sql.SQLException {
        String currency = rs.getString(4);
        String voidedAt = rs.getString(9);
        return new Payment(rs.getLong(1), rs.getLong(2), Money.toMajor(rs.getLong(3), currency), currency, rs.getString(5), rs.getString(6), rs.getString(7), rs.getString(8),
                voidedAt != null, voidedAt, rs.getString(10));
    }

    private Payment payment(long id) {
        List<Payment> found = jdbc.query(PAYMENT_SELECT + " WHERE p.id = ?", FeeService::payment, id);
        if (found.isEmpty()) throw ApiException.notFound();
        return found.get(0);
    }

    // ---- reading ------------------------------------------------------------------------------------------------------

    private Charge charge(long id) {
        record Row(long id, long enrollmentId, long categoryId, String category, long due, String currency, String dueDate, String note, long version) {}
        List<Row> rows = jdbc.query("""
                SELECT f.id, f.enrollment_id, f.category_id, c.name_km, f.amount_due, f.currency, f.due_date, f.note, f.version
                FROM student_fees f JOIN fee_categories c ON c.id = f.category_id WHERE f.id = ?
                """, (rs, n) -> new Row(rs.getLong(1), rs.getLong(2), rs.getLong(3), rs.getString(4), rs.getLong(5), rs.getString(6), rs.getString(7), rs.getString(8), rs.getLong(9)), id);
        if (rows.isEmpty()) throw ApiException.notFound();
        Row r = rows.get(0);
        List<Payment> payments = jdbc.query(PAYMENT_SELECT + " WHERE p.student_fee_id = ? ORDER BY p.id", FeeService::payment, id);
        long paid = payments.stream().filter(p -> !p.voided()).mapToLong(p -> Money.toMinor(p.amount(), r.currency(), false)).sum();
        return new Charge(r.id(), r.enrollmentId(), r.categoryId(), r.category(), Money.toMajor(r.due(), r.currency()), r.currency(), r.dueDate(), r.note(),
                Money.toMajor(paid, r.currency()), Money.toMajor(r.due() - paid, r.currency()), r.version(), payments);
    }

    private static List<Total> totals(List<Charge> charges) {
        Map<String, long[]> byCurrency = new TreeMap<>();   // currency -> {due, paid}
        for (Charge c : charges) {
            long[] t = byCurrency.computeIfAbsent(c.currency(), k -> new long[2]);
            t[0] += Money.toMinor(c.amountDue(), c.currency(), false);
            t[1] += Money.toMinor(c.paid(), c.currency(), true);
        }
        return byCurrency.entrySet().stream().map(e -> totalOf(e.getKey(), e.getValue()[0], e.getValue()[1])).toList();
    }

    private static Total totalOf(String currency, long due, long paid) {
        return new Total(currency, Money.toMajor(due, currency), Money.toMajor(paid, currency), Money.toMajor(due - paid, currency));
    }

    /** Everything one student owes and has paid, charge by charge. */
    public Ledger ledger(long enrollmentId) {
        requireEnabled();
        record Head(long studentId, String code, String name, String className, String gradeName, String yearName, boolean closed, boolean active) {}
        List<Head> heads = jdbc.query("""
                SELECT s.id, s.student_code, s.name_km, c.name_km, g.name_km, y.name_km, y.status, e.status
                FROM enrollments e JOIN students s ON s.id = e.student_id JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id
                JOIN academic_years y ON y.id = e.academic_year_id WHERE e.id = ?
                """, (rs, n) -> new Head(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6),
                AcademicYearService.CLOSED.equals(rs.getString(7)), "ACTIVE".equals(rs.getString(8))), enrollmentId);
        if (heads.isEmpty()) throw ApiException.notFound();
        Head h = heads.get(0);
        List<Charge> charges = jdbc.queryForList("SELECT id FROM student_fees WHERE enrollment_id = ? ORDER BY id", Long.class, enrollmentId).stream().map(this::charge).toList();
        return new Ledger(enrollmentId, h.studentId(), h.code(), h.name(), h.className(), h.gradeName(), h.yearName(), h.closed(), h.active(), charges, totals(charges));
    }

    /** Per student of the class: what is owed, paid and still due, per currency. Students with no charge are listed too. */
    public ClassSummary classSummary(long classId) {
        requireEnabled();
        if (jdbc.queryForObject("SELECT count(*) FROM classes WHERE id = ?", Integer.class, classId) == 0) throw ApiException.validation("classId", "INVALID");
        // Who is listed: the students of the class and, whatever happened to them since (moved to another class, left the school), anybody who
        // has a charge here: money owed must not disappear from the overview because the student changed class.
        record Person(long enrollmentId, long studentId, String code, String name) {}
        List<Person> people = jdbc.query("SELECT e.id, s.id, s.student_code, s.name_km FROM enrollments e JOIN students s ON s.id = e.student_id WHERE e.class_id = ? "
                        + "AND (e.status IN " + ROSTER + " OR EXISTS (SELECT 1 FROM student_fees x WHERE x.enrollment_id = e.id)) ORDER BY s.id",
                (rs, n) -> new Person(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4)), classId);
        Map<Long, Map<String, long[]>> sums = new LinkedHashMap<>();   // enrollment id -> currency -> {due, paid}
        jdbc.query("""
                SELECT f.enrollment_id, f.currency, SUM(f.amount_due),
                       COALESCE(SUM((SELECT SUM(p.amount) FROM fee_payments p WHERE p.student_fee_id = f.id AND p.voided_at IS NULL)), 0)
                FROM student_fees f JOIN enrollments e ON e.id = f.enrollment_id
                WHERE e.class_id = ? GROUP BY f.enrollment_id, f.currency
                """,
                rs -> { sums.computeIfAbsent(rs.getLong(1), k -> new TreeMap<>()).put(rs.getString(2), new long[]{rs.getLong(3), rs.getLong(4)}); }, classId);
        List<ClassRow> rows = new ArrayList<>();
        Map<String, long[]> all = new TreeMap<>();
        for (Person p : people) {
            Map<String, long[]> mine = sums.getOrDefault(p.enrollmentId(), Map.of());
            rows.add(new ClassRow(p.enrollmentId(), p.studentId(), p.code(), p.name(), mine.entrySet().stream().map(e -> totalOf(e.getKey(), e.getValue()[0], e.getValue()[1])).toList()));
            mine.forEach((cur, v) -> {
                long[] t = all.computeIfAbsent(cur, k -> new long[2]);
                t[0] += v[0];
                t[1] += v[1];
            });
        }
        return new ClassSummary(classId, rows, all.entrySet().stream().map(e -> totalOf(e.getKey(), e.getValue()[0], e.getValue()[1])).toList());
    }

    /** Still due across the whole school, per currency (for the dashboard). */
    public List<Total> outstanding() {
        Map<String, long[]> sums = new TreeMap<>();
        jdbc.query("SELECT currency, SUM(amount_due) FROM student_fees GROUP BY currency", rs -> { sums.computeIfAbsent(rs.getString(1), k -> new long[2])[0] = rs.getLong(2); });
        jdbc.query("SELECT f.currency, SUM(p.amount) FROM fee_payments p JOIN student_fees f ON f.id = p.student_fee_id WHERE p.voided_at IS NULL GROUP BY f.currency",
                rs -> { sums.computeIfAbsent(rs.getString(1), k -> new long[2])[1] = rs.getLong(2); });
        return sums.entrySet().stream().map(e -> totalOf(e.getKey(), e.getValue()[0], e.getValue()[1])).toList();
    }

    public Receipt receipt(long paymentId) {
        requireEnabled();
        Payment p = payment(paymentId);
        record Head(String code, String name, String className, String gradeName, String yearName, String category, long due) {}
        List<Head> heads = jdbc.query("""
                SELECT s.student_code, s.name_km, c.name_km, g.name_km, y.name_km, cat.name_km, f.amount_due
                FROM student_fees f JOIN fee_categories cat ON cat.id = f.category_id JOIN enrollments e ON e.id = f.enrollment_id JOIN students s ON s.id = e.student_id
                JOIN classes c ON c.id = e.class_id JOIN grades g ON g.id = c.grade_id JOIN academic_years y ON y.id = e.academic_year_id WHERE f.id = ?
                """, (rs, n) -> new Head(rs.getString(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getLong(7)), p.chargeId());
        Head h = heads.get(0);
        Long paidThrough = jdbc.queryForObject("SELECT COALESCE(SUM(amount), 0) FROM fee_payments WHERE student_fee_id = ? AND voided_at IS NULL AND id <= ?", Long.class, p.chargeId(), paymentId);
        long before = paidThrough == null ? 0 : paidThrough;
        return new Receipt(p, h.code(), h.name(), h.className(), h.gradeName(), h.yearName(), h.category(), Money.toMajor(h.due(), p.currency()), Money.toMajor(h.due() - before, p.currency()));
    }
}
