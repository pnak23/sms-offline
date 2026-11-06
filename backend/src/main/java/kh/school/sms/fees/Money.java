package kh.school.sms.fees;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Money is stored as a whole number of the currency's smallest unit (KHR: riel, no decimals; USD: cents, two decimals), never as a
 * floating-point number. The API speaks in ordinary units (12.50 dollars, 15000 riel).
 */
public final class Money {
    /** A sanity limit far above any school fee; it also keeps sums inside a long. */
    static final long MAX_MINOR = 1_000_000_000_000L;

    private Money() {}

    public static int decimals(String currency) {
        return switch (currency) {
            case "KHR" -> 0;
            case "USD" -> 2;
            default -> throw new IllegalArgumentException("unknown currency " + currency);
        };
    }

    /**
     * @param allowZero a default amount may be 0 ("ask each time"); an amount owed or paid may not
     * @throws ArithmeticException for a negative number, a zero where it is not allowed, more decimals than the currency has, or an absurd size
     */
    public static long toMinor(BigDecimal major, String currency, boolean allowZero) {
        if (major == null) throw new ArithmeticException("missing");
        if (major.signum() < 0 || (!allowZero && major.signum() == 0)) throw new ArithmeticException("sign");
        int d = decimals(currency);
        long minor = major.setScale(d, RoundingMode.UNNECESSARY).movePointRight(d).longValueExact();
        if (minor > MAX_MINOR) throw new ArithmeticException("range");
        return minor;
    }

    public static BigDecimal toMajor(long minor, String currency) {
        return BigDecimal.valueOf(minor, decimals(currency));
    }
}
