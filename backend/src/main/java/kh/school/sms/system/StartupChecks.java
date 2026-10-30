package kh.school.sms.system;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/**
 * Layer 2 of the health check (docs §4B): runs after Flyway and before the READY line. A failed blocking check stops
 * the start with a specific code that Electron turns into a Khmer error window.
 */
@Component
public class StartupChecks implements ApplicationRunner {
    private final HealthService health;

    public StartupChecks(HealthService health) { this.health = health; }

    @Override
    public void run(ApplicationArguments args) {
        for (HealthService.Check c : health.quick().checks()) {
            if (HealthService.BLOCKING.contains(c.id()) && c.status().equals("FAIL")) {
                throw new IllegalStateException("STARTUP_CHECK_FAILED:" + c.id() + ":" + c.code());
            }
        }
    }
}
