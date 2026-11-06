package kh.school.sms.attendance;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kh.school.sms.security.AuthUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** Settings > Attendance sessions: the sessions of the school day, per academic year. */
@RestController
@RequestMapping("/api/v1/attendance-periods")
public class AttendancePeriodController {
    public record CreateRequest(@NotNull Long academicYearId, @NotBlank @Size(max = 50) String nameKm, @Size(max = 5) String startTime, @Size(max = 5) String endTime) {}
    public record UpdateRequest(@NotBlank @Size(max = 50) String nameKm, @Size(max = 5) String startTime, @Size(max = 5) String endTime, long version) {}
    public record EnabledRequest(boolean enabled, long version) {}
    public record OrderRequest(@NotNull Long academicYearId, @NotNull List<Long> ids) {}
    public record CopyRequest(@NotNull Long fromYearId, @NotNull Long toYearId) {}

    private final AttendancePeriodService periods;

    public AttendancePeriodController(AttendancePeriodService periods) { this.periods = periods; }

    @GetMapping
    public List<AttendancePeriodService.Period> list(@RequestParam long academicYearId) { return periods.list(academicYearId); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AttendancePeriodService.Period create(@Valid @RequestBody CreateRequest r) {
        return periods.create(r.academicYearId(), r.nameKm(), r.startTime(), r.endTime());
    }

    @PutMapping("/{id}")
    public AttendancePeriodService.Period update(@PathVariable long id, @Valid @RequestBody UpdateRequest r) {
        return periods.update(id, r.nameKm(), r.startTime(), r.endTime(), r.version());
    }

    @PutMapping("/{id}/enabled")
    public AttendancePeriodService.Period setEnabled(@PathVariable long id, @RequestBody EnabledRequest r) {
        return periods.setEnabled(id, r.enabled(), r.version());
    }

    @PostMapping("/{id}/confirm")
    public AttendancePeriodService.Period confirm(@PathVariable long id, Authentication a) {
        return periods.confirm(id, (AuthUser) a.getPrincipal());
    }

    @PutMapping("/order")
    public List<AttendancePeriodService.Period> reorder(@Valid @RequestBody OrderRequest r) {
        return periods.reorder(r.academicYearId(), r.ids());
    }

    @PostMapping("/copy")
    public List<AttendancePeriodService.Period> copy(@Valid @RequestBody CopyRequest r) {
        return periods.copyFromYear(r.fromYearId(), r.toYearId());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        periods.delete(id);
        return ResponseEntity.noContent().build();
    }
}
