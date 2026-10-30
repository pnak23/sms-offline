package kh.school.sms.common;

import java.text.Normalizer;

/**
 * Shared normalisation so equal-looking Khmer text compares and searches equal (docs §9): NFC, trimmed, collapsed
 * spaces; names also lose zero-width spaces (typed as word separators). Free text (addresses, notes) keeps them
 * because they help line breaking.
 */
public final class KhmerText {
    private static final char ZWSP = '​';
    private static final char[] KHMER_DIGITS = "០១២៣៤៥៦៧៨៩".toCharArray();

    private KhmerText() {}

    public static String name(String s) {
        if (s == null) return null;
        String t = Normalizer.normalize(s, Normalizer.Form.NFC).replace(String.valueOf(ZWSP), "");
        t = t.replaceAll("\\s+", " ").trim();
        return t.isEmpty() ? null : t;
    }

    public static String free(String s) {
        if (s == null) return null;
        String t = Normalizer.normalize(s, Normalizer.Form.NFC).trim();
        return t.isEmpty() ? null : t;
    }

    /** Khmer digits (០–៩) to ASCII digits, for phone numbers and numeric search. */
    public static String asciiDigits(String s) {
        if (s == null) return null;
        StringBuilder b = new StringBuilder(s.length());
        for (char c : s.toCharArray()) {
            int idx = -1;
            for (int i = 0; i < KHMER_DIGITS.length; i++) if (KHMER_DIGITS[i] == c) { idx = i; break; }
            b.append(idx >= 0 ? (char) ('0' + idx) : c);
        }
        return b.toString();
    }
}
