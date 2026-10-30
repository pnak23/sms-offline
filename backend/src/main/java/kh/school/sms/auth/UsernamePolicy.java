package kh.school.sms.auth;

import kh.school.sms.common.ApiException.FieldError;

import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** Usernames: 3–32 characters, letters (incl. Khmer, with its combining marks), digits, dot, underscore, hyphen. */
public final class UsernamePolicy {
    private static final Pattern VALID = Pattern.compile("^[\\p{L}\\p{M}\\p{N}._-]{3,32}$");

    private UsernamePolicy() {}

    /** NFC, trimmed, lower-cased: the form stored and compared. */
    public static String normalize(String username) {
        if (username == null) return "";
        return Normalizer.normalize(username, Normalizer.Form.NFC).trim().toLowerCase(Locale.ROOT);
    }

    public static List<FieldError> validate(String normalized) {
        if (normalized.isEmpty()) return List.of(new FieldError("username", "REQUIRED"));
        return VALID.matcher(normalized).matches() ? List.of() : List.of(new FieldError("username", "USERNAME_INVALID"));
    }
}
