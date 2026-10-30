package kh.school.sms.bootstrap;

import java.io.IOException;

/**
 * If Electron dies (crash, kill) its pipe to our stdin closes. We read until EOF and then exit, which runs the JVM
 * shutdown hooks and closes the DB cleanly — no orphan backend, no polling (docs §4.3). Only active when Electron
 * asks for it, so running from an IDE is unaffected.
 */
public final class ParentWatchdog {
    private ParentWatchdog() {}

    public static void startIfRequested() {
        if (!"1".equals(System.getenv("SMS_PARENT_STDIN"))) return;
        Thread t = new Thread(() -> {
            try {
                byte[] buf = new byte[256];
                while (System.in.read(buf) != -1) { /* discard */ }
            } catch (IOException ignored) {
                // a broken pipe also means the parent is gone
            }
            System.exit(0);
        }, "parent-watchdog");
        t.setDaemon(true);
        t.start();
    }
}
