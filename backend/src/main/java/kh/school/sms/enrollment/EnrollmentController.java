package kh.school.sms.enrollment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class EnrollmentController {
    public record EnrollmentDto(long id, long studentId, long academicYearId, long classId, String status, LocalDate enrolledOn, LocalDate leftOn,
                                String endReason, long version) {}
    /** The enrollment plus warnings (e.g. CLASS_OVER_CAPACITY: allowed, but the user should know). */
    public record EnrollmentResultDto(EnrollmentDto enrollment, List<String> warnings) {}

    public record EnrollRequest(@NotNull Long studentId, @NotNull Long classId, LocalDate enrolledOn) {}
    public record TransferRequest(@NotNull Long classId, LocalDate date, @Size(max = 200) String reason) {}
    public record LeaveRequest(LocalDate date, @Size(max = 200) String reason) {}
    public record DecisionItem(@NotNull Long enrollmentId, @NotNull String outcome, Long toClassId) {}
    public record PromoteRequest(@NotNull Long fromYearId, @NotNull Long toYearId, @NotNull List<@Valid DecisionItem> decisions) {}

    private final EnrollmentService service;
    private final EnrollmentQueries queries;

    public EnrollmentController(EnrollmentService service, EnrollmentQueries queries) {
        this.service = service;
        this.queries = queries;
    }

    static EnrollmentDto dto(Enrollment e) {
        return new EnrollmentDto(e.getId(), e.getStudentId(), e.getAcademicYearId(), e.getClassId(), e.getStatus(), e.getEnrolledOn(), e.getLeftOn(),
                e.getEndReason(), e.getVersion());
    }

    private static EnrollmentResultDto result(EnrollmentService.Result r) { return new EnrollmentResultDto(dto(r.enrollment()), r.warnings()); }

    @PostMapping("/enrollments")
    @ResponseStatus(HttpStatus.CREATED)
    public EnrollmentResultDto enroll(@Valid @RequestBody EnrollRequest r) { return result(service.enroll(r.studentId(), r.classId(), r.enrolledOn())); }

    @PostMapping("/enrollments/{id}/transfer")
    public EnrollmentResultDto transfer(@PathVariable long id, @Valid @RequestBody TransferRequest r) {
        return result(service.transfer(id, r.classId(), r.date(), r.reason()));
    }

    @PostMapping("/enrollments/{id}/leave")
    public EnrollmentDto leave(@PathVariable long id, @Valid @RequestBody LeaveRequest r) { return dto(service.leave(id, r.date(), r.reason())); }

    /** {@code dryRun} defaults to TRUE: a preview. Nothing is written unless the caller says {@code dryRun=false}. */
    @PostMapping("/enrollments/promote")
    public EnrollmentService.PromotionSummary promote(@RequestParam(defaultValue = "true") boolean dryRun, @Valid @RequestBody PromoteRequest r) {
        return service.promote(r.fromYearId(), r.toYearId(),
                r.decisions().stream().map(d -> new EnrollmentService.Decision(d.enrollmentId(), d.outcome(), d.toClassId())).toList(), dryRun);
    }

    /** The students of a class (those in it now; {@code includeEnded} adds everyone who was ever enrolled in it). */
    @GetMapping("/classes/{id}/students")
    public List<EnrollmentQueries.RosterRow> roster(@PathVariable long id, @RequestParam(defaultValue = "false") boolean includeEnded) {
        return queries.roster(id, includeEnded);
    }
}
