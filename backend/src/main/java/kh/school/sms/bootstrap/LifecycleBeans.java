package kh.school.sms.bootstrap;

import kh.school.sms.backup.BackupException;
import kh.school.sms.backup.BackupService;
import kh.school.sms.backup.BackupStore;
import kh.school.sms.backup.Kind;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.Clock;

/** Start-up timing for Flyway, the READY line Electron waits for, and the graceful shutdown endpoint's worker. */
@Configuration
public class LifecycleBeans {

    /**
     * Before an upgrade changes an existing database, a verified backup of it is made. If that cannot be made (no room on the
     * disk, say) the upgrade does not run: the old program's data is not put at risk for a new version.
     */
    @Bean
    FlywayMigrationStrategy timedMigration(DataSource dataSource) {
        return (Flyway flyway) -> {
            long t0 = System.nanoTime();
            if (flyway.info().current() != null && flyway.info().pending().length > 0) {
                try (Connection c = dataSource.getConnection()) {
                    new BackupStore(DataDirs.root(), Clock.systemUTC()).create(c, Kind.PRE_MIGRATION);
                } catch (BackupException | SQLException e) {
                    throw new BackupException("PRE_MIGRATION_BACKUP_FAILED", e);
                }
            }
            flyway.migrate();
            StartupState.flywayMs = (System.nanoTime() - t0) / 1_000_000;
        };
    }

    /** Electron reads this single stdout line to learn the real port (server.port=0). */
    @Component
    static class ReadySignal {
        private static final Logger log = LoggerFactory.getLogger(ReadySignal.class);
        private final Environment env;
        private final Flyway flyway;

        ReadySignal(Environment env, Flyway flyway) {
            this.env = env;
            this.flyway = flyway;
        }

        @EventListener
        void onReady(ApplicationReadyEvent e) {
            String port = env.getProperty("local.server.port", "0");
            ProductInfo p = ProductInfo.get();   // the version is in every log, so a log sent for help says which release it came from
            log.info("{} {} ({}) ready, database schema {}", p.shortName(), p.version(), p.channel(),
                    flyway.info().current() == null ? "none" : flyway.info().current().getVersion().getVersion());
            long ms = System.currentTimeMillis() - StartupState.mainEnteredAt;
            System.out.println("SMS_READY {\"port\":" + port + ",\"startupMs\":" + ms + "}");
            System.out.flush();
        }
    }

    @Component
    public static class ShutdownService {
        private final ConfigurableApplicationContext ctx;
        private final ObjectProvider<BackupService> backups;

        ShutdownService(ConfigurableApplicationContext ctx, ObjectProvider<BackupService> backups) {
            this.ctx = ctx;
            this.backups = backups;
        }

        /**
         * Returns immediately; makes the automatic backup if one is due, closes the context (Hikari -> WAL checkpoint) and exits on
         * another thread.
         *
         * @return true when a backup runs first, so the caller knows to wait longer than for a plain close
         */
        public boolean requestShutdown() {
            BackupService b = backups.getIfAvailable();
            boolean backingUp = b != null && b.autoBackupDueOnClose();
            Thread t = new Thread(() -> {
                if (b != null) b.runOnClose();   // never throws: closing always completes
                int code = SpringApplication.exit(ctx, () -> 0);
                System.exit(code);
            }, "graceful-shutdown");
            t.setDaemon(false);
            t.start();
            return backingUp;
        }
    }
}
