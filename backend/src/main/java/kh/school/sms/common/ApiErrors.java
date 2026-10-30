package kh.school.sms.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import java.util.List;
import java.util.Map;

/**
 * RFC 9457 problem responses with a stable {@code code}. Messages are deliberately absent: the frontend owns all
 * user-facing wording. Nothing here logs request bodies (they can contain passwords or personal data).
 */
@RestControllerAdvice
public class ApiErrors {
    private static final Logger log = LoggerFactory.getLogger(ApiErrors.class);

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String code, List<ApiException.FieldError> fields,
                                                         Map<String, Object> extra) {
        ProblemDetail p = ProblemDetail.forStatus(status);
        p.setProperty("code", code);
        if (!fields.isEmpty()) p.setProperty("fieldErrors", fields);
        extra.forEach(p::setProperty);
        return ResponseEntity.status(status).body(p);
    }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException e) {
        return problem(e.status(), e.code(), e.fieldErrors(), e.extra());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validation(MethodArgumentNotValidException e) {
        List<ApiException.FieldError> fields = e.getBindingResult().getFieldErrors().stream()
                .map(f -> new ApiException.FieldError(f.getField(), String.valueOf(f.getCode()))).toList();
        return problem(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", fields, Map.of());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<ProblemDetail> badRequest(Exception e) {
        return problem(HttpStatus.BAD_REQUEST, "BAD_REQUEST", List.of(), Map.of());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<ProblemDetail> tooLarge(MaxUploadSizeExceededException e) {
        return problem(HttpStatus.CONTENT_TOO_LARGE, "FILE_TOO_LARGE", List.of(), Map.of());
    }

    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    ResponseEntity<ProblemDetail> stale(ObjectOptimisticLockingFailureException e) {
        return problem(HttpStatus.CONFLICT, "OPTIMISTIC_LOCK", List.of(), Map.of());
    }

    @ExceptionHandler(RuntimeException.class)
    ResponseEntity<ProblemDetail> fallback(RuntimeException e) {
        return SqliteConstraints.find(e).map(v -> {
            String code = switch (v.kind()) {
                case UNIQUE -> "DUPLICATE";
                case FOREIGN_KEY -> "REFERENCE_VIOLATION";
                case NOT_NULL -> "REQUIRED";
                default -> "CONSTRAINT_VIOLATION";
            };
            return problem(HttpStatus.CONFLICT, code, List.of(), v.detail() == null ? Map.of() : Map.of("detail", v.detail()));
        }).orElseGet(() -> {
            log.error("Unhandled error ({})", e.getClass().getName(), e); // class + stack only, never the request
            return problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", List.of(), Map.of());
        });
    }
}
