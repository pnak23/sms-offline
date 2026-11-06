package kh.school.sms.academic;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.KhmerText;
import kh.school.sms.people.Teacher;
import kh.school.sms.people.TeacherRepository;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Classes of an academic year and the teachers of their subjects. Nothing in a CLOSED year changes. The year and grade
 * of a class never change; a wrongly created class can be deleted while nobody was ever enrolled in it.
 */
@Service
public class ClassService {
    public record Fields(String nameKm, Integer capacity, Long homeroomTeacherId, String shift) {}
    public record Assignment(long subjectId, long teacherId) {}

    static final int DEFAULT_CAPACITY = 40;

    private final SchoolClassRepository classes;
    private final AcademicYearRepository years;
    private final GradeRepository grades;
    private final TeacherRepository teachers;
    private final JdbcTemplate jdbc;
    private final AuditService audit;
    private final Clock clock;

    public ClassService(SchoolClassRepository classes, AcademicYearRepository years, GradeRepository grades, TeacherRepository teachers,
                        JdbcTemplate jdbc, AuditService audit, Clock clock) {
        this.classes = classes;
        this.years = years;
        this.grades = grades;
        this.teachers = teachers;
        this.jdbc = jdbc;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public SchoolClass create(long yearId, long gradeId, Fields f) {
        AcademicYear year = years.findById(yearId).orElseThrow(() -> ApiException.validation("academicYearId", "INVALID"));
        if (AcademicYearService.CLOSED.equals(year.getStatus())) throw yearClosed();
        if (!grades.existsById(gradeId)) throw ApiException.validation("gradeId", "INVALID");
        String name = requiredName(f.nameKm());
        if (classes.existsByAcademicYearIdAndGradeIdAndNameKm(yearId, gradeId, name)) throw ApiException.duplicate("nameKm");
        SchoolClass c = new SchoolClass();
        c.setAcademicYearId(yearId);
        c.setGradeId(gradeId);
        apply(c, name, f);
        c.setCreatedAt(clock.instant());
        c.setUpdatedAt(clock.instant());
        SchoolClass saved = classes.saveAndFlush(c);
        audit.record("CLASS_CREATED", "class", saved.getId(), "class created");
        return saved;
    }

    @Transactional
    public SchoolClass update(long id, Fields f, long version) {
        SchoolClass c = find(id);
        requireOpenYear(c);
        if (c.getVersion() != version) throw ApiException.staleVersion();
        String name = requiredName(f.nameKm());
        if (classes.existsByAcademicYearIdAndGradeIdAndNameKmAndIdNot(c.getAcademicYearId(), c.getGradeId(), name, id)) throw ApiException.duplicate("nameKm");
        apply(c, name, f);
        c.setUpdatedAt(clock.instant());
        SchoolClass saved = classes.saveAndFlush(c);
        audit.record("CLASS_UPDATED", "class", id, "class updated");
        return saved;
    }

    /** Only a class nobody was ever enrolled in; otherwise the students' history would lose its class. */
    @Transactional
    public void delete(long id) {
        SchoolClass c = find(id);
        requireOpenYear(c);
        Integer enrolled = jdbc.queryForObject("SELECT count(*) FROM enrollments WHERE class_id = ?", Integer.class, id);
        if (enrolled != null && enrolled > 0) throw new ApiException(HttpStatus.CONFLICT, "CLASS_HAS_STUDENTS");
        jdbc.update("DELETE FROM teacher_assignments WHERE class_id = ?", id);
        jdbc.update("DELETE FROM timetable_entries WHERE class_id = ?", id);   // a class that never had a student has no timetable history worth keeping
        classes.delete(c);
        classes.flush();
        audit.record("CLASS_DELETED", "class", id, "class deleted (it never had students)");
    }

    /** Replaces the subject teachers of a class. Every subject must be active and studied by the class's grade; every teacher active. */
    @Transactional
    public void setAssignments(long classId, List<Assignment> assignments) {
        SchoolClass c = find(classId);
        requireOpenYear(c);
        Set<Long> subjectsSeen = new HashSet<>();
        for (Assignment a : assignments) {
            if (!subjectsSeen.add(a.subjectId())) throw ApiException.validation("assignments", "INVALID");   // one teacher per class + subject
            Integer offered = jdbc.queryForObject("""
                    SELECT count(*) FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id
                    WHERE gs.grade_id = ? AND gs.subject_id = ? AND s.is_active = 1 AND s.parent_id IS NULL
                    """, Integer.class, c.getGradeId(), a.subjectId());
            if (offered == null || offered == 0) throw ApiException.validation("assignments", "SUBJECT_NOT_OFFERED");
            Teacher t = teachers.findById(a.teacherId()).orElseThrow(() -> ApiException.validation("assignments", "INVALID"));
            if (!t.isActive()) throw ApiException.validation("assignments", "TEACHER_INACTIVE");
        }
        jdbc.update("DELETE FROM teacher_assignments WHERE class_id = ?", classId);
        String now = clock.instant().toString();
        for (Assignment a : assignments) {
            jdbc.update("INSERT INTO teacher_assignments (class_id, subject_id, teacher_id, created_at) VALUES (?, ?, ?, ?)",
                    classId, a.subjectId(), a.teacherId(), now);
        }
        audit.record("CLASS_TEACHERS_CHANGED", "class", classId, "subject teachers of the class changed");
    }

    public SchoolClass find(long id) { return classes.findById(id).orElseThrow(ApiException::notFound); }

    private void apply(SchoolClass c, String name, Fields f) {
        c.setNameKm(name);
        c.setCapacity(f.capacity() == null ? DEFAULT_CAPACITY : f.capacity());
        c.setShift(f.shift());
        if (f.homeroomTeacherId() == null) {
            c.setHomeroomTeacherId(null);
        } else {
            Teacher t = teachers.findById(f.homeroomTeacherId()).orElseThrow(() -> ApiException.validation("homeroomTeacherId", "INVALID"));
            // an unchanged inactive homeroom teacher may stay; choosing one now may not
            if (!t.isActive() && !t.getId().equals(c.getHomeroomTeacherId())) throw ApiException.validation("homeroomTeacherId", "TEACHER_INACTIVE");
            c.setHomeroomTeacherId(t.getId());
        }
    }

    private void requireOpenYear(SchoolClass c) {
        AcademicYear year = years.findById(c.getAcademicYearId()).orElseThrow();
        if (AcademicYearService.CLOSED.equals(year.getStatus())) throw yearClosed();
    }

    private static String requiredName(String raw) {
        String name = KhmerText.name(raw);
        if (name == null) throw ApiException.validation("nameKm", "REQUIRED");
        return name;
    }

    private static ApiException yearClosed() { return new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED"); }
}
