package kh.school.sms.exam;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GradingTest {
    private static Grading.SubjectInput s(long max, long weight, Long score, boolean absent) { return new Grading.SubjectInput(max, weight, score, absent); }

    private static BigDecimal d(String v) { return new BigDecimal(v); }

    @Test
    void percentIsTheWeightedScoreOverTheWeightedMaximum() {
        // 8/10 and 90/100 with equal weights: (800*100 + 9000*100) / (1000*100 + 10000*100) = 89.09...
        Grading.Outcome o = Grading.outcome(List.of(s(1000, 100, 800L, false), s(10000, 100, 9000L, false)));
        assertThat(o.complete()).isTrue();
        assertThat(o.total()).isEqualByComparingTo("98.00");
        assertThat(o.totalMax()).isEqualByComparingTo("110.00");
        assertThat(o.percent()).as("rounded half-up to two decimals").isEqualByComparingTo("89.09");
    }

    @Test
    void aDoubleWeightCountsTwice() {
        Grading.Outcome o = Grading.outcome(List.of(s(10000, 200, 10000L, false), s(10000, 100, 0L, false)));
        assertThat(o.percent()).isEqualByComparingTo("66.67");   // (10000*2 + 0) / (10000*2 + 10000)
    }

    @Test
    void roundingIsHalfUp() {
        assertThat(Grading.outcome(List.of(s(10000, 100, 5005L, false))).percent()).isEqualByComparingTo("50.05");
        // 1/8 of 100 = 12.5 -> exactly representable; 1/3 -> 33.33; 2/3 -> 66.67
        assertThat(Grading.outcome(List.of(s(300, 100, 100L, false))).percent()).isEqualByComparingTo("33.33");
        assertThat(Grading.outcome(List.of(s(300, 100, 200L, false))).percent()).isEqualByComparingTo("66.67");
        assertThat(Grading.outcome(List.of(s(100000, 100, 12345L, false))).percent()).as("12.345 -> 12.35, not 12.34").isEqualByComparingTo("12.35");
    }

    @Test
    void absentCountsAsZeroButIsFlaggedAndANotYetEnteredSubjectMakesTheResultIncomplete() {
        Grading.Outcome absent = Grading.outcome(List.of(s(10000, 100, 8000L, false), s(10000, 100, null, true)));
        assertThat(absent.complete()).isTrue();
        assertThat(absent.absentCount()).isEqualTo(1);
        assertThat(absent.percent()).as("absent = 0, a real zero would give the same percentage but not the flag").isEqualByComparingTo("40.00");

        Grading.Outcome open = Grading.outcome(List.of(s(10000, 100, 8000L, false), s(10000, 100, null, false)));
        assertThat(open.complete()).isFalse();
        assertThat(open.percent()).as("no percentage until everything is entered").isNull();
        assertThat(open.total()).as("but what is entered is still added up").isEqualByComparingTo("80.00");
        assertThat(Grading.outcome(List.of()).complete()).as("no subjects at all is not a result").isFalse();
    }

    @Test
    void theBandIsTheHighestMinimumNotAboveThePercentAndPassFollowsThePassMark() {
        List<Grading.Band> bands = List.of(new Grading.Band(d("0"), "ខ្សោយ", "F"), new Grading.Band(d("90"), "ល្អប្រសើរ", "A"),
                new Grading.Band(d("50"), "មធ្យម", "E"), new Grading.Band(d("70"), "ល្អ", "C"));   // deliberately unsorted
        assertThat(Grading.bandFor(d("100"), bands).letter()).isEqualTo("A");
        assertThat(Grading.bandFor(d("90.00"), bands).letter()).as("a minimum is inclusive").isEqualTo("A");
        assertThat(Grading.bandFor(d("89.99"), bands).letter()).isEqualTo("C");
        assertThat(Grading.bandFor(d("50"), bands).letter()).isEqualTo("E");
        assertThat(Grading.bandFor(d("0"), bands).letter()).isEqualTo("F");
        assertThat(Grading.passed(d("50.00"), d("50"))).as("the pass mark itself passes").isTrue();
        assertThat(Grading.passed(d("49.99"), d("50"))).isFalse();
    }

    @Test
    void tiesShareARankAndTheNextRankIsSkipped() {
        List<BigDecimal> percents = Arrays.asList(d("90"), d("85.5"), d("85.50"), d("70"), null);
        assertThat(Grading.ranks(percents)).containsExactly(1, 2, 2, 4, null);
    }

    @Test
    void scoresAreStoredAsHundredths() {
        assertThat(Grading.toX100(d("7.25"))).isEqualTo(725);
        assertThat(Grading.toX100(d("7"))).isEqualTo(700);
        assertThat(Grading.toX100(d("7.2"))).isEqualTo(720);
        assertThat(Grading.fromX100(725)).isEqualByComparingTo("7.25");
        assertThatThrownBy(() -> Grading.toX100(d("7.255"))).as("a third decimal is refused, not rounded away").isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Grading.toX100(d("-1"))).isInstanceOf(ArithmeticException.class);
    }
}
