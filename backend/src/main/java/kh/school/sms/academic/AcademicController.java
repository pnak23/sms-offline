package kh.school.sms.academic;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

/** Academic years, grades (and the subjects each studies) and subjects: Settings -> Academic and wizard step 5. */
@RestController
@RequestMapping("/api/v1")
public class AcademicController {
    public record GradeDto(long id, int level, String nameKm, List<Long> subjectIds) {}
    public record GradeSubjectsRequest(@NotNull List<Long> subjectIds) {}

    public record YearDto(long id, String nameKm, LocalDate startDate, LocalDate endDate, boolean current, String status, long version) {}
    public record YearRequest(@NotBlank @Size(max = 50) String nameKm, @NotNull LocalDate startDate, @NotNull LocalDate endDate, boolean makeCurrent) {}
    public record YearUpdateRequest(@NotBlank @Size(max = 50) String nameKm, @NotNull LocalDate startDate, @NotNull LocalDate endDate, long version) {}

    /** {@code parentId} is null for a main subject and the main subject's id for a sub-subject. */
    public record SubjectDto(long id, String code, String nameKm, String nameEn, Long parentId, boolean active, long version, boolean inUse) {}
    public record SubjectRequest(@NotBlank @Size(max = 100) String nameKm, @Size(max = 100) String nameEn, Long parentId) {}
    public record SubjectUpdateRequest(@NotBlank @Size(max = 100) String nameKm, @Size(max = 100) String nameEn, long version) {}
    public record ActiveRequest(boolean active, long version) {}

    private final AcademicYearService years;
    private final SubjectService subjects;
    private final GradeService grades;

    public AcademicController(AcademicYearService years, SubjectService subjects, GradeService grades) {
        this.years = years;
        this.subjects = subjects;
        this.grades = grades;
    }

    private static GradeDto dto(GradeService.GradeView v) {
        return new GradeDto(v.grade().getId(), v.grade().getLevel(), v.grade().getNameKm(), v.subjectIds());
    }

    private static YearDto dto(AcademicYear y) {
        return new YearDto(y.getId(), y.getNameKm(), y.getStartDate(), y.getEndDate(), y.isCurrent(), y.getStatus(), y.getVersion());
    }

    /** {@code inUse}: an examination, a class's teachers or homework refer to it, so it can be switched off but not removed. */
    private static SubjectDto dto(Subject s, boolean inUse) {
        return new SubjectDto(s.getId(), s.getCode(), s.getNameKm(), s.getNameEn(), s.getParentId(), s.isActive(), s.getVersion(), inUse);
    }

    private SubjectDto dto(Subject s) { return dto(s, subjects.isUsed(s.getId())); }

    // ---- grades ----------------------------------------------------------------------------------------------

    @GetMapping("/grades")
    public List<GradeDto> grades() { return grades.list().stream().map(AcademicController::dto).toList(); }

    @PutMapping("/grades/{id}/subjects")
    public GradeDto setGradeSubjects(@PathVariable long id, @Valid @RequestBody GradeSubjectsRequest r) {
        return dto(grades.setSubjects(id, r.subjectIds()));
    }

    // ---- academic years --------------------------------------------------------------------------------------

    @GetMapping("/academic-years")
    public List<YearDto> years() { return years.list().stream().map(AcademicController::dto).toList(); }

    @PostMapping("/academic-years")
    @ResponseStatus(HttpStatus.CREATED)
    public YearDto createYear(@Valid @RequestBody YearRequest r) {
        return dto(years.create(r.nameKm(), r.startDate(), r.endDate(), r.makeCurrent()));
    }

    @PutMapping("/academic-years/{id}")
    public YearDto updateYear(@PathVariable long id, @Valid @RequestBody YearUpdateRequest r) {
        return dto(years.update(id, r.nameKm(), r.startDate(), r.endDate(), r.version()));
    }

    @PostMapping("/academic-years/{id}/set-current")
    public YearDto setCurrentYear(@PathVariable long id) { return dto(years.setCurrent(id)); }

    @PostMapping("/academic-years/{id}/close")
    public YearDto closeYear(@PathVariable long id) { return dto(years.close(id)); }

    @PostMapping("/academic-years/{id}/reopen")
    public YearDto reopenYear(@PathVariable long id) { return dto(years.reopen(id)); }

    // ---- subjects --------------------------------------------------------------------------------------------

    @GetMapping("/subjects")
    public List<SubjectDto> subjects() {
        java.util.Set<Long> used = subjects.usedIds();
        return subjects.list().stream().map((s) -> dto(s, used.contains(s.getId()))).toList();
    }

    @PostMapping("/subjects")
    @ResponseStatus(HttpStatus.CREATED)
    public SubjectDto createSubject(@Valid @RequestBody SubjectRequest r) { return dto(subjects.create(r.nameKm(), r.nameEn(), r.parentId())); }

    /** Only a subject nothing uses, and not one that still has sub-subjects (409 SUBJECT_IN_USE / SUBJECT_HAS_SUB_SUBJECTS). */
    @DeleteMapping("/subjects/{id}")
    public ResponseEntity<Void> removeSubject(@PathVariable long id) {
        subjects.remove(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/subjects/{id}")
    public SubjectDto updateSubject(@PathVariable long id, @Valid @RequestBody SubjectUpdateRequest r) {
        return dto(subjects.update(id, r.nameKm(), r.nameEn(), r.version()));
    }

    @PutMapping("/subjects/{id}/active")
    public SubjectDto setSubjectActive(@PathVariable long id, @RequestBody ActiveRequest r) {
        return dto(subjects.setActive(id, r.active(), r.version()));
    }
}
