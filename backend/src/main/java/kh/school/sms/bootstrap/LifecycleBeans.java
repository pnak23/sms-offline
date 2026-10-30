package kh.school.sms.bootstrap;

import org.flywaydb.core.Flyway;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Start-up timing for Flyway, the READY line Electron waits for, and the graceful shutdown endpoint's worker. */
@Configuration
public class LifecycleBeans {

    @Bean
    FlywayMigrationStrategy timedMigration() {
        return (Flyway flyway) -> {
            long t0 = System.nanoTime();
            flyway.migrate();
            StartupState.flywayMs = (System.nanoTime() - t0) / 1_000_000;
        };
    }

    /** Electron reads this single stdout line to learn the real port (server.port=0). */
    @Component
    static class ReadySignal {
        private final Environment env;
        ReadySignal(Environment env) { this.env = env; }

        @EventListener
        void onReady(ApplicationReadyEvent e) {
            String port = env.getProperty("local.server.port", "0");
            long ms = System.currentTimeMillis() - StartupState.mainEnteredAt;
            System.out.println("SMS_READY {\"port\":" + port + ",\"startupMs\":" + ms + "}");
            System.out.flush();
        }
    }

    @Component
    public static class ShutdownService {
        private final ConfigurableApplicationContext ctx;
        ShutdownService(ConfigurableApplicationContext ctx) { this.ctx = ctx; }

        /** Returns immediately; closes the context (Hikari -> WAL checkpoint) and exits on another thread. */
        public void requestShutdown() {
            Thread t = new Thread(() -> {
                int code = SpringApplication.exit(ctx, () -> 0);
                System.exit(code);
            }, "graceful-shutdown");
            t.setDaemon(false);
            t.start();
        }
    }
}
