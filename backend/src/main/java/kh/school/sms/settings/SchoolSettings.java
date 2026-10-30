package kh.school.sms.settings;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import kh.school.sms.common.Converters;

import java.time.Instant;

/** The single school-identity row (id is always 1; a CHECK constraint enforces it). */
@Entity
@Table(name = "school_settings")
public class SchoolSettings {
    @Id
    private Long id = 1L;

    @Column(name = "name_km") private String nameKm;
    @Column(name = "name_en") private String nameEn;
    private String address;
    private String phone;
    @Column(name = "director_name") private String directorName;
    @Column(name = "logo_file") private String logoFile;

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String v) { this.nameEn = v; }
    public String getAddress() { return address; }
    public void setAddress(String v) { this.address = v; }
    public String getPhone() { return phone; }
    public void setPhone(String v) { this.phone = v; }
    public String getDirectorName() { return directorName; }
    public void setDirectorName(String v) { this.directorName = v; }
    public String getLogoFile() { return logoFile; }
    public void setLogoFile(String v) { this.logoFile = v; }
    public long getVersion() { return version; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
