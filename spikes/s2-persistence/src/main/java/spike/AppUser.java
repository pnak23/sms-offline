package spike;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import java.time.Instant;

@Entity
@Table(name = "app_users")
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Column(nullable = false)
    private String role = "ADMIN";

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "password_changed_at", nullable = false)
    private Instant passwordChangedAt;

    @Column(name = "recovery_key_hash", nullable = false)
    private String recoveryKeyHash;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "recovery_key_created_at", nullable = false)
    private Instant recoveryKeyCreatedAt;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "recovery_key_confirmed_at")
    private Instant recoveryKeyConfirmedAt;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "recovery_failed_attempts", nullable = false)
    private int recoveryFailedAttempts;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "recovery_locked_until")
    private Instant recoveryLockedUntil;

    @Convert(converter = BooleanIntConverter.class)
    @Column(name = "is_active", nullable = false)
    private boolean active = true;

    @Version
    private long version;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Convert(converter = IsoInstantConverter.class)
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Long getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String v) { this.username = v; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String v) { this.displayName = v; }
    public String getRole() { return role; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String v) { this.passwordHash = v; }
    public Instant getPasswordChangedAt() { return passwordChangedAt; }
    public void setPasswordChangedAt(Instant v) { this.passwordChangedAt = v; }
    public String getRecoveryKeyHash() { return recoveryKeyHash; }
    public void setRecoveryKeyHash(String v) { this.recoveryKeyHash = v; }
    public Instant getRecoveryKeyCreatedAt() { return recoveryKeyCreatedAt; }
    public void setRecoveryKeyCreatedAt(Instant v) { this.recoveryKeyCreatedAt = v; }
    public Instant getRecoveryKeyConfirmedAt() { return recoveryKeyConfirmedAt; }
    public void setRecoveryKeyConfirmedAt(Instant v) { this.recoveryKeyConfirmedAt = v; }
    public int getFailedAttempts() { return failedAttempts; }
    public void setFailedAttempts(int v) { this.failedAttempts = v; }
    public Instant getLockedUntil() { return lockedUntil; }
    public void setLockedUntil(Instant v) { this.lockedUntil = v; }
    public boolean isActive() { return active; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant v) { this.createdAt = v; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
