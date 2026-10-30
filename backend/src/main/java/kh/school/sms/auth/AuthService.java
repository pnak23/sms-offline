package kh.school.sms.auth;

import kh.school.sms.audit.AuditService;
import kh.school.sms.common.ApiException;
import kh.school.sms.common.ApiException.FieldError;
import kh.school.sms.common.KhmerText;
import kh.school.sms.security.AuthUser;
import kh.school.sms.security.SessionRegistry;
import kh.school.sms.security.SetupState;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Account lifecycle (docs §4A). Hashing runs OUTSIDE database transactions (BCrypt cost 12 is slow, and SQLite has a
 * single writer). Failure counters live in the database, so restarting the app does not reset the throttle.
 */
@Service
public class AuthService {
    public record SetupResult(String token, AppUser user, String recoveryKey) {}
    public record LoginResult(String token, AppUser user) {}
    public record RecoverResult(AppUser user, String recoveryKey) {}

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final SessionRegistry sessions;
    private final AuditService audit;
    private final SetupState setupState;
    private final Clock clock;
    private final TransactionTemplate tx;
    private volatile String dummyHash;

    public AuthService(AppUserRepository users, PasswordEncoder encoder, SessionRegistry sessions, AuditService audit,
                       SetupState setupState, Clock clock, PlatformTransactionManager txm) {
        this.users = users;
        this.encoder = encoder;
        this.sessions = sessions;
        this.audit = audit;
        this.setupState = setupState;
        this.clock = clock;
        this.tx = new TransactionTemplate(txm);
    }

    // ---- setup ------------------------------------------------------------------------------------------------

    public SetupResult setup(String displayName, String username, String password) {
        if (setupState.usersExist()) throw new ApiException(HttpStatus.CONFLICT, "SETUP_ALREADY_DONE");
        String uname = UsernamePolicy.normalize(username);
        String dname = KhmerText.name(displayName);
        List<FieldError> errors = new ArrayList<>();
        if (dname == null) errors.add(new FieldError("displayName", "REQUIRED"));
        errors.addAll(UsernamePolicy.validate(uname));
        errors.addAll(PasswordPolicy.validate("password", password, uname));
        if (!errors.isEmpty()) throw ApiException.validation(errors);

        String recoveryKey = RecoveryKeys.generate();
        String passwordHash = encoder.encode(password);
        String recoveryHash = encoder.encode(recoveryKey);
        Instant now = clock.instant();

        AppUser created = tx.execute(s -> {
            if (users.count() > 0) throw new ApiException(HttpStatus.CONFLICT, "SETUP_ALREADY_DONE");
            AppUser u = new AppUser();
            u.setUsername(uname);
            u.setDisplayName(dname);
            u.setPasswordHash(passwordHash);
            u.setPasswordChangedAt(now);
            u.setRecoveryKeyHash(recoveryHash);
            u.setRecoveryKeyCreatedAt(now);
            u.setCreatedAt(now);
            u.setUpdatedAt(now);
            users.saveAndFlush(u);
            audit.record("SETUP_ADMIN_CREATED", "app_user", u.getId(), "administrator account created");
            return u;
        });
        setupState.markUsersExist();
        String token = sessions.issue(new AuthUser(created.getId(), created.getUsername()));
        return new SetupResult(token, created, RecoveryKeys.format(recoveryKey));
    }

    // ---- login / unlock / logout ----------------------------------------------------------------------------

    public LoginResult login(String username, String password) {
        AppUser u = users.findByUsername(UsernamePolicy.normalize(username)).filter(AppUser::isActive).orElse(null);
        if (u == null) {
            passwordMatches(password, dummyHash());   // same cost as a real check: do not reveal whether the user exists
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }
        requirePassword(u, password, new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS"));
        String token = sessions.issue(new AuthUser(u.getId(), u.getUsername()));
        return new LoginResult(token, users.findById(u.getId()).orElse(u));
    }

    public void unlock(AuthUser who, String password) {
        requirePassword(load(who), password, ApiException.validation("password", "INVALID_PASSWORD"));
    }

    public void logout(String token) { sessions.revoke(token); }

    // ---- change password / recovery key ---------------------------------------------------------------------

    public void changePassword(AuthUser who, String token, String currentPassword, String newPassword) {
        AppUser u = load(who);
        requirePassword(u, currentPassword, ApiException.validation("currentPassword", "INVALID_PASSWORD"));
        List<FieldError> errors = PasswordPolicy.validate("newPassword", newPassword, u.getUsername());
        if (!errors.isEmpty()) throw ApiException.validation(errors);
        String hash = encoder.encode(newPassword);
        Instant now = clock.instant();
        tx.executeWithoutResult(s -> {
            AppUser f = users.findById(u.getId()).orElseThrow();
            f.setPasswordHash(hash);
            f.setPasswordChangedAt(now);
            f.setUpdatedAt(now);
            users.saveAndFlush(f);
            audit.record("PASSWORD_CHANGED", "app_user", f.getId(), "password changed");
        });
        sessions.revokeAllExcept(u.getId(), token);
    }

    /** Needs the current password; invalidates the previous key immediately (docs §4A.2 "Regenerate"). */
    public String regenerateRecoveryKey(AuthUser who, String currentPassword) {
        AppUser u = load(who);
        requirePassword(u, currentPassword, ApiException.validation("currentPassword", "INVALID_PASSWORD"));
        String key = RecoveryKeys.generate();
        String hash = encoder.encode(key);
        Instant now = clock.instant();
        tx.executeWithoutResult(s -> {
            AppUser f = users.findById(u.getId()).orElseThrow();
            f.setRecoveryKeyHash(hash);
            f.setRecoveryKeyCreatedAt(now);
            f.setRecoveryKeyConfirmedAt(null);
            f.setUpdatedAt(now);
            users.saveAndFlush(f);
            audit.record("RECOVERY_KEY_REGENERATED", "app_user", f.getId(), "recovery key regenerated; previous key invalidated");
        });
        return RecoveryKeys.format(key);
    }

    /** The user says they saved the key. The UI makes them retype its first group before calling this. */
    public void confirmRecoveryKey(AuthUser who) {
        Instant now = clock.instant();
        tx.executeWithoutResult(s -> {
            AppUser f = users.findById(who.id()).orElseThrow();
            if (f.getRecoveryKeyConfirmedAt() == null) {
                f.setRecoveryKeyConfirmedAt(now);
                f.setUpdatedAt(now);
                users.saveAndFlush(f);
                audit.record("RECOVERY_KEY_CONFIRMED", "app_user", f.getId(), "recovery key confirmed as saved");
            }
        });
    }

    /**
     * Offline password reset (docs §4A.2). In ONE transaction: new password, a freshly generated recovery key replaces
     * the used one (unconfirmed), counters cleared. All sessions are revoked afterwards. The old key is invalid the
     * moment the transaction commits; a concurrent use of the same key is rejected.
     */
    public RecoverResult recover(String keyInput, String newPassword) {
        AppUser u = users.findFirstByOrderByIdAsc().orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "SETUP_REQUIRED"));
        Instant now = clock.instant();
        if (u.getRecoveryLockedUntil() != null && u.getRecoveryLockedUntil().isAfter(now)) throw locked(u.getRecoveryLockedUntil(), now);

        Optional<String> key = RecoveryKeys.normalize(keyInput);
        if (key.isEmpty() || !encoder.matches(key.get(), u.getRecoveryKeyHash())) {
            Instant until = tx.execute(s -> {
                AppUser f = users.findById(u.getId()).orElseThrow();
                int n = f.getRecoveryFailedAttempts() + 1;
                f.setRecoveryFailedAttempts(n);
                f.setRecoveryLockedUntil(lockUntil(n, now));
                f.setUpdatedAt(now);
                users.saveAndFlush(f);
                if (f.getRecoveryLockedUntil() != null) audit.record("RECOVERY_LOCKED", "app_user", f.getId(), "recovery temporarily locked after repeated failures");
                return f.getRecoveryLockedUntil();
            });
            if (until != null) throw locked(until, now);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_RECOVERY_KEY");
        }

        List<FieldError> errors = PasswordPolicy.validate("newPassword", newPassword, u.getUsername());
        if (!errors.isEmpty()) throw ApiException.validation(errors);   // a weak new password does not burn the key

        String newKey = RecoveryKeys.generate();
        String passwordHash = encoder.encode(newPassword);
        String keyHash = encoder.encode(newKey);
        String verifiedAgainst = u.getRecoveryKeyHash();
        AppUser updated = tx.execute(s -> {
            AppUser f = users.findById(u.getId()).orElseThrow();
            if (!f.getRecoveryKeyHash().equals(verifiedAgainst)) throw new ApiException(HttpStatus.CONFLICT, "RECOVERY_KEY_CHANGED");
            f.setPasswordHash(passwordHash);
            f.setPasswordChangedAt(now);
            f.setRecoveryKeyHash(keyHash);
            f.setRecoveryKeyCreatedAt(now);
            f.setRecoveryKeyConfirmedAt(null);
            f.setFailedAttempts(0);
            f.setLockedUntil(null);
            f.setRecoveryFailedAttempts(0);
            f.setRecoveryLockedUntil(null);
            f.setUpdatedAt(now);
            users.saveAndFlush(f);
            audit.record("RECOVERY_USED", "app_user", f.getId(), "password reset with recovery key; recovery key rotated");
            return f;
        });
        sessions.revokeAll();
        return new RecoverResult(updated, RecoveryKeys.format(newKey));
    }

    // ---- queries ---------------------------------------------------------------------------------------------

    public AppUser load(AuthUser who) {
        return users.findById(who.id()).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED"));
    }

    // ---- throttling ------------------------------------------------------------------------------------------

    /** Default 4 of docs §4A.1: 5 failures -> 1 min, 10 -> 5 min, 15 or more -> 15 min (cap). Never permanent. */
    static Instant lockUntil(int failures, Instant now) {
        if (failures >= 15) return now.plus(Duration.ofMinutes(15));
        if (failures >= 10) return now.plus(Duration.ofMinutes(5));
        if (failures >= 5) return now.plus(Duration.ofMinutes(1));
        return null;
    }

    private static ApiException locked(Instant until, Instant now) {
        long seconds = Math.max(1, Duration.between(now, until).toSeconds() + 1);
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "ACCOUNT_LOCKED", List.of(), Map.of("retryAfterSeconds", seconds));
    }

    private boolean passwordMatches(String password, String hash) {
        // BCrypt (Spring Security 7) rejects > 72 bytes by throwing; such a password can never be correct.
        return password != null && PasswordPolicy.utf8Bytes(password) <= PasswordPolicy.MAX_BYTES && encoder.matches(password, hash);
    }

    private String dummyHash() {
        String h = dummyHash;
        if (h == null) dummyHash = h = encoder.encode("not-a-real-password-for-timing-only");
        return h;
    }

    /** Verifies a password against the throttle; on a miss records the failure and throws {@code wrong} (or "locked"). */
    private void requirePassword(AppUser u, String password, ApiException wrong) {
        Instant now = clock.instant();
        if (u.getLockedUntil() != null && u.getLockedUntil().isAfter(now)) throw locked(u.getLockedUntil(), now);
        if (passwordMatches(password, u.getPasswordHash())) {
            if (u.getFailedAttempts() > 0 || u.getLockedUntil() != null) {
                tx.executeWithoutResult(s -> {
                    AppUser f = users.findById(u.getId()).orElseThrow();
                    f.setFailedAttempts(0);
                    f.setLockedUntil(null);
                    f.setUpdatedAt(now);
                    users.saveAndFlush(f);
                });
            }
            return;
        }
        Instant until = tx.execute(s -> {
            AppUser f = users.findById(u.getId()).orElseThrow();
            int n = f.getFailedAttempts() + 1;
            f.setFailedAttempts(n);
            f.setLockedUntil(lockUntil(n, now));
            f.setUpdatedAt(now);
            users.saveAndFlush(f);
            if (f.getLockedUntil() != null) audit.record("LOGIN_LOCKED", "app_user", f.getId(), "sign-in temporarily locked after repeated failures");
            return f.getLockedUntil();
        });
        if (until != null) throw locked(until, now);
        throw wrong;
    }
}
