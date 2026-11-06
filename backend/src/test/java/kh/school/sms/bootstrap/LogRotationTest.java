package kh.school.sms.bootstrap;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.joran.JoranConfigurator;
import ch.qos.logback.classic.util.LogbackMDCAdapter;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The shipped logback-spring.xml, loaded as it is: backend.log rolls at about 10 MB and keeps five older files, never more.
 *
 * <p>Logback does not look at the file size on every line: it checks once per {@code checkIncrement} (one second in the shipped
 * file). A real log is a few lines a minute, so the size is exact in practice. This test writes ten megabytes in a blink, so it
 * pauses between chunks and asserts only what must hold whichever line a roll happens on: six files, each about 10 MB, the
 * oldest data gone, the newest line in the live file.
 */
class LogRotationTest {
    static final long TEN_MB = 10L * 1024 * 1024;

    @Test
    void theShippedConfigurationRollsAtAboutTenMegabytesAndKeepsExactlyFiveOlderFiles() throws Exception {
        Path dir = Files.createTempDirectory("sms កំណត់ហេតុ ");
        LoggerContext ctx = new LoggerContext();
        ctx.setMDCAdapter(new LogbackMDCAdapter());   // a stand-alone context has none; Spring Boot supplies it in the real application
        try {
            ctx.putProperty("LOG_FILE", dir.resolve("backend.log").toString().replace('\\', '/'));
            JoranConfigurator jc = new JoranConfigurator();
            jc.setContext(ctx);
            jc.doConfigure(LogRotationTest.class.getResource("/logback-spring.xml"));
            ctx.getLogger(Logger.ROOT_LOGGER_NAME).detachAppender("CONSOLE");   // 80 MB on the test console helps nobody

            Logger log = ctx.getLogger("rotation-test");
            String filler = "ខ្ញុំ".repeat(400) + "-" + "x".repeat(3900);   // about 10 KB per line: Khmer and ASCII
            int chunks = 8;                                                   // 8 x 10.5 MB: more than the six files can hold
            for (int chunk = 1; chunk <= chunks; chunk++) {
                for (int i = 0; i < 1050; i++) log.info("chunk={} line={} {}", chunk, i, filler);
                Thread.sleep(1200);   // longer than checkIncrement: Logback's size check runs on the next line
            }
            log.info("chunk={} line=last", chunks);   // the check after the last pause rolls the last full chunk
            ctx.stop();

            List<String> names;
            try (Stream<Path> s = Files.list(dir)) { names = s.map(p -> p.getFileName().toString()).sorted().toList(); }
            String problems = ctx.getStatusManager().getCopyOfStatusList().stream().filter(st -> st.getLevel() > 0).map(Object::toString).collect(Collectors.joining(" | "));
            assertThat(names).as("logback problems: " + problems)
                    .containsExactly("backend.log", "backend.log.1", "backend.log.2", "backend.log.3", "backend.log.4", "backend.log.5");

            for (String n : names.subList(1, names.size())) {
                assertThat(Files.size(dir.resolve(n))).as(n + " was rolled at about 10 MB").isBetween(TEN_MB, TEN_MB + (2L << 20));
            }
            assertThat(Files.size(dir.resolve("backend.log"))).as("the live file never grows far past the limit").isLessThan(TEN_MB + (2L << 20));

            for (String n : names) {
                try (Stream<String> lines = Files.lines(dir.resolve(n), StandardCharsets.UTF_8)) {
                    assertThat(lines.anyMatch(l -> l.contains("chunk=1 ") || l.contains("chunk=2 "))).as(n + " no longer holds the oldest data").isFalse();
                }
            }
            try (Stream<String> lines = Files.lines(dir.resolve("backend.log"), StandardCharsets.UTF_8)) {
                assertThat(lines.anyMatch(l -> l.contains("chunk=" + chunks + " line=last"))).as("the newest line is in the live file").isTrue();
            }
            try (Stream<String> lines = Files.lines(dir.resolve("backend.log.1"), StandardCharsets.UTF_8)) {
                assertThat(lines.anyMatch(l -> l.contains("ខ្ញុំ"))).as("Khmer is written and read back as UTF-8").isTrue();
            }
        } finally {
            ctx.stop();
            try (Stream<Path> s = Files.walk(dir)) { s.sorted(java.util.Comparator.reverseOrder()).forEach(p -> p.toFile().delete()); }
        }
    }
}
