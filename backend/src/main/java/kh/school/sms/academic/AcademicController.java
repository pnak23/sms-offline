package kh.school.sms.academic;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/** The minimum the setup wizard needs (step 5). Classes, students, enrollment etc. arrive in Phase 2. */
@RestController
@RequestMapping("/api/v1")
public class AcademicController {
    public record GradeDto(long id, int level, String nameKm) {}
    public record YearDto(long id, String nameKm, LocalDate startDate, LocalDate endDate, boolean current, String status, long version) {}
    public record YearRequest(@NotBlank @Size(max = 50) String nameKm, @NotNull LocalDate startDate, @NotNull LocalDate endDate, boolean makeCurrent) {}
    public record SubjectDto(long id, String code, String nameKm, String nameEn, boolean active, long version) {}
    public record ActiveRequest(boolean active, long version) {}

    private final AcademicYearRepository years;
    private final GradeRepository grades;
    private final SubjectRepository subjects;
    private final AuditService audit;
    private final Clock clock;

    public AcademicController(AcademicYearRepository years, GradeRepository grades,
                              SubjectRepository subjects, AuditService audit, Clock clock) {
        this.years = years;
        this.grades = grades;
        this.subjects = subjects;
        this.audit = audit;
        this.clock = clock;
    }

    private static YearDto dto(AcademicYear y) {
        return new YearDto(y.getId(), y.getNameKm(), y.getStartDate(), y.getEndDate(), y.isCurrent(), y.getStatus(), y.getVersion());
    }

    private static SubjectDto dto(Subject s) {
        return new SubjectDto(s.getId(), s.getCode(), s.getNameKm(), s.getNameEn(), s.isActive(), s.getVersion());
    }

    @GetMapping("/grades")
    public List<GradeDto> grades() {
        return grades.findAllByOrderByLevelAsc().stream().map(g -> new GradeDto(g.getId(), g.getLevel(), g.getNameKm())).toList();
    }

    @GetMapping("/academic-years")
    public List<YearDto> years() { return years.findAllByOrderByStartDateDesc().stream().map(AcademicController::dto).toList(); }

    @PostMapping("/academic-years")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public YearDto createYear(@Valid @RequestBody YearRequest r) {
        if (!r.endDate().isAfter(r.startDate())) throw ApiException.validation("endDate", "END_BEFORE_START");
        String name = KhmerText.name(r.nameKm());
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        if (r.makeCurrent()) years.clearCurrent();
        AcademicYear y = new AcademicYear();
        y.setNameKm(name);
        y.setStartDate(r.startDate());
        y.setEndDate(r.endDate());
        y.setCurrent(r.makeCurrent());
        y.setCreatedAt(clock.instant());
        y.setUpdatedAt(clock.instant());
        AcademicYear saved = years.saveAndFlush(y);
        audit.record("ACADEMIC_YEAR_CREATED", "academic_year", saved.getId(), "academic year created");
        return dto(saved);
    }

    @GetMapping("/subjects")
    public List<SubjectDto> subjects() { return subjects.findAllByOrderBySortOrderAscIdAsc().stream().map(AcademicController::dto).toList(); }

    @PutMapping("/subjects/{id}/active")
    @Transactional
    public SubjectDto setActive(@PathVariable long id, @RequestBody ActiveRequest r) {
        Subject s = subjects.findById(id).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND"));
        if (s.getVersion() != r.version()) throw new ApiException(HttpStatus.CONFLICT, "OPTIMISTIC_LOCK");
        s.setActive(r.active());
        s.setUpdatedAt(clock.instant());
        Subject saved = subjects.saveAndFlush(s);
        audit.record("SUBJECT_ACTIVE_CHANGED", "subject", saved.getId(), r.active() ? "subject activated" : "subject deactivated");
        return dto(saved);
    }
}
