package kh.school.sms.bootstrap;

import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The codes Electron turns into Khmer error messages must stay stable. */
class StartupFailureTest {
    @Test
    void blockingHealthChecksKeepTheirCheckId() {
        Throwable t = new IllegalStateException("Failed to execute ApplicationRunner",
                new IllegalStateException("STARTUP_CHECK_FAILED:DISK_SPACE:DISK_SPACE_CRITICAL"));
        assertThat(StartupFailure.classify(t)).isEqualTo("DISK_SPACE");
    }

    @Test
    void knownProblemsMapToStableCodes() {
        assertThat(StartupFailure.classify(new IllegalStateException("SMS_DATA_DIR is not set"))).isEqualTo("DATA_DIR_UNAVAILABLE");
        assertThat(StartupFailure.classify(new IllegalStateException("x", new IllegalStateException("sms.launch-secret must be set")))).isEqualTo("LAUNCH_SECRET_MISSING");
        assertThat(StartupFailure.classify(new RuntimeException("[SQLITE_BUSY] The database file is locked (database is locked)"))).isEqualTo("DATABASE_LOCKED");
        assertThat(StartupFailure.classify(new RuntimeException("database disk image is malformed SQLITE_CORRUPT"))).isEqualTo("DATABASE_CORRUPT");
        assertThat(StartupFailure.classify(new FlywayException("Migration V3 failed"))).isEqualTo("MIGRATION_FAILED");
        assertThat(StartupFailure.classify(new FlywayException("Detected applied migration not resolved locally: 9"))).isEqualTo("SCHEMA_NEWER_THAN_APP");
        assertThat(StartupFailure.classify(new RuntimeException("something nobody anticipated"))).isEqualTo("STARTUP_FAILED");
    }
}
