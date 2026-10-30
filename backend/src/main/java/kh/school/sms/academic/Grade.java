package kh.school.sms.academic;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Grades 1–6 are seeded by migration and read-only here. */
@Entity
@Table(name = "grades")
public class Grade {
    @Id
    private Long id;

    @Column(nullable = false, unique = true)
    private int level;

    @Column(name = "name_km", nullable = false)
    private String nameKm;

    public Long getId() { return id; }
    public int getLevel() { return level; }
    public String getNameKm() { return nameKm; }
}
