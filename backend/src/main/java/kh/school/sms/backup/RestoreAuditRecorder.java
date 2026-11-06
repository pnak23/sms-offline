package kh.school.sms.backup;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** After the migrations ran on the (possibly just restored) database, writes down how the last restore ended. */
@Component
class RestoreAuditRecorder implements ApplicationRunner {
    private final BackupService backups;

    RestoreAuditRecorder(BackupService backups) { this.backups = backups; }

    @Override
    public void run(ApplicationArguments args) { backups.recordRestoreOutcome(); }
}
