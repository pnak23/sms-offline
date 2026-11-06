package kh.school.sms.dashboard;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kh.school.sms.common.Dates;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

@RestController
@RequestMapping("/api/v1/school-events")
public class SchoolEventController {
    public record EventRequest(@NotBlank @Size(max = 150) String titleKm, @NotBlank String startDate, String endDate, @Size(max = 500) String note) {}
    public record EventUpdateRequest(@NotBlank @Size(max = 150) String titleKm, @NotBlank String startDate, String endDate, @Size(max = 500) String note, long version) {}

    private final SchoolEventService events;

    public SchoolEventController(SchoolEventService events) { this.events = events; }

    /** {@code from} / {@code to} (optional) keep the events that overlap that period; {@code from=today} is "upcoming". */
    @GetMapping
    public List<SchoolEventService.Event> list(@RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                               @RequestParam(defaultValue = "200") int limit) {
        return events.list(Dates.optional(from, "from"), Dates.optional(to, "to"), Math.max(1, Math.min(limit, 500)));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SchoolEventService.Event create(@Valid @RequestBody EventRequest r) {
        return events.create(new SchoolEventService.Input(r.titleKm(), Dates.require(r.startDate(), "startDate"), Dates.optional(r.endDate(), "endDate"), r.note()));
    }

    @PutMapping("/{id}")
    public SchoolEventService.Event update(@PathVariable long id, @Valid @RequestBody EventUpdateRequest r) {
        return events.update(id, new SchoolEventService.Input(r.titleKm(), Dates.require(r.startDate(), "startDate"), Dates.optional(r.endDate(), "endDate"), r.note()), r.version());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        events.delete(id);
        return ResponseEntity.noContent().build();
    }
}
