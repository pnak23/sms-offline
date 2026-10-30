package kh.school.sms.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Until the first administrator exists, only the endpoints the setup wizard needs are reachable; everything else
 * answers 401 SETUP_REQUIRED. Nobody can read or configure data before an owner exists.
 */
public class SetupGateFilter extends OncePerRequestFilter {
    private final SetupState state;

    public SetupGateFilter(SetupState state) { this.state = state; }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {
        if (state.usersExist() || allowedInSetupMode(req)) {
            chain.doFilter(req, res);
            return;
        }
        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        res.setContentType("application/json");
        res.getWriter().write("{\"code\":\"SETUP_REQUIRED\"}");
    }

    private static boolean allowedInSetupMode(HttpServletRequest req) {
        String p = req.getRequestURI();
        return "OPTIONS".equals(req.getMethod())
                || p.startsWith("/internal/")
                || p.equals("/api/v1/auth/status")
                || p.equals("/api/v1/auth/setup")
                || p.equals("/api/v1/system/health");
    }
}
