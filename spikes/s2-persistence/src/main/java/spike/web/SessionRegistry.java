package spike.web;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** Opaque 256-bit session tokens held in memory only: revocable, idle-expiring, lost on restart by design. */
@Component
public class SessionRegistry {
    private record Session(String username, Instant lastSeen) {}

    private final SecureRandom random = new SecureRandom();
    private final ConcurrentHashMap<String, Session> sessions = new ConcurrentHashMap<>();
    private final Duration idle = Duration.ofMinutes(30);

    public String issue(String username) {
        byte[] b = new byte[32];
        random.nextBytes(b);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(b);
        sessions.put(token, new Session(username, Instant.now()));
        return token;
    }

    /** Returns the username if the token is valid, refreshing its idle timer (lazy expiry; no timer threads). */
    public Optional<String> validate(String token) {
        Session s = sessions.get(token);
        if (s == null) return Optional.empty();
        if (Duration.between(s.lastSeen(), Instant.now()).compareTo(idle) > 0) {
            sessions.remove(token);
            return Optional.empty();
        }
        sessions.put(token, new Session(s.username(), Instant.now()));
        return Optional.of(s.username());
    }

    public void revokeAll() { sessions.clear(); }
}
