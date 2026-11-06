package kh.school.sms.academic;

import kh.school.sms.attendance.AttendancePeriodService;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/** Academic years. At most one is current (also enforced by a partial unique index); a closed year is read-only until reopened. */
@Service
public class AcademicYearService {
    public static final String OPEN = "OPEN";
    public static final String CLOSED = "CLOSED";

    private final AcademicYearRepository years;
    private final AttendancePeriodService attendancePeriods;
    private final AuditService audit;
    private final Clock clock;

    public AcademicYearService(AcademicYearRepository years, AttendancePeriodService attendancePeriods, AuditService audit, Clock clock) {
        this.years = years;
        this.attendancePeriods = attendancePeriods;
        this.audit = audit;
        this.clock = clock;
    }

    public List<AcademicYear> list() { return years.findAllByOrderByStartDateDesc(); }

    @Transactional
    public AcademicYear create(String nameKm, LocalDate start, LocalDate end, boolean makeCurrent) {
        checkDates(start, end);
        String name = uniqueName(nameKm, null);
        if (makeCurrent) years.clearCurrent();
        AcademicYear y = new AcademicYear();
        y.setNameKm(name);
        y.setStartDate(start);
        y.setEndDate(end);
        y.setCurrent(makeCurrent);
        y.setCreatedAt(clock.instant());
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        attendancePeriods.createDefault(saved.getId());   // every year starts with one session, the whole day; the administrator edits from there
        audit.record("ACADEMIC_YEAR_CREATED", "academic_year", saved.getId(), "academic year created");
        return saved;
    }

    @Transactional
    public AcademicYear update(long id, String nameKm, LocalDate start, LocalDate end, long version) {
        AcademicYear y = find(id);
        if (CLOSED.equals(y.getStatus())) throw closed();
        if (y.getVersion() != version) throw ApiException.staleVersion();
        checkDates(start, end);
        y.setNameKm(uniqueName(nameKm, id));
        y.setStartDate(start);
        y.setEndDate(end);
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        audit.record("ACADEMIC_YEAR_UPDATED", "academic_year", id, "academic year updated");
        return saved;
    }

    /** Makes this the one current year (the previous current year stays open). */
    @Transactional
    public AcademicYear setCurrent(long id) {
        AcademicYear y = find(id);
        if (CLOSED.equals(y.getStatus())) throw closed();
        if (y.isCurrent()) return y;
        years.clearCurrent();
        y.setCurrent(true);
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        audit.record("ACADEMIC_YEAR_SET_CURRENT", "academic_year", id, "academic year set as current");
        return saved;
    }

    /** Closing a year also takes it out of "current": the school has no current year until another is chosen. */
    @Transactional
    public AcademicYear close(long id) {
        AcademicYear y = find(id);
        if (CLOSED.equals(y.getStatus())) return y;
        y.setStatus(CLOSED);
        y.setCurrent(false);
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        audit.record("ACADEMIC_YEAR_CLOSED", "academic_year", id, "academic year closed");
        return saved;
    }

    /** A closed year can be reopened (a mistaken click must not lock the records forever); it does not become current again by itself. */
    @Transactional
    public AcademicYear reopen(long id) {
        AcademicYear y = find(id);
        if (OPEN.equals(y.getStatus())) return y;
        y.setStatus(OPEN);
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        audit.record("ACADEMIC_YEAR_REOPENED", "academic_year", id, "academic year reopened");
        return saved;
    }

    private AcademicYear find(long id) { return years.findById(id).orElseThrow(ApiException::notFound); }

    private static void checkDates(LocalDate start, LocalDate end) {
        if (!end.isAfter(start)) throw ApiException.validation("endDate", "END_BEFORE_START");
    }

    /** The normalised name, required and not used by another year. */
    private String uniqueName(String raw, Long ownId) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        boolean taken = ownId == null ? years.existsByNameKm(name) : years.existsByNameKmAndIdNot(name, ownId);
        if (taken) throw ApiException.duplicate("nameKm");
        return name;
    }

    private static ApiException closed() { return new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED"); }
}
