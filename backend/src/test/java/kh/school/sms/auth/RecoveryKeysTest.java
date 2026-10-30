package kh.school.sms.auth;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

class RecoveryKeysTest {
    static final Pattern KEY = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{25}$");
    static final Pattern FORMATTED = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$");

    @Test
    void generatedKeysHave125BitsOfUniqueCrockfordBase32() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 2000; i++) {
            String k = RecoveryKeys.generate();
            assertThat(k).matches(KEY);
            assertThat(seen.add(k)).as("no duplicates in 2000 keys").isTrue();
        }
        // 32 symbols x 25 positions = 5 bits x 25 = 125 bits
        assertThat(RecoveryKeys.ALPHABET).hasSize(32).doesNotContain("I", "L", "O", "U");
    }

    @Test
    void formattingGroupsOfFive() {
        assertThat(RecoveryKeys.format("0123456789ABCDEFGHJKMNPQR")).isEqualTo("01234-56789-ABCDE-FGHJK-MNPQR").matches(FORMATTED);
    }

    @Test
    void normalizationIsForgivingAboutTypingButNotAboutContent() {
        String key = "ABCDE-FGHJK-MNPQR-STVWX-YZ012";
        assertThat(RecoveryKeys.normalize(key)).contains("ABCDEFGHJKMNPQRSTVWXYZ012");
        assertThat(RecoveryKeys.normalize("abcde fghjk mnpqr stvwx yz012")).contains("ABCDEFGHJKMNPQRSTVWXYZ012");
        assertThat(RecoveryKeys.normalize("  abcdefghjkmnpqrstvwxyz012  ")).contains("ABCDEFGHJKMNPQRSTVWXYZ012");
        // Crockford look-alikes: O -> 0, I and L -> 1
        assertThat(RecoveryKeys.normalize("OILDE-FGHJK-MNPQR-STVWX-YZ012")).contains("011DEFGHJKMNPQRSTVWXYZ012");
        assertThat(RecoveryKeys.normalize("ABCDE-FGHJK-MNPQR-STVWX-YZ01")).isEmpty();      // too short
        assertThat(RecoveryKeys.normalize("ABCDE-FGHJK-MNPQR-STVWX-YZ0123")).isEmpty();    // too long
        assertThat(RecoveryKeys.normalize("UBCDE-FGHJK-MNPQR-STVWX-YZ012")).isEmpty();     // U is not in the alphabet
        assertThat(RecoveryKeys.normalize("ABCDE-FGHJK-MNPQR-STVWX-YZ01!")).isEmpty();
        assertThat(RecoveryKeys.normalize(null)).isEmpty();
        assertThat(RecoveryKeys.normalize("")).isEmpty();
    }

    @Test
    void aFormattedKeyNormalizesBackToTheGeneratedKey() {
        for (int i = 0; i < 200; i++) {
            String k = RecoveryKeys.generate();
            assertThat(RecoveryKeys.normalize(RecoveryKeys.format(k))).contains(k);
        }
    }
}
