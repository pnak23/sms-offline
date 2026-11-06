package kh.school.sms.academic;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
import kh.school.sms.common.ApiException;

import java.util.List;

/** Classes of an academic year, their subject teachers, and what a teacher teaches (shown on the teacher's profile). */
@RestController
@RequestMapping("/api/v1")
public class ClassController {
    public enum Shift { MORNING, AFTERNOON }

    public record ClassDto(long id, long academicYearId, String yearName, long gradeId, int gradeLevel, String gradeName, String nameKm,
                           int capacity, Long homeroomTeacherId, String homeroomTeacherName, String shift, int studentCount, long version) {}
    public record AssignmentDto(long subjectId, String subjectName, long teacherId, String teacherName) {}
    public record ClassDetailDto(ClassDto schoolClass, List<AssignmentDto> assignments) {}
    public record TeacherClassesDto(List<ClassDto> homeroomClasses, List<ClassQueries.TeacherAssignmentRow> assignments) {}

    public record ClassRequest(@NotNull Long academicYearId, @NotNull Long gradeId, @NotBlank @Size(max = 50) String nameKm,
                               @Min(1) @Max(200) Integer capacity, Long homeroomTeacherId, Shift shift) {}
    public record ClassUpdateRequest(@NotBlank @Size(max = 50) String nameKm, @Min(1) @Max(200) Integer capacity, Long homeroomTeacherId,
                                     Shift shift, long version) {}
    public record AssignmentItem(@NotNull Long subjectId, @NotNull Long teacherId) {}
    public record AssignmentsRequest(@NotNull List<@Valid AssignmentItem> assignments) {}

    private final ClassService classes;
    private final ClassQueries queries;

    public ClassController(ClassService classes, ClassQueries queries) {
        this.classes = classes;
        this.queries = queries;
    }

    static ClassDto dto(ClassQueries.ClassRow r) {
        return new ClassDto(r.id(), r.academicYearId(), r.yearName(), r.gradeId(), r.gradeLevel(), r.gradeName(), r.nameKm(), r.capacity(),
                r.homeroomTeacherId(), r.homeroomTeacherName(), r.shift(), r.studentCount(), r.version());
    }

    private ClassDetailDto detail(long id) {
        ClassDto c = dto(queries.find(id).orElseThrow(ApiException::notFound));
        List<AssignmentDto> a = queries.assignments(id).stream()
                .map(x -> new AssignmentDto(x.subjectId(), x.subjectName(), x.teacherId(), x.teacherName())).toList();
        return new ClassDetailDto(c, a);
    }

    private static String shiftName(Shift s) { return s == null ? null : s.name(); }

    /** Filters {@code yearId} and {@code gradeId}, both optional. */
    @GetMapping("/classes")
    public List<ClassDto> list(@RequestParam(required = false) Long yearId, @RequestParam(required = false) Long gradeId) {
        return queries.list(yearId, gradeId).stream().map(ClassController::dto).toList();
    }

    @GetMapping("/classes/{id}")
    public ClassDetailDto get(@PathVariable long id) { return detail(id); }

    @PostMapping("/classes")
    @ResponseStatus(HttpStatus.CREATED)
    public ClassDetailDto create(@Valid @RequestBody ClassRequest r) {
        SchoolClass c = classes.create(r.academicYearId(), r.gradeId(),
                new ClassService.Fields(r.nameKm(), r.capacity(), r.homeroomTeacherId(), shiftName(r.shift())));
        return detail(c.getId());
    }

    @PutMapping("/classes/{id}")
    public ClassDetailDto update(@PathVariable long id, @Valid @RequestBody ClassUpdateRequest r) {
        classes.update(id, new ClassService.Fields(r.nameKm(), r.capacity(), r.homeroomTeacherId(), shiftName(r.shift())), r.version());
        return detail(id);
    }

    @DeleteMapping("/classes/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        classes.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/classes/{id}/teachers")
    public ClassDetailDto setTeachers(@PathVariable long id, @Valid @RequestBody AssignmentsRequest r) {
        classes.setAssignments(id, r.assignments().stream().map(a -> new ClassService.Assignment(a.subjectId(), a.teacherId())).toList());
        return detail(id);
    }

    @GetMapping("/teachers/{id}/classes")
    public TeacherClassesDto teacherClasses(@PathVariable long id) {
        return new TeacherClassesDto(queries.homeroomOf(id).stream().map(ClassController::dto).toList(), queries.assignmentsOf(id));
    }
}
