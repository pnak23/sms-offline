package kh.school.sms.people;

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

@Entity
@Table(name = "teachers")
public class Teacher {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "teacher_code", nullable = false, unique = true)
    private String teacherCode;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(nullable = false)
    private String gender;

    private String phone;
    private String address;
    private String specialization;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "employment_date")
    private LocalDate employmentDate;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public String getTeacherCode() { return teacherCode; }
    public void setTeacherCode(String v) { this.teacherCode = v; }
    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public String getSpecialization() { return specialization; }
    public void setSpecialization(String v) { this.specialization = v; }
    public LocalDate getEmploymentDate() { return employmentDate; }
    public void setEmploymentDate(LocalDate v) { this.employmentDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public boolean isActive() { return "ACTIVE".equals(status); }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
