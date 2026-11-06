package kh.school.sms.fees;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import kh.school.sms.common.Dates;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/v1/fees")
public class FeeController {
    public record CategoryRequest(@NotBlank @Size(max = 100) String nameKm, BigDecimal defaultAmount, String currency) {}
    public record CategoryUpdateRequest(@NotBlank @Size(max = 100) String nameKm, BigDecimal defaultAmount, String currency, long version) {}
    /** Boxed on purpose: a missing flag is a 422, not Jackson's 400 for a missing primitive. */
    public record ActiveRequest(@NotNull Boolean active, long version) {}
    public record ChargeRequest(@NotNull Long enrollmentId, @NotNull Long categoryId, BigDecimal amount, String dueDate, @Size(max = 200) String note) {}
    public record ClassChargeRequest(@NotNull Long classId, @NotNull Long categoryId, BigDecimal amount, String dueDate, @Size(max = 200) String note) {}
    public record ChargeUpdateRequest(@NotNull BigDecimal amount, String dueDate, @Size(max = 200) String note, long version) {}
    public record PaymentRequest(@NotNull BigDecimal amount, @NotBlank String paidOn, String method, @Size(max = 100) String reference) {}
    public record VoidRequest(@Size(max = 200) String reason) {}

    private final FeeService fees;

    public FeeController(FeeService fees) { this.fees = fees; }

    @GetMapping("/categories")
    public List<FeeService.Category> categories() { return fees.categories(); }

    @PostMapping("/categories")
    @ResponseStatus(HttpStatus.CREATED)
    public FeeService.Category createCategory(@Valid @RequestBody CategoryRequest r) { return fees.createCategory(r.nameKm(), r.defaultAmount(), r.currency()); }

    @PutMapping("/categories/{id}")
    public FeeService.Category updateCategory(@PathVariable long id, @Valid @RequestBody CategoryUpdateRequest r) {
        return fees.updateCategory(id, r.nameKm(), r.defaultAmount(), r.currency(), r.version());
    }

    @PutMapping("/categories/{id}/active")
    public FeeService.Category setActive(@PathVariable long id, @Valid @RequestBody ActiveRequest r) { return fees.setCategoryActive(id, r.active(), r.version()); }

    @GetMapping("/class")
    public FeeService.ClassSummary classSummary(@RequestParam long classId) { return fees.classSummary(classId); }

    @GetMapping("/enrollments/{enrollmentId}")
    public FeeService.Ledger ledger(@PathVariable long enrollmentId) { return fees.ledger(enrollmentId); }

    @PostMapping("/charges")
    @ResponseStatus(HttpStatus.CREATED)
    public FeeService.Charge charge(@Valid @RequestBody ChargeRequest r) {
        return fees.charge(r.enrollmentId(), r.categoryId(), r.amount(), Dates.optional(r.dueDate(), "dueDate"), r.note());
    }

    @PostMapping("/charges/class")
    public FeeService.BulkResult chargeClass(@Valid @RequestBody ClassChargeRequest r) {
        return fees.chargeClass(r.classId(), r.categoryId(), r.amount(), Dates.optional(r.dueDate(), "dueDate"), r.note());
    }

    @PutMapping("/charges/{id}")
    public FeeService.Charge updateCharge(@PathVariable long id, @Valid @RequestBody ChargeUpdateRequest r) {
        return fees.updateCharge(id, r.amount(), Dates.optional(r.dueDate(), "dueDate"), r.note(), r.version());
    }

    @DeleteMapping("/charges/{id}")
    public ResponseEntity<Void> deleteCharge(@PathVariable long id) {
        fees.deleteCharge(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/charges/{id}/payments")
    @ResponseStatus(HttpStatus.CREATED)
    public FeeService.Payment pay(@PathVariable long id, @Valid @RequestBody PaymentRequest r) {
        return fees.pay(id, r.amount(), Dates.require(r.paidOn(), "paidOn"), r.method(), r.reference());
    }

    @PostMapping("/payments/{id}/void")
    public FeeService.Payment voidPayment(@PathVariable long id, @Valid @RequestBody VoidRequest r) { return fees.voidPayment(id, r.reason()); }

    @GetMapping("/payments/{id}/receipt")
    public FeeService.Receipt receipt(@PathVariable long id) { return fees.receipt(id); }
}
