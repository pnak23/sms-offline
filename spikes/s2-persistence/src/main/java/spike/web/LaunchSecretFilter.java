package spike.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** Every request must carry the per-launch secret that Electron injects; compared in constant time. */
public class LaunchSecretFilter extends OncePerRequestFilter {
    public static final String HEADER = "X-SMS-Launch-Secret";
    private final byte[] expected;

    public LaunchSecretFilter(String secret) {
        if (secret == null || secret.length() < 16) {
            throw new IllegalStateException("sms.launch-secret must be set (>= 16 chars); refusing to start");
        }
        this.expected = secret.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        String given = req.getHeader(HEADER);
        boolean ok = given != null && MessageDigest.isEqual(expected, given.getBytes(StandardCharsets.UTF_8));
        if (!ok) {
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setContentType("application/json");
            res.getWriter().write("{\"code\":\"FORBIDDEN\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
