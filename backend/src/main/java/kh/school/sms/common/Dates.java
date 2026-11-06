package kh.school.sms.common;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;

/** Dates from query strings and the "today" of the PC the school works on. */
public final class Dates {
    private Dates() {}

    /** A required ISO date (yyyy-MM-dd); anything else is a 422 on {@code field} with INVALID_DATE. */
    public static LocalDate require(String text, String field) {
        if (text == null || text.isBlank()) throw ApiException.validation(field, "REQUIRED");
        try {
            return LocalDate.parse(text.trim());
        } catch (DateTimeParseException e) {
            throw ApiException.validation(field, "INVALID_DATE");
        }
    }

    /** An optional ISO date: null when absent or blank. */
    public static LocalDate optional(String text, String field) {
        return text == null || text.isBlank() ? null : require(text, field);
    }

    /** Today's date on this PC (the clock is injected so tests can move it). */
    public static LocalDate today(Clock clock) { return LocalDate.now(clock.withZone(ZoneId.systemDefault())); }
}
