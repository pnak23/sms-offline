package kh.school.sms.people;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import kh.school.sms.enrollment.EnrollmentQueries;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class StudentController {
    public record StudentDto(long id, String studentCode, String nameKm, String nameEn, String gender, LocalDate dateOfBirth, String placeOfBirth,
                             String address, String village, String commune, String district, String province, LocalDate enrollmentDate,
                             String status, String photoFile, String notes, long version) {}
    public record GuardianDto(long id, String nameKm, String relationship, String phone, boolean primary) {}
    /** {@code primary} and {@code allowDuplicate} are boxed on purpose: Jackson 3 refuses a missing primitive with 400, and "missing" means false. */
    public record GuardianItem(@NotBlank @Size(max = 100) String nameKm, @NotNull Relationship relationship, @Size(max = 50) String phone, Boolean primary) {}
    /** The profile: the student, guardians, every enrollment (newest first), and warnings from the save that produced it. */
    public record StudentDetailDto(StudentDto student, List<GuardianDto> guardians, List<EnrollmentQueries.HistoryRow> enrollments, List<String> warnings) {}

    public record StudentRequest(@NotBlank @Size(max = 100) String nameKm, @Size(max = 100) String nameEn, @NotNull Gender gender,
                                 @NotNull @Past LocalDate dateOfBirth, @Size(max = 200) String placeOfBirth, @Size(max = 500) String address,
                                 @Size(max = 100) String village, @Size(max = 100) String commune, @Size(max = 100) String district,
                                 @Size(max = 100) String province, LocalDate enrollmentDate, @Size(max = 2000) String notes,
                                 List<@Valid GuardianItem> guardians, Long classId, Boolean allowDuplicate) {
        StudentService.Fields fields() {
            return new StudentService.Fields(nameKm, nameEn, gender, dateOfBirth, placeOfBirth, address, village, commune, district, province, enrollmentDate, notes);
        }
    }

    public record StudentUpdateRequest(@NotBlank @Size(max = 100) String nameKm, @Size(max = 100) String nameEn, @NotNull Gender gender,
                                       @NotNull @Past LocalDate dateOfBirth, @Size(max = 200) String placeOfBirth, @Size(max = 500) String address,
                                       @Size(max = 100) String village, @Size(max = 100) String commune, @Size(max = 100) String district,
                                       @Size(max = 100) String province, LocalDate enrollmentDate, @Size(max = 2000) String notes,
                                       List<@Valid GuardianItem> guardians, Boolean allowDuplicate, long version) {
        StudentService.Fields fields() {
            return new StudentService.Fields(nameKm, nameEn, gender, dateOfBirth, placeOfBirth, address, village, commune, district, province, enrollmentDate, notes);
        }
    }

    public record StatusRequest(@NotBlank String status, long version, @Size(max = 200) String reason) {}

    /** The list filters of GET /students, plus the Khmer column titles and value names the UI wants in the file (see StudentExportService). */
    public record ExportRequest(String q, String gender, String status, Long yearId, Long gradeId, Long classId, Boolean unenrolled,
                                @NotNull @Size(max = 60) Map<@Size(max = 40) String, @Size(max = 200) String> labels) {}

    static final String XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    private final StudentService students;
    private final StudentQueries queries;
    private final EnrollmentQueries enrollmentQueries;
    private final StudentPhotoStorage photos;
    private final StudentExportService exports;

    public StudentController(StudentService students, StudentQueries queries, EnrollmentQueries enrollmentQueries, StudentPhotoStorage photos,
                             StudentExportService exports) {
        this.students = students;
        this.queries = queries;
        this.enrollmentQueries = enrollmentQueries;
        this.photos = photos;
        this.exports = exports;
    }

    static StudentDto dto(Student s) {
        return new StudentDto(s.getId(), s.getStudentCode(), s.getNameKm(), s.getNameEn(), s.getGender(), s.getDateOfBirth(), s.getPlaceOfBirth(),
                s.getAddress(), s.getVillage(), s.getCommune(), s.getDistrict(), s.getProvince(), s.getEnrollmentDate(), s.getStatus(), s.getPhotoFile(),
                s.getNotes(), s.getVersion());
    }

    private StudentDetailDto detail(Student s, List<String> warnings) {
        List<GuardianDto> guardians = queries.guardians(s.getId()).stream()
                .map(g -> new GuardianDto(g.id(), g.nameKm(), g.relationship(), g.phone(), g.primary())).toList();
        return new StudentDetailDto(dto(s), guardians, enrollmentQueries.historyOf(s.getId()), warnings);
    }

    private static List<StudentService.GuardianFields> guardians(List<GuardianItem> items) {
        return items == null ? List.of() : items.stream()
                .map(g -> new StudentService.GuardianFields(g.nameKm(), g.relationship(), g.phone(), Boolean.TRUE.equals(g.primary()))).toList();
    }

    /**
     * The searchable student list. {@code q}: Khmer or English name, student code, guardian name or phone. {@code yearId}: whose
     * class to show (default: the current year). Class, grade and "not enrolled" filters apply to that year. Sorted by the client.
     */
    @GetMapping("/students")
    public List<StudentQueries.StudentRow> list(@RequestParam(required = false) String q, @RequestParam(required = false) String gender,
                                                @RequestParam(required = false) String status, @RequestParam(required = false) Long yearId,
                                                @RequestParam(required = false) Long gradeId, @RequestParam(required = false) Long classId,
                                                @RequestParam(defaultValue = "false") boolean unenrolled) {
        return students.search(q, gender, status, yearId, gradeId, classId, unenrolled);
    }

    /** The same list as an .xlsx file (the UI saves the bytes through the desktop bridge). A POST only because the labels travel in the body. */
    @PostMapping("/students/export")
    public ResponseEntity<byte[]> export(@Valid @RequestBody ExportRequest r) {
        byte[] file = exports.export(r.q(), r.gender(), r.status(), r.yearId(), r.gradeId(), r.classId(), Boolean.TRUE.equals(r.unenrolled()), r.labels());
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(XLSX)).cacheControl(CacheControl.noStore()).body(file);
    }

    @GetMapping("/students/{id}")
    public StudentDetailDto get(@PathVariable long id) { return detail(students.get(id), List.of()); }

    @PostMapping("/students")
    @ResponseStatus(HttpStatus.CREATED)
    public StudentDetailDto create(@Valid @RequestBody StudentRequest r) {
        StudentService.Saved saved = students.create(r.fields(), guardians(r.guardians()), r.classId(), Boolean.TRUE.equals(r.allowDuplicate()));
        return detail(saved.student(), saved.warnings());
    }

    @PutMapping("/students/{id}")
    public StudentDetailDto update(@PathVariable long id, @Valid @RequestBody StudentUpdateRequest r) {
        return detail(students.update(id, r.fields(), guardians(r.guardians()), r.version(), Boolean.TRUE.equals(r.allowDuplicate())), List.of());
    }

    @PutMapping("/students/{id}/status")
    public StudentDetailDto setStatus(@PathVariable long id, @Valid @RequestBody StatusRequest r) {
        return detail(students.setStatus(id, r.status(), r.version(), r.reason()), List.of());
    }

    @DeleteMapping("/students/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        students.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/students/{id}/photo")
    public StudentDetailDto uploadPhoto(@PathVariable long id, @RequestPart("file") MultipartFile file) {
        if (file.isEmpty()) throw kh.school.sms.common.ApiException.validation("file", "REQUIRED");
        return detail(students.setPhoto(id, file), List.of());
    }

    @DeleteMapping("/students/{id}/photo")
    public StudentDetailDto removePhoto(@PathVariable long id) { return detail(students.removePhoto(id), List.of()); }

    /** The image is fetched with the session token and shown through a blob URL (an <img src> cannot send the token). */
    @GetMapping("/files/students/{name}")
    public ResponseEntity<byte[]> photoFile(@PathVariable String name) throws IOException {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noCache()).body(Files.readAllBytes(photos.resolve(name)));
    }
}
