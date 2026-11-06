package kh.school.sms.backup;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import kh.school.sms.common.ApiException;
import kh.school.sms.security.AuthUser;
import kh.school.sms.security.SetupState;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Backups and restores. The {@code /restore} endpoints are reachable without a session ONLY while no administrator exists yet
 * (setup mode), because restoring a backup is also how a new or reinstalled PC gets its data back: the wizard's first screen
 * offers it. Everything else always needs a signed-in user.
 */
@RestController
@RequestMapping("/api/v1/backups")
public class BackupController {
    /** Exactly one of the two: {@code fileName} of a file Electron copied into incoming/, or {@code backupId} of a backup already listed here. */
    public record StageRequest(String fileName, String backupId) {}
    public record CopyRequest(@NotBlank @Pattern(regexp = "^[0-9a-f]{64}$") String sha256) {}
    public record RestoreState(BackupService.Staged staged, BackupHistory.Restore lastRestore) {}

    private final BackupService backups;
    private final SetupState setup;

    public BackupController(BackupService backups, SetupState setup) {
        this.backups = backups;
        this.setup = setup;
    }

    /** Same rule as the public health check: open while in setup mode, a session afterwards. */
    private void sessionOrSetup(Authentication a) {
        boolean signedIn = a != null && a.getPrincipal() instanceof AuthUser;
        if (!signedIn && setup.usersExist()) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
    }

    @GetMapping
    public BackupService.Overview overview() { return backups.overview(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BackupService.BackupView create() { return backups.createManual(); }

    @PostMapping("/{id}/verify")
    public BackupService.BackupView verify(@PathVariable String id) { return backups.verify(id); }

    @PostMapping("/{id}/external-copy")
    public BackupService.BackupView externalCopy(@PathVariable String id, @Valid @RequestBody CopyRequest r) { return backups.recordExternalCopy(id, r.sha256()); }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        backups.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ---- restore ------------------------------------------------------------------------------------------------

    @GetMapping("/restore")
    public RestoreState restore(Authentication a) {
        sessionOrSetup(a);
        return new RestoreState(backups.staged().orElse(null), backups.lastRestore());
    }

    @PostMapping("/restore/stage")
    public BackupService.Staged stage(Authentication a, @RequestBody StageRequest r) {
        sessionOrSetup(a);
        boolean named = r.fileName() != null && !r.fileName().isBlank();
        boolean listed = r.backupId() != null && !r.backupId().isBlank();
        if (named == listed) throw ApiException.validation(named ? "backupId" : "fileName", named ? "INVALID" : "REQUIRED");   // exactly one of the two
        return listed ? backups.stageListed(r.backupId()) : backups.stage(r.fileName());
    }

    @PostMapping("/restore/apply")
    public BackupService.Staged apply(Authentication a) {
        sessionOrSetup(a);
        return backups.apply();
    }

    @DeleteMapping("/restore")
    public ResponseEntity<Void> cancel(Authentication a) {
        sessionOrSetup(a);
        backups.cancel();
        return ResponseEntity.noContent().build();
    }
}
