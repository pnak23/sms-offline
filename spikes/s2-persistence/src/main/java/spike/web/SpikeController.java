package spike.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import spike.AppUserRepository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;

@RestController
public class SpikeController {
    public record LoginRequest(@NotBlank String username, @NotBlank String password) {}
    public record EchoRequest(@NotBlank @Size(max = 100) String nameKm, @Past LocalDate dateOfBirth) {}
    public record EchoResponse(String nameKm, LocalDate dateOfBirth, Instant createdAt) {}

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final SessionRegistry sessions;
    private final JdbcTemplate jdbc;

    public SpikeController(AppUserRepository users, PasswordEncoder encoder, SessionRegistry sessions, JdbcTemplate jdbc) {
        this.users = users;
        this.encoder = encoder;
        this.sessions = sessions;
        this.jdbc = jdbc;
    }

    @GetMapping("/internal/health")
    public Map<String, String> health() { return Map.of("status", "UP"); }

    @PostMapping("/api/v1/auth/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest r) {
        return users.findByUsername(r.username())
                .filter(u -> encoder.matches(r.password(), u.getPasswordHash()))
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(Map.of("token", sessions.issue(u.getUsername()))))
                .orElseGet(() -> ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("code", "INVALID_CREDENTIALS")));
    }

    @GetMapping("/api/v1/me")
    public Map<String, String> me(Authentication auth) { return Map.of("username", String.valueOf(auth.getPrincipal())); }

    @PostMapping("/api/v1/echo")
    public EchoResponse echo(@Valid @RequestBody EchoRequest r) {
        return new EchoResponse(r.nameKm(), r.dateOfBirth(), Instant.parse("2026-10-30T08:15:30Z"));
    }

    /** Inserts a subject code that already exists -> UNIQUE violation, to exercise the error mapping end to end. */
    @PostMapping("/api/v1/dup")
    public Map<String, String> dup() {
        jdbc.update("INSERT INTO subjects (code, name_km, created_at, updated_at) VALUES ('KHMER', 'x', 'a', 'a')");
        return Map.of("status", "unexpected");
    }

    /** Deletes a grade referenced by nothing yet is allowed; used with a referenced row in the tests instead. */
    @PostMapping("/api/v1/orphan")
    public Map<String, String> orphan() {
        jdbc.update("INSERT INTO spike_child (parent_id, status) VALUES (999999, 'ACTIVE')");
        return Map.of("status", "unexpected");
    }
}
