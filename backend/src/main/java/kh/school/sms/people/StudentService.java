package kh.school.sms.people;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.common.SearchText;
import kh.school.sms.common.SequenceService;
import kh.school.sms.common.SqliteConstraints;
import kh.school.sms.enrollment.EnrollmentService;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Students. Never permanently deleted once they have history (docs §5.1): they are marked inactive or graduated, and
 * the foreign keys refuse a delete even if this check were bypassed. Possible duplicates (same Khmer name and date of
 * birth) are a warning the user confirms, not a block: twins and common names are real.
 */
@Service
public class StudentService {
    public record Fields(String nameKm, String nameEn, Gender gender, LocalDate dateOfBirth, String placeOfBirth, String address, String village,
                         String commune, String district, String province, LocalDate enrollmentDate, String notes) {}

    public record GuardianFields(String nameKm, Relationship relationship, String phone, boolean primary) {}

    /** The saved student plus warnings for the UI (e.g. the class is now over capacity). */
    public record Saved(Student student, List<String> warnings) {}

    static final int MAX_GUARDIANS = 5;
    static final List<String> STATUSES = List.of("ACTIVE", "INACTIVE", "GRADUATED");

    private final StudentRepository students;
    private final StudentQueries queries;
    private final EnrollmentService enrollments;
    private final StudentPhotoStorage photos;
    private final SequenceService sequences;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public StudentService(StudentRepository students, StudentQueries queries, EnrollmentService enrollments, StudentPhotoStorage photos,
                          SequenceService sequences, JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.students = students;
        this.queries = queries;
        this.enrollments = enrollments;
        this.photos = photos;
        this.sequences = sequences;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    /** @param yearId whose class to show; null = the current academic year (none = nobody shows a class) */
    public List<StudentQueries.StudentRow> search(String q, String gender, String status, Long yearId, Long gradeId, Long classId, boolean unenrolled) {
        Long year = yearId != null ? yearId : currentYearId();
        return queries.search(new StudentQueries.Filters(SearchText.contains(q), blankToNull(gender), blankToNull(status), year, gradeId, classId, unenrolled));
    }

    public Student get(long id) { return students.findById(id).orElseThrow(ApiException::notFound); }

    public Long currentYearId() {
        List<Long> ids = jdbc.queryForList("SELECT id FROM academic_years WHERE is_current = 1", Long.class);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** @param classId optional: enrol into this class (of an open year) in the same transaction */
    @Transactional
    public Saved create(Fields f, List<GuardianFields> guardians, Long classId, boolean allowDuplicate) {
        Student s = new Student();
        apply(s, f);
        checkDuplicate(s, null, allowDuplicate);
        LocalDate enrolled = f.enrollmentDate() == null ? today() : f.enrollmentDate();
        s.setEnrollmentDate(enrolled);
        s.setStudentCode(String.format("%d-%04d", enrolled.getYear(), sequences.next("student", enrolled.getYear())));
        s.setCreatedAt(clock.instant());
        s.setUpdatedAt(clock.instant());
        Student saved = students.saveAndFlush(s);
        replaceGuardians(saved.getId(), guardians);
        List<String> warnings = classId == null ? List.of() : enrollments.enroll(saved.getId(), classId, enrolled).warnings();
        audit.record("STUDENT_CREATED", "student", saved.getId(), "student registered");
        return new Saved(saved, warnings);
    }

    @Transactional
    public Student update(long id, Fields f, List<GuardianFields> guardians, long version, boolean allowDuplicate) {
        Student s = get(id);
        if (s.getVersion() != version) throw ApiException.staleVersion();
        apply(s, f);
        checkDuplicate(s, id, allowDuplicate);
        if (f.enrollmentDate() != null) s.setEnrollmentDate(f.enrollmentDate());
        s.setUpdatedAt(clock.instant());
        Student saved = students.saveAndFlush(s);
        replaceGuardians(id, guardians);
        audit.record("STUDENT_UPDATED", "student", id, "student updated");
        return saved;
    }

    /** ACTIVE / INACTIVE / GRADUATED. Leaving or graduating ends the student's current enrollment with that outcome. */
    @Transactional
    public Student setStatus(long id, String status, long version, String reason) {
        if (!STATUSES.contains(status)) throw ApiException.validation("status", "INVALID");
        Student s = get(id);
        if (s.getVersion() != version) throw ApiException.staleVersion();
        if (status.equals(s.getStatus())) return s;
        if (!"ACTIVE".equals(status)) enrollments.closeActive(id, "INACTIVE".equals(status) ? "LEFT" : "GRADUATED", today(), reason);
        s.setStatus(status);
        s.setUpdatedAt(clock.instant());
        Student saved = students.saveAndFlush(s);
        audit.record("STUDENT_STATUS_CHANGED", "student", id, "student marked " + status.toLowerCase());
        return saved;
    }

    /**
     * Only a student with no history: nothing ended (no promotion, transfer or leaving) and no record refers to the
     * enrollment. The foreign keys are the real guard; the friendly code comes from translating their refusal.
     */
    @Transactional
    public void delete(long id) {
        Student s = get(id);
        Integer ended = jdbc.queryForObject("SELECT count(*) FROM enrollments WHERE student_id = ? AND status <> 'ACTIVE'", Integer.class, id);
        if (ended != null && ended > 0) throw new ApiException(HttpStatus.CONFLICT, "STUDENT_HAS_HISTORY");
        try {
            jdbc.update("DELETE FROM enrollments WHERE student_id = ?", id);
            jdbc.update("DELETE FROM students WHERE id = ?", id);   // guardians go with it (ON DELETE CASCADE)
        } catch (DataAccessException e) {
            if (SqliteConstraints.find(e).filter(v -> v.kind() == SqliteConstraints.Kind.FOREIGN_KEY).isPresent()) {
                throw new ApiException(HttpStatus.CONFLICT, "STUDENT_HAS_HISTORY");
            }
            throw e;
        }
        photos.delete(s.getPhotoFile());
        audit.record("STUDENT_DELETED", "student", id, "student deleted (never had history)");
    }

    @Transactional
    public Student setPhoto(long id, MultipartFile file) {
        Student s = get(id);
        String name = photos.store(file);
        String old = s.getPhotoFile();
        s.setPhotoFile(name);
        s.setUpdatedAt(clock.instant());
        Student saved = students.saveAndFlush(s);
        photos.delete(old);
        audit.record("STUDENT_PHOTO_CHANGED", "student", id, "student photo replaced");
        return saved;
    }

    @Transactional
    public Student removePhoto(long id) {
        Student s = get(id);
        String old = s.getPhotoFile();
        s.setPhotoFile(null);
        s.setUpdatedAt(clock.instant());
        Student saved = students.saveAndFlush(s);
        photos.delete(old);
        audit.record("STUDENT_PHOTO_REMOVED", "student", id, "student photo removed");
        return saved;
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    private static void apply(Student s, Fields f) {
        String name = KhmerText.name(f.nameKm());
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        s.setNameKm(name);
        s.setNameEn(KhmerText.name(f.nameEn()));
        s.setGender(f.gender().name());
        s.setDateOfBirth(f.dateOfBirth());
        s.setPlaceOfBirth(KhmerText.free(f.placeOfBirth()));
        s.setAddress(KhmerText.free(f.address()));
        s.setVillage(KhmerText.free(f.village()));
        s.setCommune(KhmerText.free(f.commune()));
        s.setDistrict(KhmerText.free(f.district()));
        s.setProvince(KhmerText.free(f.province()));
        s.setNotes(KhmerText.free(f.notes()));
    }

    /** A warning, not a block: 409 POSSIBLE_DUPLICATE with the existing student's id and code, unless the user confirmed. */
    private void checkDuplicate(Student s, Long ownId, boolean allowDuplicate) {
        if (allowDuplicate) return;
        for (Student other : students.findByNameKmAndDateOfBirth(s.getNameKm(), s.getDateOfBirth())) {
            if (ownId != null && ownId.equals(other.getId())) continue;
            throw new ApiException(HttpStatus.CONFLICT, "POSSIBLE_DUPLICATE", List.of(),
                    Map.of("studentId", other.getId(), "studentCode", other.getStudentCode()));
        }
    }

    /** Replaces the guardians. At most five and one primary; if none is marked primary the first one is. */
    private void replaceGuardians(long studentId, List<GuardianFields> list) {
        List<GuardianFields> guardians = list == null ? List.of() : list;
        if (guardians.size() > MAX_GUARDIANS || guardians.stream().filter(GuardianFields::primary).count() > 1) throw ApiException.validation("guardians", "INVALID");
        List<Object[]> rows = new ArrayList<>();
        boolean anyPrimary = guardians.stream().anyMatch(GuardianFields::primary);
        for (int i = 0; i < guardians.size(); i++) {
            GuardianFields g = guardians.get(i);
            String name = KhmerText.name(g.nameKm());
            if (name == null) throw ApiException.validation("guardians", "REQUIRED");
            boolean primary = anyPrimary ? g.primary() : i == 0;
            rows.add(new Object[]{studentId, name, g.relationship().name(), KhmerText.asciiDigits(KhmerText.free(g.phone())), primary ? 1 : 0, clock.instant().toString()});
        }
        jdbc.update("DELETE FROM guardians WHERE student_id = ?", studentId);
        for (Object[] r : rows) {
            jdbc.update("INSERT INTO guardians (student_id, name_km, relationship, phone, is_primary, created_at) VALUES (?, ?, ?, ?, ?, ?)", r);
        }
    }

    private LocalDate today() { return LocalDate.now(clock.withZone(ZoneId.systemDefault())); }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s; }
}
