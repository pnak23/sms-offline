package kh.school.sms.attendance;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The rule that turns a student's records of one date into one day status; every combination of two sessions is listed. */
class DayStatusTest {
    private static DayStatus of(String... statuses) { return DayStatus.of(List.of(statuses)); }

    @Test
    void sameStatusInEverySessionIsThatStatus() {
        assertThat(of("PRESENT", "PRESENT")).isEqualTo(DayStatus.PRESENT);
        assertThat(of("ABSENT", "ABSENT")).isEqualTo(DayStatus.ABSENT);
        assertThat(of("LEAVE", "LEAVE")).isEqualTo(DayStatus.LEAVE);
        assertThat(of("LATE", "LATE")).isEqualTo(DayStatus.LATE);
    }

    @Test
    void oneSessionIsJustThatSession() {
        assertThat(of("PRESENT")).isEqualTo(DayStatus.PRESENT);
        assertThat(of("LATE")).isEqualTo(DayStatus.LATE);
        assertThat(of("ABSENT")).isEqualTo(DayStatus.ABSENT);
        assertThat(of("LEAVE")).isEqualTo(DayStatus.LEAVE);
    }

    @Test
    void thereForEverySessionButLateOnceIsLate() {
        assertThat(of("LATE", "PRESENT")).isEqualTo(DayStatus.LATE);
        assertThat(of("PRESENT", "LATE")).isEqualTo(DayStatus.LATE);
        assertThat(of("PRESENT", "LATE", "PRESENT")).isEqualTo(DayStatus.LATE);
    }

    @Test
    void attendedOneSessionAndMissedAnotherIsPartialNeverTwoDays() {
        assertThat(of("PRESENT", "ABSENT")).as("morning present, afternoon absent").isEqualTo(DayStatus.PARTIAL);
        assertThat(of("ABSENT", "PRESENT")).isEqualTo(DayStatus.PARTIAL);
        assertThat(of("PRESENT", "LEAVE")).isEqualTo(DayStatus.PARTIAL);
        assertThat(of("LATE", "ABSENT")).isEqualTo(DayStatus.PARTIAL);
        assertThat(of("LEAVE", "LATE")).isEqualTo(DayStatus.PARTIAL);
        assertThat(of("PRESENT", "LATE", "ABSENT")).isEqualTo(DayStatus.PARTIAL);
    }

    @Test
    void nothingAttendedWithAbsentAndLeaveMixedIsAbsent() {
        assertThat(of("ABSENT", "LEAVE")).as("an unexcused absence is not hidden by a leave").isEqualTo(DayStatus.ABSENT);
        assertThat(of("LEAVE", "ABSENT")).isEqualTo(DayStatus.ABSENT);
        assertThat(of("LEAVE", "ABSENT", "LEAVE")).isEqualTo(DayStatus.ABSENT);
    }

    @Test
    void theOrderOfTheSessionsNeverMatters() {
        for (String a : List.of("PRESENT", "LATE", "ABSENT", "LEAVE")) {
            for (String b : List.of("PRESENT", "LATE", "ABSENT", "LEAVE")) {
                assertThat(of(a, b)).as(a + " + " + b).isEqualTo(of(b, a));
            }
        }
    }

    @Test
    void aDateWithNoRecordHasNoStatusAndAnUnknownStatusIsRefused() {
        assertThatThrownBy(() -> DayStatus.of(List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> of("PRESENT", "SICK")).isInstanceOf(IllegalArgumentException.class);
    }
}
