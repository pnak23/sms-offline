package kh.school.sms.setup;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import kh.school.sms.audit.AuditService;
import kh.school.sms.auth.AppUserRepository;
import kh.school.sms.common.ApiException;
import kh.school.sms.security.AuthUser;
import kh.school.sms.settings.AppSettingsService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;

/** Wizard progress lives in the database (never browser storage), so it survives restarts and travels in backups. */
@RestController
@RequestMapping("/api/v1/setup")
public class SetupController {
    public record Progress(int step, boolean completed) {}
    public record ProgressRequest(@Min(1) @Max(7) int step) {}

    private final AppSettingsService settings;
    private final AppUserRepository users;
    private final AuditService audit;
    private final Clock clock;

    public SetupController(AppSettingsService settings, AppUserRepository users, AuditService audit, Clock clock) {
        this.settings = settings;
        this.users = users;
        this.audit = audit;
        this.clock = clock;
    }

    private Progress progress() {
        int step = settings.get(AppSettingsService.SETUP_STEP).map(Integer::parseInt).orElse(1);
        return new Progress(step, settings.get(AppSettingsService.SETUP_COMPLETED_AT).isPresent());
    }

    @GetMapping("/progress")
    public Progress get() { return progress(); }

    @PutMapping("/progress")
    public Progress put(@Valid @RequestBody ProgressRequest r) {
        settings.put(AppSettingsService.SETUP_STEP, String.valueOf(r.step()));
        return progress();
    }

    /** Steps 2–3 are mandatory (approved default 9): the account exists, and the recovery key was confirmed as saved. */
    @PostMapping("/complete")
    public ResponseEntity<Progress> complete(Authentication a) {
        long id = ((AuthUser) a.getPrincipal()).id();
        boolean confirmed = users.findById(id).orElseThrow().getRecoveryKeyConfirmedAt() != null;
        if (!confirmed) throw new ApiException(HttpStatus.CONFLICT, "RECOVERY_KEY_NOT_CONFIRMED");
        if (settings.get(AppSettingsService.SETUP_COMPLETED_AT).isEmpty()) {
            settings.put(AppSettingsService.SETUP_COMPLETED_AT, clock.instant().toString());
            audit.record("SETUP_COMPLETED", "setup", null, "first-launch wizard completed");
        }
        return ResponseEntity.ok(progress());
    }
}
