package kh.school.sms.people;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
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

import java.time.LocalDate;
import java.util.List;

@RestController
@RequestMapping("/api/v1/teachers")
public class TeacherController {
    public record TeacherDto(long id, String teacherCode, String nameKm, String gender, String phone, String address,
                             String specialization, LocalDate employmentDate, String status, long version) {}

    public record TeacherRequest(@NotBlank @Size(max = 100) String nameKm, @NotNull Gender gender, @Size(max = 50) String phone,
                                 @Size(max = 500) String address, @Size(max = 150) String specialization, LocalDate employmentDate) {
        TeacherService.Fields fields() { return new TeacherService.Fields(nameKm, gender, phone, address, specialization, employmentDate); }
    }

    public record TeacherUpdateRequest(@NotBlank @Size(max = 100) String nameKm, @NotNull Gender gender, @Size(max = 50) String phone,
                                       @Size(max = 500) String address, @Size(max = 150) String specialization, LocalDate employmentDate,
                                       long version) {
        TeacherService.Fields fields() { return new TeacherService.Fields(nameKm, gender, phone, address, specialization, employmentDate); }
    }

    public record ActiveRequest(boolean active, long version) {}

    private final TeacherService teachers;

    public TeacherController(TeacherService teachers) { this.teachers = teachers; }

    static TeacherDto dto(Teacher t) {
        return new TeacherDto(t.getId(), t.getTeacherCode(), t.getNameKm(), t.getGender(), t.getPhone(), t.getAddress(),
                t.getSpecialization(), t.getEmploymentDate(), t.getStatus(), t.getVersion());
    }

    /** Filters: {@code q} (name, code, phone, specialisation) and {@code status} (ACTIVE / INACTIVE). Sorted by the client (Khmer collation). */
    @GetMapping
    public List<TeacherDto> list(@RequestParam(required = false) String q, @RequestParam(required = false) String status) {
        return teachers.search(q, status).stream().map(TeacherController::dto).toList();
    }

    @GetMapping("/{id}")
    public TeacherDto get(@PathVariable long id) { return dto(teachers.get(id)); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TeacherDto create(@Valid @RequestBody TeacherRequest r) { return dto(teachers.create(r.fields())); }

    @PutMapping("/{id}")
    public TeacherDto update(@PathVariable long id, @Valid @RequestBody TeacherUpdateRequest r) {
        return dto(teachers.update(id, r.fields(), r.version()));
    }

    @PutMapping("/{id}/active")
    public TeacherDto setActive(@PathVariable long id, @RequestBody ActiveRequest r) {
        return dto(teachers.setActive(id, r.active(), r.version()));
    }
}
