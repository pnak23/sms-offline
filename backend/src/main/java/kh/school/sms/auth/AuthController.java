package kh.school.sms.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import kh.school.sms.common.ApiException;
import kh.school.sms.security.AuthUser;
import kh.school.sms.security.SetupState;
import kh.school.sms.settings.AppSettingsService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    public record UserDto(String username, String displayName) {
        static UserDto of(AppUser u) { return new UserDto(u.getUsername(), u.getDisplayName()); }
    }
    public record StatusResponse(boolean setupRequired, boolean authenticated, boolean recoveryKeyPending, boolean setupCompleted) {}
    public record SessionResponse(String token, UserDto user, boolean recoveryKeyPending) {}
    public record SetupResponse(String token, UserDto user, String recoveryKey) {}
    public record RecoverResponse(String username, String displayName, String recoveryKey) {}
    public record KeyResponse(String recoveryKey) {}

    public record SetupRequest(@NotBlank @Size(max = 100) String displayName, @NotBlank @Size(max = 100) String username,
                               @NotBlank @Size(max = 1000) String password) {}
    public record LoginRequest(@NotBlank @Size(max = 100) String username, @NotBlank @Size(max = 1000) String password) {}
    public record PasswordRequest(@NotBlank @Size(max = 1000) String password) {}
    public record ChangePasswordRequest(@NotBlank @Size(max = 1000) String currentPassword, @NotBlank @Size(max = 1000) String newPassword) {}
    public record RecoverRequest(@NotBlank @Size(max = 100) String recoveryKey, @NotBlank @Size(max = 1000) String newPassword) {}
    public record RegenerateRequest(@NotBlank @Size(max = 1000) String currentPassword) {}

    private final AuthService auth;
    private final SetupState setupState;
    private final AppSettingsService settings;

    public AuthController(AuthService auth, SetupState setupState, AppSettingsService settings) {
        this.auth = auth;
        this.setupState = setupState;
        this.settings = settings;
    }

    private static <T> ResponseEntity<T> noStore(HttpStatus status, T body) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(body);
    }

    private static AuthUser principal(Authentication a) {
        if (a == null || !(a.getPrincipal() instanceof AuthUser u)) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        return u;
    }

    private static String token(Authentication a) { return (String) a.getCredentials(); }

    @GetMapping("/status")
    public StatusResponse status(Authentication a) {
        boolean authenticated = a != null && a.getPrincipal() instanceof AuthUser;
        boolean pending = authenticated && auth.load((AuthUser) a.getPrincipal()).getRecoveryKeyConfirmedAt() == null;
        return new StatusResponse(!setupState.usersExist(), authenticated, pending,
                settings.get(AppSettingsService.SETUP_COMPLETED_AT).isPresent());
    }

    @PostMapping("/setup")
    public ResponseEntity<SetupResponse> setup(@Valid @RequestBody SetupRequest r) {
        AuthService.SetupResult res = auth.setup(r.displayName(), r.username(), r.password());
        return noStore(HttpStatus.CREATED, new SetupResponse(res.token(), UserDto.of(res.user()), res.recoveryKey()));
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest r) {
        AuthService.LoginResult res = auth.login(r.username(), r.password());
        return noStore(HttpStatus.OK, new SessionResponse(res.token(), UserDto.of(res.user()), res.user().getRecoveryKeyConfirmedAt() == null));
    }

    @GetMapping("/session")
    public SessionResponse session(Authentication a) {
        AppUser u = auth.load(principal(a));
        return new SessionResponse(null, UserDto.of(u), u.getRecoveryKeyConfirmedAt() == null);
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(Authentication a) {
        principal(a);
        auth.logout(token(a));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/unlock")
    public ResponseEntity<Void> unlock(Authentication a, @Valid @RequestBody PasswordRequest r) {
        auth.unlock(principal(a), r.password());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/change-password")
    public ResponseEntity<Void> changePassword(Authentication a, @Valid @RequestBody ChangePasswordRequest r) {
        auth.changePassword(principal(a), token(a), r.currentPassword(), r.newPassword());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recover")
    public ResponseEntity<RecoverResponse> recover(@Valid @RequestBody RecoverRequest r) {
        AuthService.RecoverResult res = auth.recover(r.recoveryKey(), r.newPassword());
        return noStore(HttpStatus.OK, new RecoverResponse(res.user().getUsername(), res.user().getDisplayName(), res.recoveryKey()));
    }

    @PostMapping("/recovery-key/confirm")
    public ResponseEntity<Void> confirm(Authentication a) {
        auth.confirmRecoveryKey(principal(a));
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recovery-key/regenerate")
    public ResponseEntity<KeyResponse> regenerate(Authentication a, @Valid @RequestBody RegenerateRequest r) {
        return noStore(HttpStatus.OK, new KeyResponse(auth.regenerateRecoveryKey(principal(a), r.currentPassword())));
    }
}
