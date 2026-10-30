package kh.school.sms.common;

import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.Map;

/** A business error carrying a machine-readable code; the frontend maps codes to Khmer text. */
public class ApiException extends RuntimeException {
    public record FieldError(String field, String code) {}

    private final HttpStatus status;
    private final String code;
    private final List<FieldError> fieldErrors;
    private final Map<String, Object> extra;

    public ApiException(HttpStatus status, String code) { this(status, code, List.of(), Map.of()); }

    public ApiException(HttpStatus status, String code, List<FieldError> fieldErrors, Map<String, Object> extra) {
        super(code, null, false, false); // no stack trace: these are expected outcomes, not faults
        this.status = status;
        this.code = code;
        this.fieldErrors = fieldErrors;
        this.extra = extra;
    }

    public static ApiException validation(List<FieldError> errors) {
        return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", errors, Map.of());
    }

    public static ApiException validation(String field, String code) {
        return validation(List.of(new FieldError(field, code)));
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public List<FieldError> fieldErrors() { return fieldErrors; }
    public Map<String, Object> extra() { return extra; }
}
