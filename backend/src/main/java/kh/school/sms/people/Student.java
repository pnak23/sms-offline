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

/**
 * A student. Grade, class and academic year are NOT here: they live on the enrollment (docs D6/D7), so a student's
 * history is never rewritten by a promotion. Guardians are in their own table.
 */
@Entity
@Table(name = "students")
public class Student {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "student_code", nullable = false, unique = true, updatable = false)
    private String studentCode;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(name = "name_en")
    private String nameEn;

    @Column(nullable = false)
    private String gender;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "date_of_birth", nullable = false)
    private LocalDate dateOfBirth;

    @Column(name = "place_of_birth")
    private String placeOfBirth;

    private String address;
    private String village;
    private String commune;
    private String district;
    private String province;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "enrollment_date", nullable = false)
    private LocalDate enrollmentDate;

    @Column(nullable = false)
    private String status = "ACTIVE";

    @Column(name = "photo_file")
    private String photoFile;

    private String notes;

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public String getStudentCode() { return studentCode; }
    public void setStudentCode(String v) { this.studentCode = v; }
    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String v) { this.nameEn = v; }
    public String getGender() { return gender; }
    public void setGender(String v) { this.gender = v; }
    public LocalDate getDateOfBirth() { return dateOfBirth; }
    public void setDateOfBirth(LocalDate v) { this.dateOfBirth = v; }
    public String getPlaceOfBirth() { return placeOfBirth; }
    public void setPlaceOfBirth(String v) { this.placeOfBirth = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public String getVillage() { return village; }
    public void setVillage(String v) { this.village = v; }
    public String getCommune() { return commune; }
    public void setCommune(String v) { this.commune = v; }
    public String getDistrict() { return district; }
    public void setDistrict(String v) { this.district = v; }
    public String getProvince() { return province; }
    public void setProvince(String v) { this.province = v; }
    public LocalDate getEnrollmentDate() { return enrollmentDate; }
    public void setEnrollmentDate(LocalDate v) { this.enrollmentDate = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public String getPhotoFile() { return photoFile; }
    public void setPhotoFile(String v) { this.photoFile = v; }
    public String getNotes() { return notes; }
    public void setNotes(String v) { this.notes = v; }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
