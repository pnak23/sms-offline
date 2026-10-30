package kh.school.sms.bootstrap;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

/**
 * Dirty-shutdown marker (docs §4B). Created at start, removed by a JVM shutdown hook. A force-kill, crash or power loss
 * leaves it behind, so the next start knows to run the heavier integrity checks.
 */
public final class RunningLock {
    private RunningLock() {}

    public static void acquire() {
        Path lock = DataDirs.config().resolve("running.lock");
        try {
            if (Files.exists(lock)) StartupState.dirtyShutdown = true;
            Files.writeString(lock, ProcessHandle.current().pid() + " " + Instant.now() + "\n", StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot write " + lock, e);
        }
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            try { Files.deleteIfExists(lock); } catch (IOException ignored) { /* next start will flag it as dirty */ }
        }, "running-lock-release"));
    }
}
