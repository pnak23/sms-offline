package spike.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import spike.SqliteConstraints;

import java.util.List;
import java.util.Map;

/** Backend returns machine-readable codes only; the frontend owns all (Khmer) wording. */
@RestControllerAdvice
public class ApiErrors {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException e) {
        ProblemDetail p = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
        p.setProperty("code", "VALIDATION_FAILED");
        List<Map<String, String>> fields = e.getBindingResult().getFieldErrors().stream()
                .map(f -> Map.of("field", f.getField(), "code", String.valueOf(f.getCode())))
                .toList();
        p.setProperty("fieldErrors", fields);
        return ResponseEntity.unprocessableEntity().body(p);
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<ProblemDetail> data(RuntimeException e) {
        return SqliteConstraints.find(e).map(v -> {
            ProblemDetail p = ProblemDetail.forStatus(HttpStatus.CONFLICT);
            p.setProperty("code", switch (v.kind()) {
                case UNIQUE -> "DUPLICATE";
                case FOREIGN_KEY -> "REFERENCE_VIOLATION";
                case NOT_NULL -> "REQUIRED";
                default -> "CONSTRAINT_VIOLATION";
            });
            if (v.detail() != null) p.setProperty("detail", v.detail());
            return ResponseEntity.status(HttpStatus.CONFLICT).body(p);
        }).orElseThrow(() -> e);
    }
}
