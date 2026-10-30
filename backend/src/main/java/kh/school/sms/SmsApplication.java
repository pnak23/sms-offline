package kh.school.sms;

import kh.school.sms.bootstrap.DataDirs;
import kh.school.sms.bootstrap.ParentWatchdog;
import kh.school.sms.bootstrap.RunningLock;
import kh.school.sms.bootstrap.StartupFailure;
import kh.school.sms.bootstrap.StartupState;
import kh.school.sms.bootstrap.StartupTimingListener;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@ConfigurationPropertiesScan
public class SmsApplication {

    public static void main(String[] args) {
        StartupState.mainEnteredAt = System.currentTimeMillis();
        System.setProperty("java.awt.headless", "true");   // image handling only; never a window
        try {
            DataDirs.prepareFromEnvironment();
            RunningLock.acquire();
            ParentWatchdog.startIfRequested();
            SpringApplication app = new SpringApplication(SmsApplication.class);
            app.addListeners(new StartupTimingListener());
            if (Boolean.getBoolean("sms.startup-trace")) {   // developer diagnostic: -Dsms.startup-trace=true
                app.setApplicationStartup(StartupTimingListener.tracing());
            }
            app.run(args);
        } catch (Throwable t) {
            StartupFailure.report(t);
        }
    }
}
