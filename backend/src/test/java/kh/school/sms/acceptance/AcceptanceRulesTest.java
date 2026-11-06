package kh.school.sms.acceptance;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** The sign-off rule on its own: the shipped list can have every item built, but an item that is not must never be accepted for the school. */
class AcceptanceRulesTest {
    @Test
    void onlyAnItemWhoseDevelopmentIsCompleteCanBeAccepted() {
        assertThat(AcceptanceService.readyForSignOff(new AcceptanceService.Item("a", "information", "COMPLETED", "CONFIGURATION"))).isTrue();
        assertThat(AcceptanceService.readyForSignOff(new AcceptanceService.Item("a", "information", "IN_PROGRESS", "CONFIGURATION"))).isFalse();
        assertThat(AcceptanceService.readyForSignOff(new AcceptanceService.Item("a", "hardware", "NOT_STARTED", "PHYSICAL_TESTING"))).isFalse();
        assertThat(AcceptanceService.readyForSignOff(new AcceptanceService.Item("a", "hardware", null, "PHYSICAL_TESTING"))).isFalse();
    }
}
