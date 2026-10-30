package spike;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import spike.web.SessionRegistry;

import java.net.ConnectException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collections;
import java.util.Enumeration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

class WebSpikeTest extends SpikeBase {
    static final String SECRET = "test-launch-secret-0123456789";
    static final String KHMER_PASSWORD = "ពាក្យសម្ងាត់-1234";

    @Value("${local.server.port}") int port;
    @Autowired AppUserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired SessionRegistry sessions;

    final HttpClient http = HttpClient.newHttpClient();

    private record Resp(int status, String body) {}

    private Resp call(String method, String path, String token, boolean withSecret, String json) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (withSecret) b.header("X-SMS-Launch-Secret", SECRET);
        if (token != null) b.header("Authorization", "Bearer " + token);
        if (json != null) b.header("Content-Type", "application/json; charset=UTF-8");
        b.method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8));
        HttpResponse<String> r = http.send(b.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        return new Resp(r.statusCode(), r.body());
    }

    private String loginToken(String username) throws Exception {
        if (users.findByUsername(username).isEmpty()) {
            AppUser u = new AppUser();
            u.setUsername(username);
            u.setDisplayName("អ្នកគ្រប់គ្រង");
            u.setPasswordHash(encoder.encode(KHMER_PASSWORD));
            u.setRecoveryKeyHash("r");
            Instant now = Instant.now();
            u.setPasswordChangedAt(now);
            u.setRecoveryKeyCreatedAt(now);
            u.setCreatedAt(now);
            u.setUpdatedAt(now);
            users.saveAndFlush(u);
        }
        Resp r = call("POST", "/api/v1/auth/login", null, true, "{\"username\":\"" + username + "\",\"password\":\"" + KHMER_PASSWORD + "\"}");
        assertThat(r.status()).isEqualTo(200);
        String body = r.body();
        int i = body.indexOf("\"token\":\"") + 9;
        return body.substring(i, body.indexOf('"', i));
    }

    @Test
    void backendListensOnLoopbackOnly() throws Exception {
        assertThat(call("GET", "/internal/health", null, true, null).status()).isEqualTo(200);
        InetAddress lan = null;
        Enumeration<NetworkInterface> nics = NetworkInterface.getNetworkInterfaces();
        while (nics.hasMoreElements() && lan == null) {
            NetworkInterface n = nics.nextElement();
            if (!n.isUp() || n.isLoopback() || n.isVirtual()) continue;
            for (InetAddress a : Collections.list(n.getInetAddresses())) {
                if (a instanceof java.net.Inet4Address && !a.isLoopbackAddress() && !a.isLinkLocalAddress()) { lan = a; break; }
            }
        }
        // Authoritative check: the listening socket's local address, from the OS.
        Process p = new ProcessBuilder("netstat", "-ano", "-p", "tcp").redirectErrorStream(true).start();
        String netstat = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        String listening = netstat.lines().filter(l -> l.contains("LISTENING") && l.contains(":" + port + " ")).map(String::trim).findFirst().orElse("(not found)");
        say("loopback-only: netstat -> " + listening);
        assertThat(listening).contains("127.0.0.1:" + port);
        assertThat(listening).doesNotContain("0.0.0.0:" + port);
        // Corroboration: a LAN address must not accept a connection (a firewall may make it time out instead of refusing).
        if (lan == null) { say("loopback-only: no non-loopback IPv4 address on this PC, LAN probe skipped"); return; }
        final InetAddress target = lan;
        Throwable t;
        try (Socket s = new Socket()) {
            t = catchThrowable(() -> s.connect(new InetSocketAddress(target, port), 2000));
        }
        say("loopback-only: LAN probe " + lan.getHostAddress() + ":" + port + " -> " + (t == null ? "CONNECTED (BAD)" : t.getClass().getSimpleName()));
        assertThat((Object) t).isNotNull();
    }

    @Test
    void launchSecretIsRequiredOnEveryRequest() throws Exception {
        Resp none = call("GET", "/internal/health", null, false, null);
        HttpResponse<String> bad = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/internal/health"))
                .header("X-SMS-Launch-Secret", "wrong-secret-wrong-secret").build(), HttpResponse.BodyHandlers.ofString());
        say("secret: missing=" + none.status() + " wrong=" + bad.statusCode());
        assertThat(none.status()).isEqualTo(403);
        assertThat(bad.statusCode()).isEqualTo(403);
        assertThat(call("GET", "/api/v1/me", null, false, null).status()).isEqualTo(403);
    }

    @Test
    void sessionTokenFlowLoginMeRevoke() throws Exception {
        assertThat(call("GET", "/api/v1/me", null, true, null)).extracting(Resp::status).isEqualTo(401);
        Resp wrong = call("POST", "/api/v1/auth/login", null, true, "{\"username\":\"flow\",\"password\":\"nope\"}");
        assertThat(wrong.status()).isEqualTo(401);
        assertThat(wrong.body()).contains("INVALID_CREDENTIALS");
        String token = loginToken("flow");
        Resp me = call("GET", "/api/v1/me", token, true, null);
        assertThat(me.status()).isEqualTo(200);
        assertThat(me.body()).contains("flow");
        sessions.revokeAll();
        assertThat(call("GET", "/api/v1/me", token, true, null).status()).isEqualTo(401);
        say("token flow: 401 unauthenticated -> 401 wrong password -> 200 with token -> 401 after revoke");
    }

    @Test
    void validationReturnsMachineCodesAndJacksonWritesIsoDates() throws Exception {
        String token = loginToken("val");
        Resp ok = call("POST", "/api/v1/echo", token, true, "{\"nameKm\":\"សុខ ចាន់ណា\",\"dateOfBirth\":\"2018-05-01\"}");
        say("echo ok: " + ok.status() + " " + ok.body());
        assertThat(ok.status()).isEqualTo(200);
        assertThat(ok.body()).contains("\"dateOfBirth\":\"2018-05-01\"").contains("\"createdAt\":\"2026-10-30T08:15:30Z\"").contains("សុខ ចាន់ណា");
        Resp bad = call("POST", "/api/v1/echo", token, true, "{\"nameKm\":\"  \",\"dateOfBirth\":\"2999-01-01\"}");
        say("echo invalid: " + bad.status() + " " + bad.body());
        assertThat(bad.status()).isEqualTo(422);
        assertThat(bad.body()).contains("VALIDATION_FAILED").contains("nameKm").contains("NotBlank").contains("dateOfBirth").contains("Past");
    }

    @Test
    void sqliteConstraintsMapToApiCodes() throws Exception {
        String token = loginToken("cons");
        Resp dup = call("POST", "/api/v1/dup", token, true, null);
        Resp orphan = call("POST", "/api/v1/orphan", token, true, null);
        say("dup -> " + dup.status() + " " + dup.body());
        say("orphan -> " + orphan.status() + " " + orphan.body());
        assertThat(dup.status()).isEqualTo(409);
        assertThat(dup.body()).contains("DUPLICATE").contains("subjects.code");
        assertThat(orphan.status()).isEqualTo(409);
        assertThat(orphan.body()).contains("REFERENCE_VIOLATION");
    }

    @Test
    void bcryptCost12TimingAndThe72ByteRule() {
        String khmer = "ពាក្យសម្ងាត់ខ្មែរ"; // Khmer code points are 3 bytes each in UTF-8
        int bytes = khmer.getBytes(StandardCharsets.UTF_8).length;
        assertThat(bytes).isLessThanOrEqualTo(72);
        long t0 = System.nanoTime();
        String hash = encoder.encode(khmer);
        long ms = (System.nanoTime() - t0) / 1_000_000;
        assertThat(encoder.matches(khmer, hash)).isTrue();
        assertThat(encoder.matches("wrong", hash)).isFalse();
        String tooLongKhmer = "ពាក្យសម្ងាត់ខ្មែរវែងមែនទែន"; // 75 bytes
        String eighty = "a".repeat(80);
        Throwable t1 = catchThrowable(() -> encoder.encode(tooLongKhmer));
        Throwable t2 = catchThrowable(() -> encoder.encode(eighty));
        say("bcrypt cost 12: " + ms + " ms on this PC (first call, incl. JIT warm-up); Khmer sample " + khmer.codePointCount(0, khmer.length())
                + " chars / " + bytes + " bytes OK; 75-byte Khmer -> " + (t1 == null ? "accepted" : "rejected (" + t1.getClass().getSimpleName() + ")")
                + "; 80-byte ASCII -> " + (t2 == null ? "accepted" : "rejected (" + t2.getClass().getSimpleName() + ")"));
        assertThat(hash).startsWith("$2a$12$");
        assertThat(t1).isInstanceOf(IllegalArgumentException.class);
        assertThat(t2).isInstanceOf(IllegalArgumentException.class);
    }
}
