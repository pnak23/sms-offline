package kh.school.sms.timetable;

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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * The weekly timetable: Settings &gt; Timetable (school days, time slots, copying a year) and the Timetable page (a class's grid, a teacher's week, a student's week).
 * Nothing here is required by any other part of the program, and nothing leaves the PC.
 */
@RestController
@RequestMapping("/api/v1/timetable")
public class TimetableController {
    public record DaysRequest(@NotNull Long yearId, @NotNull List<Integer> days) {}
    public record SlotCreateRequest(@NotNull Long yearId, @NotBlank @Size(max = 50) String nameKm, @NotBlank @Size(max = 5) String startTime, @NotBlank @Size(max = 5) String endTime, Boolean breakSlot) {}
    public record SlotUpdateRequest(@NotBlank @Size(max = 50) String nameKm, @NotBlank @Size(max = 5) String startTime, @NotBlank @Size(max = 5) String endTime, Boolean breakSlot, long version) {}
    public record CellRequest(Integer dayOfWeek, Long slotId, Long subjectId, Long teacherId) {}
    /** {@code preview} is true unless the request says false: a request that forgets the flag changes nothing. */
    public record CopyClassRequest(Boolean replace, Boolean preview) {}
    public record CopyYearRequest(Boolean preview) {}

    private final TimetableSettingsService settings;
    private final TimetableService timetable;
    private final TimetableCopyService copies;

    public TimetableController(TimetableSettingsService settings, TimetableService timetable, TimetableCopyService copies) {
        this.settings = settings;
        this.timetable = timetable;
        this.copies = copies;
    }

    // ---- settings -------------------------------------------------------------------------------------------------------

    @GetMapping("/settings")
    public TimetableSettingsService.Settings settings(@RequestParam long yearId) { return settings.settings(yearId); }

    @PutMapping("/days")
    public TimetableSettingsService.Settings setDays(@Valid @RequestBody DaysRequest r) { return settings.setDays(r.yearId(), r.days()); }

    @PostMapping("/slots")
    @ResponseStatus(HttpStatus.CREATED)
    public TimetableSettingsService.Slot createSlot(@Valid @RequestBody SlotCreateRequest r) {
        return settings.create(r.yearId(), r.nameKm(), r.startTime(), r.endTime(), Boolean.TRUE.equals(r.breakSlot()));
    }

    @PutMapping("/slots/{id}")
    public TimetableSettingsService.Slot updateSlot(@PathVariable long id, @Valid @RequestBody SlotUpdateRequest r) {
        return settings.update(id, r.nameKm(), r.startTime(), r.endTime(), Boolean.TRUE.equals(r.breakSlot()), r.version());
    }

    @DeleteMapping("/slots/{id}")
    public ResponseEntity<Void> deleteSlot(@PathVariable long id) {
        settings.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/years/{toYearId}/copy-from/{fromYearId}")
    public TimetableCopyService.CopyResult copyYear(@PathVariable long toYearId, @PathVariable long fromYearId, @RequestBody(required = false) CopyYearRequest r) {
        return copies.copyYear(toYearId, fromYearId, r == null || r.preview() == null || r.preview());
    }

    // ---- a class ----------------------------------------------------------------------------------------------------------

    @GetMapping("/classes/{classId}")
    public TimetableService.ClassView classView(@PathVariable long classId) { return timetable.classView(classId); }

    @PutMapping("/classes/{classId}/cell")
    public TimetableService.Lesson setCell(@PathVariable long classId, @RequestBody CellRequest r) {
        return timetable.setCell(classId, r.dayOfWeek(), r.slotId(), r.subjectId(), r.teacherId());
    }

    @DeleteMapping("/classes/{classId}/cell")
    public ResponseEntity<Void> clearCell(@PathVariable long classId, @RequestParam int dayOfWeek, @RequestParam long slotId) {
        timetable.clearCell(classId, dayOfWeek, slotId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/classes/{classId}/copy-from/{sourceClassId}")
    public TimetableCopyService.CopyResult copyClass(@PathVariable long classId, @PathVariable long sourceClassId, @RequestBody(required = false) CopyClassRequest r) {
        boolean replace = r != null && Boolean.TRUE.equals(r.replace());
        return copies.copyClass(classId, sourceClassId, replace, r == null || r.preview() == null || r.preview());
    }

    // ---- a teacher and a student (read-only) ---------------------------------------------------------------------------------

    @GetMapping("/teachers/{teacherId}")
    public TimetableService.TeacherView teacherView(@PathVariable long teacherId, @RequestParam long yearId) { return timetable.teacherView(teacherId, yearId); }

    @GetMapping("/teacher-loads")
    public List<TimetableService.TeacherLoad> teacherLoads(@RequestParam long yearId) { return timetable.teacherLoads(yearId); }

    @GetMapping("/students/{studentId}")
    public TimetableService.StudentView studentView(@PathVariable long studentId, @RequestParam(required = false) Long yearId) { return timetable.studentView(studentId, yearId); }
}
