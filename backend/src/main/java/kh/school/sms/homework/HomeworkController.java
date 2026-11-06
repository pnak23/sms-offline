package kh.school.sms.homework;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kh.school.sms.common.Dates;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/homework")
public class HomeworkController {
    /** {@code maxScore} null = a homework without marks. */
    public record HomeworkRequest(@NotNull Long classId, @NotNull Long subjectId, @NotBlank @Size(max = 200) String title, @Size(max = 2000) String description,
                                  @NotNull LocalDate assignedDate, @NotNull LocalDate dueDate, @Size(max = 500) String remark, BigDecimal maxScore) {
        HomeworkService.Input input() { return new HomeworkService.Input(classId, subjectId, title, description, assignedDate, dueDate, remark, maxScore); }
    }

    public record HomeworkUpdateRequest(@NotNull Long classId, @NotNull Long subjectId, @NotBlank @Size(max = 200) String title, @Size(max = 2000) String description,
                                        @NotNull LocalDate assignedDate, @NotNull LocalDate dueDate, @Size(max = 500) String remark, BigDecimal maxScore, long version) {
        HomeworkService.Input input() { return new HomeworkService.Input(classId, subjectId, title, description, assignedDate, dueDate, remark, maxScore); }
    }

    public record StatusRequest(@NotBlank String status, long version) {}

    /** One student's record of one assignment: a status (or none), a mark (only with SUBMITTED or LATE, and only when the homework has a maximum), a remark. Boxed and nullable on purpose. */
    public record RecordRequest(@NotNull Long enrollmentId, String status, BigDecimal score, @Size(max = 500) String remark) {
        HomeworkService.RecordEntry entry() { return new HomeworkService.RecordEntry(enrollmentId, status == null || status.isBlank() ? null : status, score, remark); }
    }

    public record RecordsRequest(@NotNull @Size(max = HomeworkService.MAX_ENTRIES) List<@Valid RecordRequest> records) {}

    private final HomeworkService homework;

    public HomeworkController(HomeworkService homework) { this.homework = homework; }

    /** Filters {@code classId}, {@code status}, {@code subjectId} (a main subject also matches its sub-subjects) and {@code from}/{@code to} (limits the due date), all optional. */
    @GetMapping
    public List<HomeworkService.Item> list(@RequestParam(required = false) Long classId, @RequestParam(required = false) String status,
                                           @RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                           @RequestParam(required = false) Long subjectId) {
        return homework.list(classId, status == null || status.isBlank() ? null : status, Dates.optional(from, "from"), Dates.optional(to, "to"), subjectId);
    }

    @GetMapping("/{id}")
    public HomeworkService.Item get(@PathVariable long id) { return homework.get(id); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public HomeworkService.Item create(@Valid @RequestBody HomeworkRequest r) { return homework.create(r.input()); }

    @PutMapping("/{id}")
    public HomeworkService.Item update(@PathVariable long id, @Valid @RequestBody HomeworkUpdateRequest r) { return homework.update(id, r.input(), r.version()); }

    @PutMapping("/{id}/status")
    public HomeworkService.Item setStatus(@PathVariable long id, @Valid @RequestBody StatusRequest r) { return homework.setStatus(id, r.status(), r.version()); }

    /** The students of the class with their record of this assignment (a student without one has no status, no mark and no remark). */
    @GetMapping("/{id}/records")
    public HomeworkService.RecordSheet records(@PathVariable long id) { return homework.records(id); }

    /** Saves the students' records of this assignment; an entry with no status, no mark and no remark clears the record. */
    @PutMapping("/{id}/records")
    public HomeworkService.RecordSheet saveRecords(@PathVariable long id, @Valid @RequestBody RecordsRequest r) {
        return homework.saveRecords(id, r.records().stream().map(RecordRequest::entry).toList());
    }

    /** Per student of a class over the assignments due in a period (optionally about one subject): counts by status and the marks earned out of those possible. */
    @GetMapping("/summary")
    public List<HomeworkService.SummaryRow> summary(@RequestParam long classId, @RequestParam(required = false) String from, @RequestParam(required = false) String to,
                                                    @RequestParam(required = false) Long subjectId) {
        return homework.summary(classId, Dates.optional(from, "from"), Dates.optional(to, "to"), subjectId);
    }

    /** The history of one student's homework: every assignment of the classes they were in, newest first, with their own record or none. */
    @GetMapping("/by-student/{studentId}")
    public List<HomeworkService.HistoryRow> historyOf(@PathVariable long studentId) { return homework.historyOf(studentId); }
}
