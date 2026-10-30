package kh.school.sms.bootstrap;

/** Turns a start-up exception into a stable code that Electron maps to a Khmer error window (docs §4B layer 2). */
public final class StartupFailure {
    private StartupFailure() {}

    public static void report(Throwable t) {
        String code = classify(t);
        System.out.println("SMS_STARTUP_FAILED {\"code\":\"" + code + "\"}");
        System.out.flush();
        t.printStackTrace(System.err);
        System.exit(1);
    }

    static String classify(Throwable t) {
        for (Throwable c = t; c != null; c = c.getCause()) {
            String m = String.valueOf(c.getMessage());
            String n = c.getClass().getName();
            int i = m.indexOf("STARTUP_CHECK_FAILED:");
            if (i >= 0) return m.substring(i + "STARTUP_CHECK_FAILED:".length()).split(":")[0];
            if (m.contains("SMS_DATA_DIR") || m.contains("Cannot create the data directory")) return "DATA_DIR_UNAVAILABLE";
            if (m.contains("launch-secret")) return "LAUNCH_SECRET_MISSING";
            if (m.contains("not resolved locally") || m.contains("newer")) return "SCHEMA_NEWER_THAN_APP";
            if (m.contains("database is locked") || m.contains("SQLITE_BUSY")) return "DATABASE_LOCKED";
            if (m.contains("SQLITE_CORRUPT") || m.contains("malformed")) return "DATABASE_CORRUPT";
            if (n.startsWith("org.flywaydb")) return "MIGRATION_FAILED";
            if (c.getCause() == c) break;
        }
        return "STARTUP_FAILED";
    }
}
