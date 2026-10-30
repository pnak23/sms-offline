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
import java.time.LocalDate;

@Entity
@Table(name = "academic_years")
public class AcademicYear {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name_km", nullable = false, unique = true)
    private String nameKm;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Convert(converter = Converters.IsoDate.class)
    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Convert(converter = Converters.BooleanInt.class)
    @Column(name = "is_current", nullable = false)
    private boolean current;

    @Column(nullable = false)
    private String status = "OPEN";

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public LocalDate getStartDate() { return startDate; }
    public void setStartDate(LocalDate v) { this.startDate = v; }
    public LocalDate getEndDate() { return endDate; }
    public void setEndDate(LocalDate v) { this.endDate = v; }
    public boolean isCurrent() { return current; }
    public void setCurrent(boolean v) { this.current = v; }
    public String getStatus() { return status; }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
