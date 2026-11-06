package kh.school.sms.attendance;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kh.school.sms.common.Dates;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1")
public class AttendanceController {
    public record EntryItem(@NotNull Long enrollmentId, @NotBlank String status, @Size(max = 200) String remark) {}
    /** {@code periodId} is the session of the day; left out, it is the year's first enabled session. */
    public record SaveRequest(@NotNull Long classId, @NotBlank String date, Long periodId, @Size(max = 500) String note, @NotNull List<@Valid EntryItem> records) {}

    private final AttendanceService attendance;

    public AttendanceController(AttendanceService attendance) { this.attendance = attendance; }

    /** The class list of one day and session with whatever was recorded. Creates nothing; {@code periodId} defaults to the year's first enabled session. */
    @GetMapping("/attendance/sheet")
    public AttendanceService.Sheet sheet(@RequestParam long classId, @RequestParam String date, @RequestParam(required = false) Long periodId) {
        return attendance.sheet(classId, Dates.require(date, "date"), periodId);
    }

    @PutMapping("/attendance/sheet")
    public AttendanceService.Sheet save(@Valid @RequestBody SaveRequest r) {
        return attendance.save(r.classId(), Dates.require(r.date(), "date"), r.periodId(), r.note(),
                r.records().stream().map(e -> new AttendanceService.Entry(e.enrollmentId(), e.status(), e.remark())).toList());
    }

    @GetMapping("/attendance/sessions")
    public List<AttendanceService.SessionRow> sessions(@RequestParam long classId, @RequestParam String from, @RequestParam String to) {
        return attendance.sessions(classId, Dates.require(from, "from"), Dates.require(to, "to"));
    }

    /** One row per date of the class: the students in each day status and the sheets taken that day. */
    @GetMapping("/attendance/days")
    public List<AttendanceService.DayRow> days(@RequestParam long classId, @RequestParam String from, @RequestParam String to) {
        return attendance.days(classId, Dates.require(from, "from"), Dates.require(to, "to"));
    }

    @GetMapping("/attendance/summary")
    public List<AttendanceService.SummaryRow> summary(@RequestParam long classId, @RequestParam String from, @RequestParam String to) {
        return attendance.summary(classId, Dates.require(from, "from"), Dates.require(to, "to"));
    }

    @GetMapping("/students/{id}/attendance")
    public AttendanceService.StudentHistory studentHistory(@PathVariable long id, @RequestParam String from, @RequestParam String to) {
        return attendance.studentHistory(id, Dates.require(from, "from"), Dates.require(to, "to"));
    }
}
