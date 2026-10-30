package kh.school.sms;

import kh.school.sms.auth.RecoveryKeys;
import kh.school.sms.bootstrap.DataDirs;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * One ordered scenario over real HTTP against a real SQLite file. The data directory's name contains Khmer
 * characters and a space on purpose: the backend must work from any Windows user profile path.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {"sms.launch-secret=test-launch-secret-0123456789"})
@Import(BackendFlowTest.ClockConfig.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class BackendFlowTest {
    static final String SECRET = "test-launch-secret-0123456789";
    static final MutableClock CLOCK = new MutableClock();
    static final Pattern FORMATTED_KEY = Pattern.compile("^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$");
    static final Path DATA_ROOT;

    static {
        try {
            DATA_ROOT = DataDirs.prepare(Files.createTempDirectory("sms ទិន្នន័យ "));
        } catch (Exception e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @TestConfiguration
    static class ClockConfig {
        @Bean @Primary MutableClock testClock() { return CLOCK; }
    }

    // everything the scenario ever used as a secret; the final test proves none of it was logged or audited
    static final List<String> SECRETS = new ArrayList<>();

    static final String PW1 = "Khmer-School-Pass-2026";
    static final String PW2 = "ពាក្យសម្ងាត់ខ្មែរ-2026";       // Khmer password, 3 bytes per character, still <= 72 bytes
    static final String PW3 = "Third-Pass-Word-2026";
    static String token1, token2, token3, token4, key1, key2, key3;

    @Value("${local.server.port}") int port;
    @Autowired JsonMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordEncoder encoder;

    final HttpClient http = HttpClient.newHttpClient();

    record Resp(int status, String body, java.net.http.HttpHeaders headers, byte[] bytes) {
        JsonNode json(JsonMapper m) { return m.readTree(body); }
    }

    // ---- helpers ------------------------------------------------------------------------------------------------

    Resp send(String method, String path, String token, String jsonBody) throws Exception {
        return exec(method, path, token, true, jsonBody == null ? null : jsonBody.getBytes(StandardCharsets.UTF_8), "application/json; charset=UTF-8", Map.of());
    }

    Resp exec(String method, String path, String token, boolean secret, byte[] body, String contentType, Map<String, String> extra) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (secret) b.header("X-SMS-Launch-Secret", SECRET);
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (body != null) b.header("Content-Type", contentType);
        extra.forEach(b::header);
        b.method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body));
        HttpResponse<byte[]> r = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        return new Resp(r.statusCode(), new String(r.body(), StandardCharsets.UTF_8), r.headers(), r.body());
    }

    String j(String... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return json.writeValueAsString(m);
    }

    String code(Resp r) { return r.json(json).path("code").asString(); }

    List<String> fieldCodes(Resp r) {
        List<String> out = new ArrayList<>();
        r.json(json).path("fieldErrors").forEach(n -> out.add(n.path("field").asString() + ":" + n.path("code").asString()));
        return out;
    }

    Resp login(String user, String pw) throws Exception { return send("POST", "/api/v1/auth/login", null, j("username", user, "password", pw)); }

    String normalized(String formatted) { return RecoveryKeys.normalize(formatted).orElseThrow(); }

    // ---- scenario -----------------------------------------------------------------------------------------------

    @Test @Order(1)
    void setupModeBlocksEverythingExceptTheWizardEndpoints() throws Exception {
        Resp blocked = send("GET", "/api/v1/subjects", null, null);
        assertThat(blocked.status()).isEqualTo(401);
        assertThat(code(blocked)).isEqualTo("SETUP_REQUIRED");
        Resp status = send("GET", "/api/v1/auth/status", null, null);
        assertThat(status.status()).isEqualTo(200);
        assertThat(status.json(json).path("setupRequired").asBoolean()).isTrue();
        assertThat(status.json(json).path("authenticated").asBoolean()).isFalse();
        assertThat(send("GET", "/internal/health", null, null).body()).contains("\"status\":\"UP\"").contains("appVersion").contains("startup");
        assertThat(send("GET", "/api/v1/system/health", null, null).status()).isEqualTo(200);   // wizard step 1
        assertThat(send("GET", "/api/v1/settings/school", null, null).status()).isEqualTo(401);
    }

    @Test @Order(2)
    void setupRejectsBadInputWithMachineCodesAndCreatesNothing() throws Exception {
        Resp r = send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "ab", "password", "short"));
        assertThat(r.status()).isEqualTo(422);
        assertThat(fieldCodes(r)).contains("username:USERNAME_INVALID", "password:PASSWORD_TOO_SHORT");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "admin.sokha", "password", "Password123"))))
                .containsExactly("password:PASSWORD_WEAK");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/setup", null, j("displayName", "សុខា", "username", "admin.sokha", "password", "x".repeat(80)))))
                .containsExactly("password:PASSWORD_TOO_LONG");
        assertThat(jdbc.queryForObject("select count(*) from app_users", Integer.class)).isZero();
    }

    @Test @Order(3)
    void setupCreatesTheAdministratorAndShowsTheKeyOnce() throws Exception {
        Resp r = send("POST", "/api/v1/auth/setup", null, j("displayName", "អ្នកគ្រប់គ្រង សុខា", "username", "  Admin.Sokha ", "password", PW1));
        assertThat(r.status()).isEqualTo(201);
        assertThat(r.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        JsonNode n = r.json(json);
        token1 = n.path("token").asString();
        key1 = n.path("recoveryKey").asString();
        SECRETS.addAll(List.of(PW1, PW2, PW3, token1, key1, normalized(key1)));
        assertThat(n.path("user").path("username").asString()).isEqualTo("admin.sokha");
        assertThat(n.path("user").path("displayName").asString()).isEqualTo("អ្នកគ្រប់គ្រង សុខា");
        assertThat(key1).matches(FORMATTED_KEY);

        // only hashes are stored, never the password or the key
        Map<String, Object> row = jdbc.queryForMap("select * from app_users");
        String all = row.values().stream().map(String::valueOf).reduce("", (a, b) -> a + "|" + b);
        assertThat(all).doesNotContain(PW1).doesNotContain(normalized(key1)).doesNotContain(key1);
        assertThat((String) row.get("password_hash")).startsWith("$2a$12$");
        assertThat((String) row.get("recovery_key_hash")).startsWith("$2a$12$");
        assertThat(encoder.matches(normalized(key1), (String) row.get("recovery_key_hash"))).isTrue();
        assertThat(row.get("recovery_key_confirmed_at")).isNull();

        Resp again = send("POST", "/api/v1/auth/setup", null, j("displayName", "x", "username", "second.admin", "password", PW1));
        assertThat(again.status()).isEqualTo(409);
        assertThat(code(again)).isEqualTo("SETUP_ALREADY_DONE");

        JsonNode st = send("GET", "/api/v1/auth/status", token1, null).json(json);
        assertThat(st.path("setupRequired").asBoolean()).isFalse();
        assertThat(st.path("authenticated").asBoolean()).isTrue();
        assertThat(st.path("recoveryKeyPending").asBoolean()).isTrue();
        assertThat(st.path("setupCompleted").asBoolean()).isFalse();
    }

    @Test @Order(4)
    void afterSetupAnonymousRequestsAreUnauthenticatedAndTheTokenWorks() throws Exception {
        assertThat(code(send("GET", "/api/v1/subjects", null, null))).isEqualTo("UNAUTHENTICATED");
        assertThat(code(send("GET", "/api/v1/subjects", "garbage-token", null))).isEqualTo("UNAUTHENTICATED");
        Resp ok = send("GET", "/api/v1/subjects", token1, null);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.json(json).size()).isEqualTo(8);
        assertThat(send("GET", "/api/v1/system/health", null, null).status()).isEqualTo(401);
    }

    @Test @Order(5)
    void loginThrottleIsPersistedEscalatesAndNeverRevealsWhetherAUserExists() throws Exception {
        Resp unknown = login("nobody.here", "whatever-password");
        assertThat(unknown.status()).isEqualTo(401);
        assertThat(code(unknown)).isEqualTo("INVALID_CREDENTIALS");
        for (int i = 1; i <= 4; i++) {
            Resp r = login("admin.sokha", "wrong-password-" + i);
            assertThat(r.status()).as("attempt " + i).isEqualTo(401);
            assertThat(code(r)).isEqualTo("INVALID_CREDENTIALS");
        }
        Resp fifth = login("admin.sokha", "wrong-password-5");
        assertThat(fifth.status()).isEqualTo(429);
        assertThat(code(fifth)).isEqualTo("ACCOUNT_LOCKED");
        long retry = fifth.json(json).path("retryAfterSeconds").asLong();
        assertThat(retry).isBetween(1L, 62L);
        assertThat(login("admin.sokha", PW1).status()).as("even the right password is refused while locked").isEqualTo(429);

        Map<String, Object> db = jdbc.queryForMap("select failed_attempts, locked_until from app_users");
        assertThat(((Number) db.get("failed_attempts")).intValue()).isEqualTo(5);     // in the DB, so a restart cannot reset it
        assertThat(db.get("locked_until")).isNotNull();

        CLOCK.advance(Duration.ofSeconds(61));
        Resp ok = login("ADMIN.Sokha", PW1);                                             // username is case-insensitive
        assertThat(ok.status()).isEqualTo(200);
        token2 = ok.json(json).path("token").asString();
        SECRETS.add(token2);
        assertThat(ok.json(json).path("recoveryKeyPending").asBoolean()).isTrue();
        Map<String, Object> reset = jdbc.queryForMap("select failed_attempts, locked_until from app_users");
        assertThat(((Number) reset.get("failed_attempts")).intValue()).isZero();
        assertThat(reset.get("locked_until")).isNull();
    }

    @Test @Order(6)
    void confirmingTheRecoveryKeyClearsThePendingFlag() throws Exception {
        assertThat(send("POST", "/api/v1/auth/recovery-key/confirm", token1, null).status()).isEqualTo(204);
        assertThat(send("GET", "/api/v1/auth/status", token1, null).json(json).path("recoveryKeyPending").asBoolean()).isFalse();
    }

    @Test @Order(7)
    void unlockNeedsThePassword() throws Exception {
        Resp wrong = send("POST", "/api/v1/auth/unlock", token1, j("password", "not-it-at-all"));
        assertThat(wrong.status()).isEqualTo(422);
        assertThat(fieldCodes(wrong)).containsExactly("password:INVALID_PASSWORD");
        assertThat(send("POST", "/api/v1/auth/unlock", token1, j("password", PW1)).status()).isEqualTo(204);
    }

    @Test @Order(8)
    void changingThePasswordSignsOtherWindowsOutAndAcceptsAKhmerPassword() throws Exception {
        assertThat(fieldCodes(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", "nope", "newPassword", PW2))))
                .containsExactly("currentPassword:INVALID_PASSWORD");
        assertThat(fieldCodes(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", PW1, "newPassword", "password123"))))
                .containsExactly("newPassword:PASSWORD_WEAK");
        assertThat(send("POST", "/api/v1/auth/change-password", token2, j("currentPassword", PW1, "newPassword", PW2)).status()).isEqualTo(204);

        assertThat(send("GET", "/api/v1/subjects", token1, null).status()).as("the other window is signed out").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token2, null).status()).as("this window stays signed in").isEqualTo(200);
        assertThat(login("admin.sokha", PW1).status()).as("old password").isEqualTo(401);
        Resp ok = login("admin.sokha", PW2);
        assertThat(ok.status()).isEqualTo(200);
        token3 = ok.json(json).path("token").asString();
        SECRETS.add(token3);
    }

    @Test @Order(9)
    void recoveryWorksOfflineRotatesTheKeyAndInvalidatesTheOldOneImmediately() throws Exception {
        for (int i = 1; i <= 4; i++) {
            Resp r = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ" + i, "newPassword", PW3));
            assertThat(r.status()).as("wrong key " + i).isEqualTo(401);
            assertThat(code(r)).isEqualTo("INVALID_RECOVERY_KEY");
        }
        Resp lock = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", "ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZ5", "newPassword", PW3));
        assertThat(lock.status()).isEqualTo(429);
        assertThat(code(lock)).isEqualTo("ACCOUNT_LOCKED");
        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", PW3)).status())
                .as("even the right key is refused while locked").isEqualTo(429);
        CLOCK.advance(Duration.ofSeconds(61));

        Resp weak = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", "12345678"));
        assertThat(fieldCodes(weak)).containsExactly("newPassword:PASSWORD_WEAK");          // does not burn the key

        String typedByHand = normalized(key1).toLowerCase();                                // lower-case, no dashes
        Resp ok = send("POST", "/api/v1/auth/recover", null, j("recoveryKey", typedByHand, "newPassword", PW3));
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.headers().firstValue("Cache-Control").orElse("")).contains("no-store");
        assertThat(ok.json(json).path("username").asString()).isEqualTo("admin.sokha");     // shown, in case it was forgotten too
        key2 = ok.json(json).path("recoveryKey").asString();
        SECRETS.addAll(List.of(key2, normalized(key2)));
        assertThat(key2).matches(FORMATTED_KEY).isNotEqualTo(key1);

        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key1, "newPassword", PW3)).status())
                .as("the used key is dead immediately").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token2, null).status()).as("sessions revoked").isEqualTo(401);
        assertThat(send("GET", "/api/v1/subjects", token3, null).status()).isEqualTo(401);
        assertThat(login("admin.sokha", PW2).status()).as("old password").isEqualTo(401);
        Resp in = login("admin.sokha", PW3);
        assertThat(in.status()).isEqualTo(200);
        token4 = in.json(json).path("token").asString();
        SECRETS.add(token4);
        assertThat(in.json(json).path("recoveryKeyPending").asBoolean()).as("new key must be saved again").isTrue();

        Map<String, Object> row = jdbc.queryForMap("select recovery_failed_attempts, recovery_locked_until, recovery_key_confirmed_at, recovery_key_hash from app_users");
        assertThat(encoder.matches(normalized(key2), (String) row.get("recovery_key_hash"))).isTrue();
        assertThat(encoder.matches(normalized(key1), (String) row.get("recovery_key_hash"))).isFalse();
        assertThat(row.get("recovery_key_confirmed_at")).isNull();

        // the wizard cannot finish while the key is unconfirmed (approved default 9)
        Resp early = send("POST", "/api/v1/setup/complete", token4, null);
        assertThat(early.status()).isEqualTo(409);
        assertThat(code(early)).isEqualTo("RECOVERY_KEY_NOT_CONFIRMED");
    }

    @Test @Order(10)
    void regeneratingTheKeyNeedsThePasswordAndKillsThePreviousKey() throws Exception {
        assertThat(fieldCodes(send("POST", "/api/v1/auth/recovery-key/regenerate", token4, j("currentPassword", "wrong-password"))))
                .containsExactly("currentPassword:INVALID_PASSWORD");
        Resp ok = send("POST", "/api/v1/auth/recovery-key/regenerate", token4, j("currentPassword", PW3));
        assertThat(ok.status()).isEqualTo(200);
        key3 = ok.json(json).path("recoveryKey").asString();
        SECRETS.addAll(List.of(key3, normalized(key3)));
        assertThat(key3).matches(FORMATTED_KEY).isNotIn(key1, key2);
        assertThat(send("POST", "/api/v1/auth/recover", null, j("recoveryKey", key2, "newPassword", "Another-Pass-2026")).status()).isEqualTo(401);
        assertThat(send("POST", "/api/v1/auth/recovery-key/confirm", token4, null).status()).isEqualTo(204);
    }

    @Test @Order(11)
    void schoolProfileStoresKhmerNormalizesAndUsesOptimisticLocking() throws Exception {
        JsonNode before = send("GET", "/api/v1/settings/school", token4, null).json(json);
        assertThat(before.path("nameKm").isNull()).isTrue();
        long v = before.path("version").asLong();
        String body = json.writeValueAsString(Map.of("nameKm", "សាលាបឋមសិក្សា  ភូមិថ្មី", "nameEn", "New Village Primary School",
                "address", "ភូមិថ្មី ឃុំសាមគ្គី", "phone", "០១២ ៣៤៥ ៦៧៨", "directorName", "លោក សុខ", "version", v));
        Resp ok = send("PUT", "/api/v1/settings/school", token4, body);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.json(json).path("nameKm").asString()).isEqualTo("សាលាបឋមសិក្សា ភូមិថ្មី");   // spaces collapsed
        assertThat(ok.json(json).path("phone").asString()).isEqualTo("012 345 678");                // Khmer digits -> ASCII
        assertThat(ok.json(json).path("version").asLong()).isEqualTo(v + 1);
        assertThat(jdbc.queryForObject("select name_km from school_settings where id = 1", String.class)).isEqualTo("សាលាបឋមសិក្សា ភូមិថ្មី");
        assertThat(code(send("PUT", "/api/v1/settings/school", token4, body))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
        Resp blank = send("PUT", "/api/v1/settings/school", token4, json.writeValueAsString(Map.of("nameKm", "  ", "version", v + 1)));
        assertThat(blank.status()).isEqualTo(422);
        assertThat(fieldCodes(blank)).contains("nameKm:NotBlank");
    }

    @Test @Order(12)
    void logoIsValidatedResizedStoredByGeneratedNameAndServedSafely() throws Exception {
        BufferedImage img = new BufferedImage(800, 600, BufferedImage.TYPE_INT_RGB);
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        Path dir = DataDirs.schoolUploads();

        Resp up = upload("/api/v1/settings/school/logo", token4, "logo.png", "image/png", png.toByteArray());
        assertThat(up.status()).isEqualTo(200);
        String name = up.json(json).path("logoFile").asString();
        assertThat(name).matches("^logo-[0-9a-f-]{36}\\.png$");
        assertThat(Files.isRegularFile(dir.resolve(name))).isTrue();

        Resp file = send("GET", "/api/v1/files/school/" + name, token4, null);
        assertThat(file.status()).isEqualTo(200);
        assertThat(file.headers().firstValue("Content-Type").orElse("")).contains("image/png");
        BufferedImage served = ImageIO.read(new ByteArrayInputStream(file.bytes()));
        assertThat(served.getWidth()).isEqualTo(512);                                      // 800x600 capped to 512 wide
        assertThat(served.getHeight()).isEqualTo(384);
        assertThat(send("GET", "/api/v1/files/school/" + name, null, null).status()).as("images need a session").isEqualTo(401);

        Resp notImage = upload("/api/v1/settings/school/logo", token4, "evil.png", "image/png", "this is not an image".getBytes(StandardCharsets.UTF_8));
        assertThat(notImage.status()).isEqualTo(422);
        assertThat(fieldCodes(notImage)).containsExactly("file:INVALID_IMAGE");
        assertThat(list(dir)).containsExactly(name);

        for (String bad : List.of("..%2F..%2Fconfig%2Frunning.lock", "..%5C..%5Cdatabase%5Cschool.db", "logo-x.png", "%2E%2E%2Fsecret")) {
            int s = send("GET", "/api/v1/files/school/" + bad, token4, null).status();
            assertThat(s).as("traversal attempt " + bad).isIn(400, 404);
        }

        Resp replaced = upload("/api/v1/settings/school/logo", token4, "logo2.png", "image/png", png.toByteArray());
        String name2 = replaced.json(json).path("logoFile").asString();
        assertThat(name2).isNotEqualTo(name);
        assertThat(list(dir)).as("the old file is removed").containsExactly(name2);

        Resp del = send("DELETE", "/api/v1/settings/school/logo", token4, null);
        assertThat(del.json(json).path("logoFile").isNull()).isTrue();
        assertThat(list(dir)).isEmpty();
    }

    @Test @Order(13)
    void appSettingsAreWhitelistedAndValidatedAllOrNothing() throws Exception {
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).contains("\"backup.reminderDays\":\"7\"").contains("\"ui.idleLockMinutes\":\"10\"");
        assertThat(send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"14\"}").status()).isEqualTo(200);
        Resp bad = send("PUT", "/api/v1/settings/app", token4, "{\"backup.reminderDays\":\"30\",\"ui.idleLockMinutes\":\"0\",\"setup.completed_at\":\"x\"}");
        assertThat(bad.status()).isEqualTo(422);
        assertThat(fieldCodes(bad)).contains("ui.idleLockMinutes:INVALID_SETTING", "setup.completed_at:INVALID_SETTING");
        assertThat(send("GET", "/api/v1/settings/app", token4, null).body()).as("nothing stored from a rejected request").contains("\"backup.reminderDays\":\"14\"");
    }

    @Test @Order(14)
    void academicBasicsForTheWizard() throws Exception {
        JsonNode grades = send("GET", "/api/v1/grades", token4, null).json(json);
        assertThat(grades.size()).isEqualTo(6);
        assertThat(grades.get(0).path("nameKm").asString()).isEqualTo("ថ្នាក់ទី១");

        String a = json.writeValueAsString(Map.of("nameKm", "២០២៦-២០២៧", "startDate", "2026-11-01", "endDate", "2027-08-31", "makeCurrent", true));
        String b = json.writeValueAsString(Map.of("nameKm", "២០២៧-២០២៨", "startDate", "2027-11-01", "endDate", "2028-08-31", "makeCurrent", true));
        assertThat(send("POST", "/api/v1/academic-years", token4, a).status()).isEqualTo(201);
        assertThat(send("POST", "/api/v1/academic-years", token4, b).status()).isEqualTo(201);
        JsonNode years = send("GET", "/api/v1/academic-years", token4, null).json(json);
        int current = 0;
        for (JsonNode y : years) if (y.path("current").asBoolean()) { current++; assertThat(y.path("nameKm").asString()).isEqualTo("២០២៧-២០២៨"); }
        assertThat(current).as("exactly one current academic year").isEqualTo(1);
        assertThat(code(send("POST", "/api/v1/academic-years", token4, a))).isEqualTo("DUPLICATE");
        String backwards = json.writeValueAsString(Map.of("nameKm", "២០៣០", "startDate", "2030-08-31", "endDate", "2030-01-01", "makeCurrent", false));
        assertThat(fieldCodes(send("POST", "/api/v1/academic-years", token4, backwards))).containsExactly("endDate:END_BEFORE_START");

        JsonNode subjects = send("GET", "/api/v1/subjects", token4, null).json(json);
        JsonNode english = null;
        for (JsonNode s : subjects) if (s.path("code").asString().equals("ENGLISH")) english = s;
        assertThat(english.path("active").asBoolean()).isFalse();
        String on = "{\"active\":true,\"version\":" + english.path("version").asLong() + "}";
        assertThat(send("PUT", "/api/v1/subjects/" + english.path("id").asLong() + "/active", token4, on).json(json).path("active").asBoolean()).isTrue();
        assertThat(code(send("PUT", "/api/v1/subjects/" + english.path("id").asLong() + "/active", token4, on))).as("stale version").isEqualTo("OPTIMISTIC_LOCK");
    }

    @Test @Order(15)
    void setupProgressAndCompletion() throws Exception {
        assertThat(send("PUT", "/api/v1/setup/progress", token4, "{\"step\":5}").json(json).path("step").asInt()).isEqualTo(5);
        assertThat(send("PUT", "/api/v1/setup/progress", token4, "{\"step\":9}").status()).isEqualTo(422);
        Resp done = send("POST", "/api/v1/setup/complete", token4, null);
        assertThat(done.status()).isEqualTo(200);
        assertThat(done.json(json).path("completed").asBoolean()).isTrue();
        assertThat(send("GET", "/api/v1/auth/status", token4, null).json(json).path("setupCompleted").asBoolean()).isTrue();
    }

    @Test @Order(16)
    void healthChecksReportEverythingAndDeepCheckVerifiesTheDatabase() throws Exception {
        JsonNode quick = send("GET", "/api/v1/system/health", token4, null).json(json);
        List<String> ids = new ArrayList<>();
        quick.path("checks").forEach(c -> ids.add(c.path("id").asString()));
        assertThat(ids).contains("DATA_DIR_WRITABLE", "DISK_SPACE", "DATABASE", "SCHEMA_VERSION", "DIRTY_SHUTDOWN", "BACKUP_AGE",
                "MEMORY", "CLOCK_SANITY", "ACADEMIC_YEAR_CURRENT", "LOG_SIZE", "APP_VERSIONS");
        assertThat(quick.path("status").asString()).isIn("OK", "INFO", "WARN");
        quick.path("checks").forEach(c -> {
            if (c.path("id").asString().equals("SCHEMA_VERSION")) assertThat(c.path("params").path("version").asString()).isEqualTo("2");
            if (c.path("id").asString().equals("DATABASE")) assertThat(c.path("status").asString()).as(c.toString()).isEqualTo("OK");
            if (c.path("id").asString().equals("DATA_DIR_WRITABLE")) assertThat(c.path("status").asString()).as(c.toString()).isEqualTo("OK");
        });
        JsonNode deep = send("POST", "/api/v1/system/health/deep", token4, null).json(json);
        deep.path("checks").forEach(c -> {
            if (c.path("id").asString().equals("DB_INTEGRITY")) assertThat(c.path("status").asString()).isEqualTo("OK");
            if (c.path("id").asString().equals("UPLOADS_CONSISTENCY")) assertThat(c.path("status").asString()).isEqualTo("OK");
        });
        assertThat(deep.path("checks").size()).isEqualTo(quick.path("checks").size() + 2);
        assertThat(send("GET", "/api/v1/system/info", token4, null).body()).contains("heapMaxMb");
    }

    @Test @Order(17)
    void launchSecretAndCorsAreEnforced() throws Exception {
        assertThat(exec("GET", "/internal/health", null, false, null, null, Map.of()).status()).isEqualTo(403);
        assertThat(exec("GET", "/internal/health", null, false, null, null, Map.of("X-SMS-Launch-Secret", "wrong-secret-wrong-secret")).status()).isEqualTo(403);
        assertThat(exec("GET", "/api/v1/subjects", token4, false, null, null, Map.of()).status()).as("a valid session alone is not enough").isEqualTo(403);

        Map<String, String> good = Map.of("Origin", "app://school", "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "authorization,content-type,x-sms-launch-secret");
        Resp ok = exec("OPTIONS", "/api/v1/auth/login", null, false, null, null, good);
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.headers().firstValue("Access-Control-Allow-Origin").orElse("")).isEqualTo("app://school");
        Map<String, String> evil = Map.of("Origin", "http://evil.example", "Access-Control-Request-Method", "POST");
        assertThat(exec("OPTIONS", "/api/v1/auth/login", null, false, null, null, evil).status()).isEqualTo(403);
    }

    @Test @Order(18)
    void workedFromAKhmerNamedFolderAndNoSecretEverReachedTheLogOrTheAuditTable() throws Exception {
        assertThat(DATA_ROOT.toString()).contains("ទិន្នន័យ").contains(" ");
        assertThat(Files.isRegularFile(DataDirs.database())).isTrue();

        Path log = DataDirs.logs().resolve("backend.log");
        assertThat(Files.isRegularFile(log)).isTrue();
        String logText = Files.readString(log, StandardCharsets.UTF_8);
        String audit = String.join("\n", jdbc.queryForList("select coalesce(actor,'')||' '||action||' '||coalesce(summary,'')||' '||coalesce(before_json,'')||' '||coalesce(after_json,'') from audit_logs", String.class));
        assertThat(SECRETS).as("3 passwords + 4 tokens + 3 keys x (formatted, normalized)").hasSize(13);
        for (String secret : SECRETS) {
            assertThat(logText).as("backend.log must not contain a secret").doesNotContain(secret);
            assertThat(audit).as("audit_logs must not contain a secret").doesNotContain(secret);
        }
        List<String> actions = jdbc.queryForList("select distinct action from audit_logs", String.class);
        assertThat(actions).contains("SETUP_ADMIN_CREATED", "LOGIN_LOCKED", "PASSWORD_CHANGED", "RECOVERY_LOCKED", "RECOVERY_USED",
                "RECOVERY_KEY_REGENERATED", "RECOVERY_KEY_CONFIRMED", "SCHOOL_SETTINGS_UPDATED", "ACADEMIC_YEAR_CREATED", "SETUP_COMPLETED");
    }

    // ---- multipart / filesystem helpers --------------------------------------------------------------------------

    Resp upload(String path, String token, String filename, String mime, byte[] content) throws Exception {
        String boundary = "----sms" + System.nanoTime();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\nContent-Type: " + mime + "\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        out.write(content);
        out.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return exec("POST", path, token, true, out.toByteArray(), "multipart/form-data; boundary=" + boundary, Map.of());
    }

    static List<String> list(Path dir) throws Exception {
        try (Stream<Path> s = Files.list(dir)) { return s.map(p -> p.getFileName().toString()).sorted().toList(); }
    }
}
