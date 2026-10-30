package kh.school.sms.auth;

import java.security.SecureRandom;
import java.util.Locale;
import java.util.Optional;

/**
 * Recovery key: 25 characters of Crockford Base32 (no I, L, O, U) = 125 bits from {@link SecureRandom}, shown as
 * XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (docs §4A.2). Only a BCrypt hash of the normalised key is ever stored.
 */
public final class RecoveryKeys {
    static final String ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    public static final int LENGTH = 25;
    private static final SecureRandom RANDOM = new SecureRandom();

    private RecoveryKeys() {}

    public static String generate() {
        char[] c = new char[LENGTH];
        for (int i = 0; i < LENGTH; i++) c[i] = ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length()));
        return new String(c);
    }

    /** XXXXX-XXXXX-XXXXX-XXXXX-XXXXX */
    public static String format(String key) {
        StringBuilder b = new StringBuilder(LENGTH + 4);
        for (int i = 0; i < key.length(); i++) {
            if (i > 0 && i % 5 == 0) b.append('-');
            b.append(key.charAt(i));
        }
        return b.toString();
    }

    /**
     * Case-insensitive; dashes and spaces ignored; the look-alikes O -> 0 and I/L -> 1 are mapped (Crockford).
     * Empty when the input cannot be a valid key (wrong length or characters), so callers never hash junk.
     */
    public static Optional<String> normalize(String input) {
        if (input == null) return Optional.empty();
        StringBuilder b = new StringBuilder(LENGTH);
        for (char ch : input.toUpperCase(Locale.ROOT).toCharArray()) {
            if (ch == '-' || Character.isWhitespace(ch)) continue;
            if (ch == 'O') ch = '0';
            else if (ch == 'I' || ch == 'L') ch = '1';
            if (ALPHABET.indexOf(ch) < 0) return Optional.empty();
            b.append(ch);
        }
        return b.length() == LENGTH ? Optional.of(b.toString()) : Optional.empty();
    }
}
