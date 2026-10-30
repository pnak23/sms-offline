package kh.school.sms.auth;

import kh.school.sms.common.ApiException.FieldError;
import kh.school.sms.common.KhmerText;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PolicyTest {
    private static List<String> codes(List<FieldError> errors) { return errors.stream().map(FieldError::code).toList(); }

    @Test
    void passwordNeedsEightCharactersAndAtMost72Bytes() {
        assertThat(codes(PasswordPolicy.validate("password", "plum-ca", "u"))).containsExactly("PASSWORD_TOO_SHORT");
        assertThat(PasswordPolicy.validate("password", "plum-cats", "u")).isEmpty();
        assertThat(PasswordPolicy.validate("password", "ab".repeat(36), "u")).isEmpty();
        assertThat(codes(PasswordPolicy.validate("password", "a".repeat(73), "u"))).containsExactly("PASSWORD_TOO_LONG");
    }

    @Test
    void khmerCountsCodePointsButThe72ByteLimitIsAboutTwentyFourKhmerCharacters() {
        String khmer24 = "ក".repeat(24);                      // 24 x 3 bytes = 72
        assertThat(PasswordPolicy.utf8Bytes(khmer24)).isEqualTo(72);
        assertThat(PasswordPolicy.validate("password", khmer24, "u")).isEmpty();
        assertThat(codes(PasswordPolicy.validate("password", "ក".repeat(25), "u"))).containsExactly("PASSWORD_TOO_LONG");
        assertThat(codes(PasswordPolicy.validate("password", "ក".repeat(7), "u"))).containsExactly("PASSWORD_TOO_SHORT");
        assertThat(PasswordPolicy.validate("password", "ក".repeat(8), "u")).isEmpty();
    }

    @Test
    void noCompositionRulesButWeakListAndUsernameAreRejected() {
        assertThat(PasswordPolicy.validate("password", "alllowercase", "u")).isEmpty();      // no forced digits/symbols
        assertThat(codes(PasswordPolicy.validate("password", "Password123", "u"))).containsExactly("PASSWORD_WEAK");
        assertThat(codes(PasswordPolicy.validate("password", "12345678", "u"))).containsExactly("PASSWORD_WEAK");
        assertThat(codes(PasswordPolicy.validate("password", "myusername", "myusername"))).containsExactly("PASSWORD_EQUALS_USERNAME");
        assertThat(codes(PasswordPolicy.validate("password", "", "u"))).containsExactly("REQUIRED");
        assertThat(codes(PasswordPolicy.validate("password", null, "u"))).containsExactly("REQUIRED");
    }

    @Test
    void usernamesAreNormalizedAndValidated() {
        assertThat(UsernamePolicy.normalize("  Admin.User ")).isEqualTo("admin.user");
        assertThat(UsernamePolicy.validate("admin.user")).isEmpty();
        assertThat(UsernamePolicy.validate("សុខា_១២")).isEmpty();                              // Khmer letters, marks and digits
        assertThat(codes(UsernamePolicy.validate("ab"))).containsExactly("USERNAME_INVALID");
        assertThat(codes(UsernamePolicy.validate("a".repeat(33)))).containsExactly("USERNAME_INVALID");
        assertThat(codes(UsernamePolicy.validate("has space"))).containsExactly("USERNAME_INVALID");
        assertThat(codes(UsernamePolicy.validate("bad/name"))).containsExactly("USERNAME_INVALID");
        assertThat(codes(UsernamePolicy.validate(""))).containsExactly("REQUIRED");
    }

    @Test
    void throttleTiersAreFiveOneMinuteTenFiveMinutesFifteenFifteenMinutes() {
        var now = java.time.Instant.parse("2026-10-30T00:00:00Z");
        assertThat(AuthService.lockUntil(4, now)).isNull();
        assertThat(AuthService.lockUntil(5, now)).isEqualTo(now.plusSeconds(60));
        assertThat(AuthService.lockUntil(9, now)).isEqualTo(now.plusSeconds(60));
        assertThat(AuthService.lockUntil(10, now)).isEqualTo(now.plusSeconds(300));
        assertThat(AuthService.lockUntil(14, now)).isEqualTo(now.plusSeconds(300));
        assertThat(AuthService.lockUntil(15, now)).isEqualTo(now.plusSeconds(900));
        assertThat(AuthService.lockUntil(500, now)).isEqualTo(now.plusSeconds(900));   // capped: never permanent
    }

    @Test
    void khmerTextNormalisation() {
        assertThat(KhmerText.name("  សុខ​   ចាន់ណា \n")).isEqualTo("សុខ ចាន់ណា");     // ZWSP removed, spaces collapsed
        assertThat(KhmerText.name("   ")).isNull();
        assertThat(KhmerText.free("ភូមិ​អូរ")).isEqualTo("ភូមិ​អូរ");              // free text keeps ZWSP (line breaking)
        assertThat(KhmerText.asciiDigits("០១២៣៤៥៦៧៨៩ 012")).isEqualTo("0123456789 012");
    }
}
