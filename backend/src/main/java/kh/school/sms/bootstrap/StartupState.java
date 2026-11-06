package kh.school.sms.bootstrap;

import java.lang.management.ManagementFactory;
import java.util.LinkedHashMap;
import java.util.Map;

/** Process-wide start-up facts: phase timestamps (for the performance log) and the dirty-shutdown flag. */
public final class StartupState {
    /** The program's version: read from release.json (one authoritative file, docs/RELEASE.md), never typed here. */
    public static final String APP_VERSION = ProductInfo.get().version();

    public static volatile long mainEnteredAt;
    public static volatile long environmentPreparedAt;
    public static volatile long contextRefreshedAt;
    public static volatile long readyAt;
    public static volatile long flywayMs;
    /** True when the previous run left config/running.lock behind (crash, power loss, force kill). */
    public static volatile boolean dirtyShutdown;

    private StartupState() {}

    public static long jvmStartedAt() { return ManagementFactory.getRuntimeMXBean().getStartTime(); }

    /** Millisecond durations of each phase; zero while a phase has not happened yet. */
    public static Map<String, Object> timings() {
        Map<String, Object> m = new LinkedHashMap<>();
        long jvm = jvmStartedAt();
        m.put("jvmBootMs", mainEnteredAt > 0 ? mainEnteredAt - jvm : 0);
        m.put("environmentMs", environmentPreparedAt > 0 ? environmentPreparedAt - mainEnteredAt : 0);
        m.put("contextRefreshMs", contextRefreshedAt > 0 ? contextRefreshedAt - environmentPreparedAt : 0);
        m.put("flywayMs", flywayMs);
        m.put("readyAfterMainMs", readyAt > 0 ? readyAt - mainEnteredAt : 0);
        m.put("readyAfterJvmStartMs", readyAt > 0 ? readyAt - jvm : 0);
        return m;
    }
}
