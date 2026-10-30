package kh.school.sms.security;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Opaque 256-bit session tokens held in memory only: revocable, expiring lazily (no timer threads), and
 * deliberately lost on restart. Expiry: idle limit refreshed on use, plus an absolute limit.
 */
@Component
public class SessionRegistry {
    private record Session(AuthUser user, Instant issuedAt, Instant lastSeen) {}

    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final Clock clock;
    private final Duration idle;
    private final Duration absolute;

    public SessionRegistry(Clock clock, SessionProperties props) {
        this.clock = clock;
        this.idle = Duration.ofMinutes(props.idleMinutes());
        this.absolute = Duration.ofHours(props.absoluteHours());
    }

    public String issue(AuthUser user) {
        byte[] b = new byte[32];
        random.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        Instant now = clock.instant();
        sessions.put(token, new Session(user, now, now));
        return token;
    }

    /** Returns the user if the token is valid, refreshing its idle timer. */
    public Optional<AuthUser> validate(String token) {
        Session s = sessions.get(token);
        if (s == null) return Optional.empty();
        Instant now = clock.instant();
        if (Duration.between(s.lastSeen(), now).compareTo(idle) > 0 || Duration.between(s.issuedAt(), now).compareTo(absolute) > 0) {
            sessions.remove(token);
            return Optional.empty();
        }
        sessions.put(token, new Session(s.user(), s.issuedAt(), now));
        return Optional.of(s.user());
    }

    public void revoke(String token) { sessions.remove(token); }

    public void revokeAll() { sessions.clear(); }

    /** After a password change: sign every other window out, keep the one that made the change. */
    public void revokeAllExcept(long userId, String keepToken) {
        sessions.entrySet().removeIf(e -> e.getValue().user().id() == userId && !e.getKey().equals(keepToken));
    }
}
