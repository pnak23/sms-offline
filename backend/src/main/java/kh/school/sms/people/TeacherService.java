package kh.school.sms.people;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.common.SearchText;
import kh.school.sms.common.SequenceService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;

/** Teachers are deactivated, never deleted: classes (and later records) may refer to them. */
@Service
public class TeacherService {
    /** The editable fields, already validated by the controller's bean validation. */
    public record Fields(String nameKm, Gender gender, String phone, String address, String specialization, LocalDate employmentDate) {}

    private final TeacherRepository teachers;
    private final SequenceService sequences;
    private final AuditService audit;
    private final Clock clock;

    public TeacherService(TeacherRepository teachers, SequenceService sequences, AuditService audit, Clock clock) {
        this.teachers = teachers;
        this.sequences = sequences;
        this.audit = audit;
        this.clock = clock;
    }

    public List<Teacher> search(String q, String status) {
        return teachers.search(SearchText.contains(q), status == null || status.isBlank() ? null : status);
    }

    public Teacher get(long id) { return teachers.findById(id).orElseThrow(ApiException::notFound); }

    @Transactional
    public Teacher create(Fields f) {
        Teacher t = new Teacher();
        apply(t, f);
        t.setTeacherCode(String.format("T-%03d", sequences.next("teacher", 0)));
        t.setCreatedAt(clock.instant());
        t.setUpdatedAt(clock.instant());
        Teacher saved = teachers.saveAndFlush(t);
        audit.record("TEACHER_CREATED", "teacher", saved.getId(), "teacher created");
        return saved;
    }

    @Transactional
    public Teacher update(long id, Fields f, long version) {
        Teacher t = get(id);
        if (t.getVersion() != version) throw ApiException.staleVersion();
        apply(t, f);
        t.setUpdatedAt(clock.instant());
        Teacher saved = teachers.saveAndFlush(t);
        audit.record("TEACHER_UPDATED", "teacher", id, "teacher updated");
        return saved;
    }

    @Transactional
    public Teacher setActive(long id, boolean active, long version) {
        Teacher t = get(id);
        if (t.getVersion() != version) throw ApiException.staleVersion();
        t.setStatus(active ? "ACTIVE" : "INACTIVE");
        t.setUpdatedAt(clock.instant());
        Teacher saved = teachers.saveAndFlush(t);
        audit.record("TEACHER_ACTIVE_CHANGED", "teacher", id, active ? "teacher reactivated" : "teacher deactivated");
        return saved;
    }

    private static void apply(Teacher t, Fields f) {
        String name = KhmerText.name(f.nameKm());
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        t.setNameKm(name);
        t.setGender(f.gender().name());
        t.setPhone(KhmerText.asciiDigits(KhmerText.free(f.phone())));
        t.setAddress(KhmerText.free(f.address()));
        t.setSpecialization(KhmerText.free(f.specialization()));
        t.setEmploymentDate(f.employmentDate());
    }
}
