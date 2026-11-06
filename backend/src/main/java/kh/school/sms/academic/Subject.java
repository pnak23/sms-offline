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

@Entity
@Table(name = "subjects")
public class Subject {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String code;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    @Column(name = "name_en")
    private String nameEn;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    /** NULL = a main subject; otherwise the main subject this sub-subject belongs to (two levels only, V8). */
    @Column(name = "parent_id")
    private Long parentId;

    @Convert(converter = Converters.BooleanInt.class)
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Version
    private long version;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = Converters.IsoInstant.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public String getCode() { return code; }
    public void setCode(String v) { this.code = v; }
    public String getNameKm() { return nameKm; }
    public void setNameKm(String v) { this.nameKm = v; }
    public String getNameEn() { return nameEn; }
    public void setNameEn(String v) { this.nameEn = v; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int v) { this.sortOrder = v; }
    public Long getParentId() { return parentId; }
    public void setParentId(Long v) { this.parentId = v; }
    public boolean isActive() { return active; }
    public void setActive(boolean v) { this.active = v; }
    public long getVersion() { return version; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
