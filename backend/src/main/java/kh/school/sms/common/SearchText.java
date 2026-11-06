package kh.school.sms.common;

/** Turns what the user typed into a LIKE pattern that matches the way names are stored (docs §9). */
public final class SearchText {
    private SearchText() {}

    /**
     * "%text%" for use with {@code ESCAPE '\'}: normalised like a stored name (NFC, no zero-width spaces, collapsed
     * spaces), Khmer digits turned into ASCII (phone numbers, codes), and the wildcards % _ \ taken literally.
     * Null when there is nothing to search for.
     */
    public static String contains(String raw) {
        String t = KhmerText.name(raw);
        if (t == null) return null;
        t = KhmerText.asciiDigits(t).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + t + "%";
    }
}
