package kh.school.sms.backup;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The owner's backup policy of 2026-11-05: local backups on the laptop are the primary method; automatic backups happen ONLY when the program closes normally (or before an upgrade or a
 * restore); there is NO scheduled background timer; a copy to a USB stick is only ever a manual, optional action; and nothing goes to the cloud or the internet. The behaviour is proved by
 * the flow tests; this keeps the SOURCE honest, so that no change can quietly add a timer, an automatic USB copy or a network call to the backup code.
 */
class BackupPolicyTest {
    private static Path sources() {
        Path here = Path.of("src", "main", "java", "kh", "school", "sms");
        return Files.isDirectory(here) ? here : Path.of("backend").resolve(here);
    }

    private static List<Path> javaFiles(String... packages) throws IOException {
        List<Path> out = new ArrayList<>();
        for (String pkg : packages) {
            Path dir = sources().resolve(pkg);
            if (!Files.isDirectory(dir)) continue;
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.filter(p -> p.toString().endsWith(".java")).forEach(out::add);
            }
        }
        return out;
    }

    private static String text(Path p) {
        try {
            return Files.readString(p, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void thereIsNoScheduledBackgroundTimerAnywhereInTheBackend() throws IOException {
        List<Path> all = javaFiles("");
        assertThat(all.size()).as("the scan found the backend's sources").isGreaterThan(50);
        List<String> found = new ArrayList<>();
        for (Path p : all) {
            String t = text(p);
            for (String marker : List.of("@Scheduled", "@EnableScheduling", "ScheduledExecutorService", "newScheduledThreadPool", "java.util.Timer", "TimerTask", "scheduleAtFixedRate", "scheduleWithFixedDelay", "CronTrigger")) {
                if (t.contains(marker)) found.add(p.getFileName() + ": " + marker);
            }
        }
        assertThat(found).as("automatic backups happen when the program closes normally (or before an upgrade or a restore), never on a timer").isEmpty();
    }

    @Test
    void theBackupCodeNeverReachesTheInternetAndNeverCopiesToAUsbStickByItself() throws IOException {
        List<Path> backupCode = javaFiles("backup");
        assertThat(backupCode.size()).as("the scan found the backup code").isGreaterThan(5);
        List<String> found = new ArrayList<>();
        for (Path p : backupCode) {
            String t = text(p);
            for (String marker : List.of("java.net.http", "HttpClient", "HttpURLConnection", "URLConnection", "java.net.Socket", "RestTemplate", "WebClient", "amazonaws", "googleapis", "dropbox", "onedrive", "s3://")) {
                if (t.contains(marker)) found.add(p.getFileName() + ": " + marker);
            }
        }
        assertThat(found).as("no cloud and no internet backup").isEmpty();
        // the backend never receives a path and never chooses a USB stick: the copy is made by the desktop shell after the person picks a folder, and only then recorded here
        String service = text(sources().resolve("backup").resolve("BackupService.java"));
        assertThat(service).as("a copy elsewhere is only RECORDED here, after the person made it").contains("recordExternalCopy");
        assertThat(service).doesNotContain("Files.copy(").doesNotContain("FileStore").doesNotContain("getRootDirectories");
    }

    @Test
    void anAutomaticBackupIsOnlyMadeWhenTheProgramClosesOrBeforeAnUpgradeOrARestore() throws IOException {
        // every place that creates a backup of the AUTO kind, by name
        List<String> callers = new ArrayList<>();
        for (Path p : javaFiles("")) {
            String t = text(p);
            if (t.contains("Kind.AUTO") && !p.getFileName().toString().startsWith("BackupStore")) callers.add(p.getFileName().toString());
        }
        assertThat(callers).as("Kind.AUTO is created in BackupService.runOnClose and nowhere else outside the store itself").containsExactly("BackupService.java");
        String service = text(sources().resolve("backup").resolve("BackupService.java"));
        assertThat(service.split("Kind\\.AUTO", -1).length - 1).as("one use, inside runOnClose").isEqualTo(1);
        assertThat(service.indexOf("Kind.AUTO")).isGreaterThan(service.indexOf("public void runOnClose()"));
    }
}
