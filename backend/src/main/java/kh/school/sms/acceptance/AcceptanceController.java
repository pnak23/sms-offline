package kh.school.sms.acceptance;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import kh.school.sms.security.AuthUser;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/** The readiness list (Settings > About) and the administrator's sign-off of each item. */
@RestController
@RequestMapping("/api/v1/acceptance")
public class AcceptanceController {
    public record SignOffRequest(@Size(max = 300) String note) {}

    private final AcceptanceService acceptance;

    public AcceptanceController(AcceptanceService acceptance) { this.acceptance = acceptance; }

    @GetMapping
    public List<AcceptanceService.View> list() { return acceptance.list(); }

    @PostMapping("/{id}/sign-off")
    public AcceptanceService.View signOff(@PathVariable String id, @Valid @RequestBody(required = false) SignOffRequest r, Authentication a) {
        return acceptance.signOff(id, r == null ? null : r.note(), (AuthUser) a.getPrincipal());
    }

    @DeleteMapping("/{id}/sign-off")
    public ResponseEntity<Void> withdraw(@PathVariable String id) {
        acceptance.withdraw(id);
        return ResponseEntity.noContent().build();
    }
}
