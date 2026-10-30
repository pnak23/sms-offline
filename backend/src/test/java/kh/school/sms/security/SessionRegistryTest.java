package kh.school.sms.security;

import kh.school.sms.MutableClock;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;

class SessionRegistryTest {
    private final MutableClock clock = new MutableClock();
    private final SessionRegistry sessions = new SessionRegistry(clock, new SessionProperties(30, 12));
    private final AuthUser admin = new AuthUser(1, "admin");

    @Test
    void tokensAre256BitUniqueAndValid() {
        String a = sessions.issue(admin), b = sessions.issue(admin);
        assertThat(a).isNotEqualTo(b).hasSize(43);                  // 32 bytes, base64url without padding
        assertThat(sessions.validate(a)).contains(admin);
        assertThat(sessions.validate("not-a-token")).isEmpty();
    }

    @Test
    void idleTimeoutIsRefreshedByUseButAbsoluteTimeoutIsNot() {
        String t = sessions.issue(admin);
        for (int i = 1; i <= 24; i++) {                              // active every 29 minutes: 696 min = 11.6 h
            clock.advance(Duration.ofMinutes(29));
            assertThat(sessions.validate(t)).as("still active at step " + i).isPresent();
        }
        clock.advance(Duration.ofMinutes(29));                       // 725 min > 12 h absolute, though never idle
        assertThat(sessions.validate(t)).isEmpty();

        String t2 = sessions.issue(admin);
        clock.advance(Duration.ofMinutes(31));                       // idle > 30 min
        assertThat(sessions.validate(t2)).isEmpty();
    }

    @Test
    void passwordChangeSignsOutEveryOtherWindowButNotThisOne() {
        String mine = sessions.issue(admin), other = sessions.issue(admin), someoneElse = sessions.issue(new AuthUser(2, "other"));
        sessions.revokeAllExcept(1, mine);
        assertThat(sessions.validate(mine)).isPresent();
        assertThat(sessions.validate(other)).isEmpty();
        assertThat(sessions.validate(someoneElse)).isPresent();
        sessions.revokeAll();
        assertThat(sessions.validate(mine)).isEmpty();
    }
}
