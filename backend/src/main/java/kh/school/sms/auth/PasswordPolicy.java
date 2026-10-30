package kh.school.sms.auth;

import kh.school.sms.common.ApiException.FieldError;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Approved default 2: at least 8 characters, at most 72 UTF-8 bytes (BCrypt's limit — about 24 Khmer characters),
 * no composition rules; only a small weak-password list and "not the same as the username".
 */
public final class PasswordPolicy {
    public static final int MIN_CHARS = 8;
    public static final int MAX_BYTES = 72;

    private PasswordPolicy() {}

    private static final class WeakList {
        static final Set<String> VALUES = load();

        private static Set<String> load() {
            Set<String> s = new HashSet<>();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(
                    PasswordPolicy.class.getResourceAsStream("/weak-passwords.txt"), StandardCharsets.UTF_8))) {
                for (String line; (line = r.readLine()) != null; ) {
                    String t = line.trim().toLowerCase(Locale.ROOT);
                    if (!t.isEmpty()) s.add(t);
                }
            } catch (IOException | NullPointerException e) {
                throw new IllegalStateException("weak-passwords.txt is missing from the application", e);
            }
            return s;
        }
    }

    public static int utf8Bytes(String s) { return s.getBytes(StandardCharsets.UTF_8).length; }

    /** @return empty when acceptable; otherwise field errors on "password" (or "newPassword" via {@code field}) */
    public static List<FieldError> validate(String field, String password, String normalizedUsername) {
        List<FieldError> errors = new ArrayList<>();
        if (password == null || password.isEmpty()) {
            errors.add(new FieldError(field, "REQUIRED"));
            return errors;
        }
        if (password.codePointCount(0, password.length()) < MIN_CHARS) errors.add(new FieldError(field, "PASSWORD_TOO_SHORT"));
        if (utf8Bytes(password) > MAX_BYTES) errors.add(new FieldError(field, "PASSWORD_TOO_LONG"));
        if (WeakList.VALUES.contains(password.toLowerCase(Locale.ROOT))) errors.add(new FieldError(field, "PASSWORD_WEAK"));
        if (normalizedUsername != null && password.toLowerCase(Locale.ROOT).equals(normalizedUsername)) {
            errors.add(new FieldError(field, "PASSWORD_EQUALS_USERNAME"));
        }
        return errors;
    }
}
