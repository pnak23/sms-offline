package kh.school.sms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Every request must carry the per-launch secret Electron injects (docs §4.4); compared in constant time. A web
 * page in a browser or another local program cannot call the API without it. CORS preflights are the one
 * exception: they carry no data and a browser cannot attach custom headers to them.
 */
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
        boolean preflight = "OPTIONS".equals(req.getMethod()) && req.getHeader("Access-Control-Request-Method") != null;
        String given = req.getHeader(HEADER);
        boolean ok = preflight || (given != null && MessageDigest.isEqual(expected, given.getBytes(StandardCharsets.UTF_8)));
        if (!ok) {
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setContentType("application/json");
            res.getWriter().write("{\"code\":\"FORBIDDEN\"}");
            return;
        }
        chain.doFilter(req, res);
    }
}
