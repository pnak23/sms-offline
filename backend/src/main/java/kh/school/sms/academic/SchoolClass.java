package kh.school.sms.academic;

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

/** One class of one grade in one academic year ("Grade 1 A" of 2026-2027). Year and grade never change after creation. */
@Entity
@Table(name = "classes")
public class SchoolClass {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "academic_year_id", nullable = false, updatable = false)
    private Long academicYearId;

    @Column(name = "grade_id", nullable = false, updatable = false)
    private Long gradeId;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(nullable = false)
    private int capacity = 40;

    @Column(name = "homeroom_teacher_id")
    private Long homeroomTeacherId;

    private String shift;

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public Long getAcademicYearId() { return academicYearId; }
    public void setAcademicYearId(Long v) { this.academicYearId = v; }
    public Long getGradeId() { return gradeId; }
    public void setGradeId(Long v) { this.gradeId = v; }
    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int v) { this.capacity = v; }
    public Long getHomeroomTeacherId() { return homeroomTeacherId; }
    public void setHomeroomTeacherId(Long v) { this.homeroomTeacherId = v; }
    public String getShift() { return shift; }
    public void setShift(String v) { this.shift = v; }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
