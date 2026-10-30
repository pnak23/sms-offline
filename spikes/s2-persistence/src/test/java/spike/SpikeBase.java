package spike;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** One shared Spring context (random loopback port, temp SQLite file) for all spike tests. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "sms.launch-secret=test-launch-secret-0123456789",
        "spring.flyway.locations=classpath:db/migration,classpath:db/spike"
})
abstract class SpikeBase {

    static final Path DB = tempFile("s2-main-", ".db");
    /** Application connections: FK enforcement ON, WAL, busy timeout, IMMEDIATE transactions. */
    static final String APP_PARAMS = "?foreign_keys=on&journal_mode=WAL&busy_timeout=5000&synchronous=NORMAL&transaction_mode=IMMEDIATE";
    /** Flyway gets its own connection with foreign_keys OFF (SQLite default) so table rebuilds work. */
    static final String FLYWAY_PARAMS = "?journal_mode=WAL&busy_timeout=5000";

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", () -> "jdbc:sqlite:" + fwd(DB) + APP_PARAMS);
        r.add("spring.flyway.url", () -> "jdbc:sqlite:" + fwd(DB) + FLYWAY_PARAMS);
    }

    static void say(String s) { System.out.println("SPIKE: " + s); }

    static String fwd(Path p) { return p.toAbsolutePath().toString().replace('\\', '/'); }

    static Path tempFile(String prefix, String suffix) {
        try {
            Path p = Files.createTempFile(prefix, suffix);
            p.toFile().deleteOnExit();
            return p;
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }
}
