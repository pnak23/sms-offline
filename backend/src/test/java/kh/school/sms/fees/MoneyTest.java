package kh.school.sms.fees;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MoneyTest {
    @Test
    void rielAreWholeNumbersAndDollarsAreCents() {
        assertThat(Money.toMinor(new BigDecimal("15000"), "KHR", false)).isEqualTo(15000);
        assertThat(Money.toMinor(new BigDecimal("12.50"), "USD", false)).isEqualTo(1250);
        assertThat(Money.toMinor(new BigDecimal("12.5"), "USD", false)).isEqualTo(1250);
        assertThat(Money.toMinor(new BigDecimal("15000.00"), "KHR", false)).as("trailing zeros are not decimals").isEqualTo(15000);
        assertThat(Money.toMajor(1250, "USD")).isEqualByComparingTo("12.5");
        assertThat(Money.toMajor(15000, "KHR")).isEqualByComparingTo("15000");
    }

    @Test
    void anythingFinerThanTheSmallestUnitIsRefusedNotRounded() {
        assertThatThrownBy(() -> Money.toMinor(new BigDecimal("12.5"), "KHR", false)).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.toMinor(new BigDecimal("12.345"), "USD", false)).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void zeroIsAllowedOnlyWhereTheCallerSaysAndNegativesNever() {
        assertThat(Money.toMinor(BigDecimal.ZERO, "KHR", true)).isZero();
        assertThatThrownBy(() -> Money.toMinor(BigDecimal.ZERO, "KHR", false)).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.toMinor(new BigDecimal("-1"), "KHR", true)).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.toMinor(null, "KHR", true)).isInstanceOf(ArithmeticException.class);
    }

    @Test
    void absurdSizesAreRefusedAndUnknownCurrenciesFail() {
        assertThat(Money.toMinor(new BigDecimal("1000000000000"), "KHR", false)).isEqualTo(Money.MAX_MINOR);
        assertThatThrownBy(() -> Money.toMinor(new BigDecimal("1000000000001"), "KHR", false)).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.toMinor(new BigDecimal("99999999999999999999"), "KHR", false)).isInstanceOf(ArithmeticException.class);
        assertThatThrownBy(() -> Money.decimals("EUR")).isInstanceOf(IllegalArgumentException.class);
    }
}
