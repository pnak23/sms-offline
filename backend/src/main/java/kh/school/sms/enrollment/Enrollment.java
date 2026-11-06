package kh.school.sms.enrollment;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import kh.school.sms.common.Converters;

import java.time.Instant;
import java.time.LocalDate;

/**
 * A student's place in one class for one academic year. Attendance, scores and fees will hang off this row (docs D6),
 * so a promotion closes it and opens a new one: old records are never touched.
 * ACTIVE = in the class now; PROMOTED / REPEATED / GRADUATED = the year ended with that outcome;
 * CHANGED_CLASS = moved to another class of the same year; LEFT = left the school during the year.
 */
@Entity
@Table(name = "enrollments")
public class Enrollment {
    public static final String ACTIVE = "ACTIVE";

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_id", nullable = false, updatable = false)
    private Long studentId;

    @Column(name = "academic_year_id", nullable = false, updatable = false)
    private Long academicYearId;

    @Column(name = "class_id", nullable = false, updatable = false)
    private Long classId;

    @Column(nullable = false)
    private String status = ACTIVE;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "enrolled_on", nullable = false)
    private LocalDate enrolledOn;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "left_on")
    private LocalDate leftOn;

    @Column(name = "end_reason")
    private String endReason;

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public Long getStudentId() { return studentId; }
    public void setStudentId(Long v) { this.studentId = v; }
    public Long getAcademicYearId() { return academicYearId; }
    public void setAcademicYearId(Long v) { this.academicYearId = v; }
    public Long getClassId() { return classId; }
    public void setClassId(Long v) { this.classId = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public boolean isActive() { return ACTIVE.equals(status); }
    public LocalDate getEnrolledOn() { return enrolledOn; }
    public void setEnrolledOn(LocalDate v) { this.enrolledOn = v; }
    public LocalDate getLeftOn() { return leftOn; }
    public void setLeftOn(LocalDate v) { this.leftOn = v; }
    public String getEndReason() { return endReason; }
    public void setEndReason(String v) { this.endReason = v; }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
