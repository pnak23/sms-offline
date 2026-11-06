package kh.school.sms.enrollment;

import kh.school.sms.academic.AcademicYear;
import kh.school.sms.academic.AcademicYearRepository;
import kh.school.sms.academic.AcademicYearService;
import kh.school.sms.academic.ClassQueries;
import kh.school.sms.academic.SchoolClass;
import kh.school.sms.academic.SchoolClassRepository;
import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.ApiException.FieldError;
import kh.school.sms.common.KhmerText;
import kh.school.sms.people.Student;
import kh.school.sms.people.StudentRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * A student's journey through classes: enrol, move to another class, leave, and the year-end promotion. Old
 * enrollments are closed with an outcome and never edited again; a new one is opened (docs D6, §5.4). Going over a
 * class's capacity is a warning, never a block.
 */
@Service
public class EnrollmentService {
    public static final String CLASS_OVER_CAPACITY = "CLASS_OVER_CAPACITY";
    static final String PROMOTED = "PROMOTED";
    static final String REPEATED = "REPEATED";
    static final String GRADUATED = "GRADUATED";
    private static final int FINAL_GRADE = 6;

    public record Result(Enrollment enrollment, List<String> warnings) {}
    public record Decision(long enrollmentId, String outcome, Long toClassId) {}
    public record ClassLoad(long classId, String className, String gradeName, int current, int adding, int capacity) {
        public boolean over() { return current + adding > capacity; }
    }
    public record PromotionSummary(boolean dryRun, int promoted, int repeated, int graduated, List<ClassLoad> classes) {}

    private final EnrollmentRepository enrollments;
    private final StudentRepository students;
    private final SchoolClassRepository classes;
    private final AcademicYearRepository years;
    private final ClassQueries classQueries;
    private final AuditService audit;
    private final Clock clock;

    public EnrollmentService(EnrollmentRepository enrollments, StudentRepository students, SchoolClassRepository classes,
                             AcademicYearRepository years, ClassQueries classQueries, AuditService audit, Clock clock) {
        this.enrollments = enrollments;
        this.students = students;
        this.classes = classes;
        this.years = years;
        this.classQueries = classQueries;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public Result enroll(long studentId, long classId, LocalDate enrolledOn) {
        Student s = students.findById(studentId).orElseThrow(() -> ApiException.validation("studentId", "INVALID"));
        if (!"ACTIVE".equals(s.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "STUDENT_NOT_ACTIVE");
        SchoolClass c = classes.findById(classId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        requireOpenYear(c.getAcademicYearId());
        if (enrollments.existsByStudentIdAndAcademicYearIdAndStatus(studentId, c.getAcademicYearId(), Enrollment.ACTIVE)) {
            throw new ApiException(HttpStatus.CONFLICT, "ENROLLMENT_EXISTS");
        }
        Enrollment e = open(studentId, c, enrolledOn == null ? today() : enrolledOn);
        audit.record("STUDENT_ENROLLED", "enrollment", e.getId(), "student enrolled in a class");
        return new Result(e, capacityWarnings(c));
    }

    /** Moves a student to another class of the SAME year: the old enrollment is closed as CHANGED_CLASS, a new one opened. */
    @Transactional
    public Result transfer(long enrollmentId, long toClassId, LocalDate date, String reason) {
        Enrollment e = enrollments.findById(enrollmentId).orElseThrow(ApiException::notFound);
        if (!e.isActive()) throw new ApiException(HttpStatus.CONFLICT, "ENROLLMENT_NOT_ACTIVE");
        SchoolClass to = classes.findById(toClassId).orElseThrow(() -> ApiException.validation("classId", "INVALID"));
        if (!to.getAcademicYearId().equals(e.getAcademicYearId()) || to.getId().equals(e.getClassId())) throw ApiException.validation("classId", "INVALID");
        requireOpenYear(e.getAcademicYearId());
        LocalDate on = date == null ? today() : date;
        if (on.isBefore(e.getEnrolledOn())) throw ApiException.validation("date", "INVALID_DATE");
        close(e, "CHANGED_CLASS", on, reason);
        Enrollment next = open(e.getStudentId(), to, on);
        audit.record("STUDENT_TRANSFERRED", "enrollment", next.getId(), "student moved to another class of the same year");
        return new Result(next, capacityWarnings(to));
    }

    /** The student leaves the school: the enrollment ends as LEFT and the student becomes INACTIVE (history stays). */
    @Transactional
    public Enrollment leave(long enrollmentId, LocalDate date, String reason) {
        Enrollment e = enrollments.findById(enrollmentId).orElseThrow(ApiException::notFound);
        if (!e.isActive()) throw new ApiException(HttpStatus.CONFLICT, "ENROLLMENT_NOT_ACTIVE");
        requireOpenYear(e.getAcademicYearId());
        LocalDate on = date == null ? today() : date;
        if (on.isBefore(e.getEnrolledOn())) throw ApiException.validation("date", "INVALID_DATE");
        close(e, "LEFT", on, reason);
        Student s = students.findById(e.getStudentId()).orElseThrow();
        s.setStatus("INACTIVE");
        s.setUpdatedAt(clock.instant());
        students.saveAndFlush(s);
        audit.record("STUDENT_LEFT", "enrollment", e.getId(), "student left the school");
        return e;
    }

    /** Used when a student is marked inactive or graduated by hand: whatever they were enrolled in ends with that outcome. */
    @Transactional
    public void closeActive(long studentId, String status, LocalDate on, String reason) {
        for (Enrollment e : enrollments.findByStudentIdAndStatus(studentId, Enrollment.ACTIVE)) close(e, status, on, reason);
    }

    /**
     * Year-end promotion. Everything is checked BEFORE anything is written, so a request is applied completely or not at
     * all; with {@code dryRun} nothing is written and the summary (including classes that would exceed their capacity)
     * is returned. Running it twice cannot duplicate anything: a closed enrollment is no longer ACTIVE.
     */
    @Transactional
    public PromotionSummary promote(long fromYearId, long toYearId, List<Decision> decisions, boolean dryRun) {
        years.findById(fromYearId).orElseThrow(() -> ApiException.validation("fromYearId", "INVALID"));
        AcademicYear toYear = years.findById(toYearId).orElseThrow(() -> ApiException.validation("toYearId", "INVALID"));
        if (fromYearId == toYearId) throw ApiException.validation("toYearId", "INVALID");
        if (AcademicYearService.CLOSED.equals(toYear.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
        if (decisions.isEmpty()) throw ApiException.validation("decisions", "REQUIRED");

        Map<Long, ClassQueries.ClassRow> fromClasses = byId(classQueries.list(fromYearId, null));
        Map<Long, ClassQueries.ClassRow> toClasses = byId(classQueries.list(toYearId, null));
        List<FieldError> errors = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        Map<Long, Integer> adding = new LinkedHashMap<>();
        int promoted = 0, repeated = 0, graduated = 0;

        for (int i = 0; i < decisions.size(); i++) {
            Decision d = decisions.get(i);
            String field = "decisions[" + i + "]";
            Enrollment e = enrollments.findById(d.enrollmentId()).orElse(null);
            if (e == null || !seen.add(d.enrollmentId())) { errors.add(new FieldError(field, "INVALID")); continue; }
            ClassQueries.ClassRow from = fromClasses.get(e.getClassId());
            if (!e.isActive() || from == null || e.getAcademicYearId() != fromYearId) { errors.add(new FieldError(field, "ENROLLMENT_NOT_ACTIVE")); continue; }
            String outcome = d.outcome() == null ? "" : d.outcome();
            switch (outcome) {
                case GRADUATED -> {
                    if (from.gradeLevel() != FINAL_GRADE) errors.add(new FieldError(field, "NOT_FINAL_GRADE"));
                    else if (d.toClassId() != null) errors.add(new FieldError(field, "INVALID_TARGET_CLASS"));
                    else graduated++;
                }
                case PROMOTED, REPEATED -> {
                    int wantedLevel = PROMOTED.equals(outcome) ? from.gradeLevel() + 1 : from.gradeLevel();
                    ClassQueries.ClassRow to = d.toClassId() == null ? null : toClasses.get(d.toClassId());
                    if (to == null || to.gradeLevel() != wantedLevel) errors.add(new FieldError(field, "INVALID_TARGET_CLASS"));
                    else if (enrollments.existsByStudentIdAndAcademicYearIdAndStatus(e.getStudentId(), toYearId, Enrollment.ACTIVE)) errors.add(new FieldError(field, "ENROLLMENT_EXISTS"));
                    else {
                        adding.merge(to.id(), 1, Integer::sum);
                        if (PROMOTED.equals(outcome)) promoted++; else repeated++;
                    }
                }
                default -> errors.add(new FieldError(field, "INVALID"));
            }
        }
        if (!errors.isEmpty()) throw ApiException.validation(errors.size() > 50 ? errors.subList(0, 50) : errors);

        List<ClassLoad> load = new ArrayList<>();
        adding.forEach((classId, n) -> {
            ClassQueries.ClassRow c = toClasses.get(classId);
            load.add(new ClassLoad(classId, c.nameKm(), c.gradeName(), c.studentCount(), n, c.capacity()));
        });
        PromotionSummary summary = new PromotionSummary(dryRun, promoted, repeated, graduated, load);
        if (dryRun) return summary;

        LocalDate on = today();
        for (Decision d : decisions) {
            Enrollment e = enrollments.findById(d.enrollmentId()).orElseThrow();
            close(e, d.outcome(), on, null);
            if (GRADUATED.equals(d.outcome())) {
                Student s = students.findById(e.getStudentId()).orElseThrow();
                s.setStatus("GRADUATED");
                s.setUpdatedAt(clock.instant());
                students.saveAndFlush(s);
            } else {
                open(e.getStudentId(), classes.findById(d.toClassId()).orElseThrow(), on);
            }
        }
        audit.record("PROMOTION_APPLIED", "academic_year", toYearId,
                "promotion applied: " + promoted + " promoted, " + repeated + " repeated, " + graduated + " graduated");
        return summary;
    }

    // ---- helpers ---------------------------------------------------------------------------------------------

    /** Flushes at once: the partial unique index on ACTIVE rows needs the close to reach the database before the next open. */
    private void close(Enrollment e, String status, LocalDate on, String reason) {
        e.setStatus(status);
        e.setLeftOn(on);
        e.setEndReason(KhmerText.free(reason));
        e.setUpdatedAt(clock.instant());
        enrollments.saveAndFlush(e);
    }

    private Enrollment open(long studentId, SchoolClass c, LocalDate on) {
        Enrollment e = new Enrollment();
        e.setStudentId(studentId);
        e.setAcademicYearId(c.getAcademicYearId());
        e.setClassId(c.getId());
        e.setEnrolledOn(on);
        e.setCreatedAt(clock.instant());
        e.setUpdatedAt(clock.instant());
        return enrollments.saveAndFlush(e);
    }

    private List<String> capacityWarnings(SchoolClass c) {
        return enrollments.countByClassIdAndStatus(c.getId(), Enrollment.ACTIVE) > c.getCapacity() ? List.of(CLASS_OVER_CAPACITY) : List.of();
    }

    private void requireOpenYear(long yearId) {
        AcademicYear y = years.findById(yearId).orElseThrow();
        if (AcademicYearService.CLOSED.equals(y.getStatus())) throw new ApiException(HttpStatus.CONFLICT, "ACADEMIC_YEAR_CLOSED");
    }

    private LocalDate today() { return LocalDate.now(clock.withZone(ZoneId.systemDefault())); }

    private static Map<Long, ClassQueries.ClassRow> byId(List<ClassQueries.ClassRow> rows) {
        Map<Long, ClassQueries.ClassRow> m = new LinkedHashMap<>();
        for (ClassQueries.ClassRow r : rows) m.put(r.id(), r);
        return m;
    }
}
