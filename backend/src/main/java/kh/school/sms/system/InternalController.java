package kh.school.sms.system;

import kh.school.sms.bootstrap.LifecycleBeans.ShutdownService;
import kh.school.sms.bootstrap.StartupState;
import org.flywaydb.core.Flyway;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/** Layer 1 of the health check, used by Electron only. Protected by the launch secret, no session needed. */
@RestController
@RequestMapping("/internal")
public class InternalController {
    private final Flyway flyway;
    private final ShutdownService shutdown;

    public InternalController(Flyway flyway, ShutdownService shutdown) {
        this.flyway = flyway;
        this.shutdown = shutdown;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        var current = flyway.info().current();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("status", "UP");
        m.put("appVersion", StartupState.APP_VERSION);
        m.put("schemaVersion", current == null ? "0" : current.getVersion().getVersion());
        m.put("startedAt", Instant.ofEpochMilli(StartupState.jvmStartedAt()).toString());
        m.put("startup", StartupState.timings());
        return m;
    }

    /** Windows has no SIGTERM, so Electron asks nicely here first (closes the pool => WAL checkpoint). */
    @PostMapping("/shutdown")
    public ResponseEntity<Map<String, Object>> shutdown() {
        boolean backingUp = shutdown.requestShutdown();   // an automatic backup runs first when one is due: Electron then waits longer
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "SHUTTING_DOWN", "backingUp", backingUp));
    }
}
