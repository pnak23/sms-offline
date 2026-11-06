package kh.school.sms.exam;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The arithmetic of a result, with no database in it so it can be tested on its own (docs D5: scores are scaled integers and
 * every average is computed here with BigDecimal, never in SQL floats).
 *
 * Rules (defaults, to be confirmed against the school's real report card):
 *  - a subject that is marked ABSENT counts as 0 in the total and the average, and is flagged;
 *  - a subject with nothing entered yet makes the result INCOMPLETE: no percentage, band, pass/fail or rank until it is entered;
 *  - the percentage is the weighted score over the weighted maximum, rounded half-up to two decimals;
 *  - the band is the one with the highest minimum not above the percentage; pass means percentage >= the scale's pass mark;
 *  - students with the same percentage share a rank and the next rank is skipped (1, 2, 2, 4).
 */
public final class Grading {
    private Grading() {}

    private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

    /** @param scoreX100 null = not entered; @param absent true = did not sit the exam (then scoreX100 is null) */
    public record SubjectInput(long maxX100, long weightX100, Long scoreX100, boolean absent) {
        boolean entered() { return absent || scoreX100 != null; }
        long earnedX100() { return absent || scoreX100 == null ? 0 : scoreX100; }
    }

    public record Band(BigDecimal minPercent, String labelKm, String letter) {}

    /** All amounts are in ordinary units (7.25), percentages in percent (87.50). Percent is null while incomplete. */
    public record Outcome(BigDecimal total, BigDecimal totalMax, BigDecimal percent, boolean complete, int absentCount) {}

    public static Outcome outcome(List<SubjectInput> subjects) {
        long total = 0, totalMax = 0, weightedScore = 0, weightedMax = 0;
        boolean complete = !subjects.isEmpty();
        int absent = 0;
        for (SubjectInput s : subjects) {
            totalMax += s.maxX100();
            weightedMax += s.maxX100() * s.weightX100();
            if (!s.entered()) {
                complete = false;
                continue;
            }
            if (s.absent()) absent++;
            total += s.earnedX100();
            weightedScore += s.earnedX100() * s.weightX100();
        }
        BigDecimal percent = complete && weightedMax > 0
                ? BigDecimal.valueOf(weightedScore).multiply(HUNDRED).divide(BigDecimal.valueOf(weightedMax), 2, RoundingMode.HALF_UP)
                : null;
        return new Outcome(BigDecimal.valueOf(total, 2), BigDecimal.valueOf(totalMax, 2), percent, complete, absent);
    }

    /** The band for a percentage: bands are searched from the highest minimum down. Null only if the scale has no band at 0. */
    public static Band bandFor(BigDecimal percent, List<Band> bands) {
        List<Band> byMinDesc = new ArrayList<>(bands);
        byMinDesc.sort(Comparator.comparing(Band::minPercent).reversed());
        for (Band b : byMinDesc) if (percent.compareTo(b.minPercent()) >= 0) return b;
        return null;
    }

    public static boolean passed(BigDecimal percent, BigDecimal passPercent) { return percent.compareTo(passPercent) >= 0; }

    /** Competition ranking over the given percentages (null = not ranked). Same value = same rank, the next rank is skipped. */
    public static List<Integer> ranks(List<BigDecimal> percents) {
        List<Integer> out = new ArrayList<>();
        for (BigDecimal p : percents) {
            if (p == null) {
                out.add(null);
                continue;
            }
            int better = 0;
            for (BigDecimal other : percents) if (other != null && other.compareTo(p) > 0) better++;
            out.add(better + 1);
        }
        return out;
    }

    /** "7.25" -> 725. Rejects more than two decimals, negatives and absurd sizes (ArithmeticException -> the caller answers INVALID_NUMBER). */
    public static long toX100(BigDecimal value) {
        if (value.signum() < 0) throw new ArithmeticException("negative");
        return value.setScale(2, RoundingMode.UNNECESSARY).movePointRight(2).longValueExact();
    }

    public static BigDecimal fromX100(long x100) { return BigDecimal.valueOf(x100, 2); }
}
