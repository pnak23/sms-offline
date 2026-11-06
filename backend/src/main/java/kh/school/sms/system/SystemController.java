package kh.school.sms.system;

import kh.school.sms.bootstrap.ProductInfo;
import kh.school.sms.bootstrap.StartupState;
import kh.school.sms.common.ApiException;
import kh.school.sms.security.AuthUser;
import kh.school.sms.security.SetupState;
import org.springframework.boot.SpringBootVersion;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/** Layer 3: the System Health page (docs §4B). */
@RestController
@RequestMapping("/api/v1/system")
public class SystemController {
    private final HealthService health;
    private final SetupState setupState;
    private final JdbcTemplate jdbc;

    public SystemController(HealthService health, SetupState setupState, JdbcTemplate jdbc) {
        this.health = health;
        this.setupState = setupState;
        this.jdbc = jdbc;
    }

    /** Who the program is (name, version, developer, channel, copyright). Public: no school data, and the sign-in screen shows it. */
    @GetMapping("/about")
    public ProductInfo about() { return ProductInfo.get(); }

    /** Public while in setup mode (wizard step 1 runs it before any account exists); afterwards it needs a session. */
    @GetMapping("/health")
    public HealthService.Report quick(Authentication a) {
        boolean authenticated = a != null && a.getPrincipal() instanceof AuthUser;
        if (!authenticated && setupState.usersExist()) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED");
        return health.quick();
    }

    @PostMapping("/health/deep")
    public HealthService.Report deep() { return health.deep(); }

    @GetMapping("/info")
    public Map<String, Object> info() {
        Runtime rt = Runtime.getRuntime();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("appVersion", StartupState.APP_VERSION);
        m.put("product", ProductInfo.get());
        m.put("springBoot", SpringBootVersion.getVersion());
        m.put("sqlite", jdbc.queryForObject("select sqlite_version()", String.class));
        m.put("schemaVersion", jdbc.queryForObject("SELECT COALESCE(MAX(CAST(version AS INTEGER)), 0) FROM flyway_schema_history WHERE success = 1", Integer.class));
        m.put("os", System.getProperty("os.name") + " " + System.getProperty("os.version"));
        m.put("java", System.getProperty("java.version"));
        m.put("heapUsedMb", (rt.totalMemory() - rt.freeMemory()) / (1024 * 1024));
        m.put("heapCommittedMb", rt.totalMemory() / (1024 * 1024));
        m.put("heapMaxMb", rt.maxMemory() / (1024 * 1024));
        m.put("startup", StartupState.timings());
        return m;
    }
}
