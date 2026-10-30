package kh.school.sms.bootstrap;

import org.springframework.boot.context.event.ApplicationEnvironmentPreparedEvent;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.core.metrics.ApplicationStartup;
import org.springframework.core.metrics.StartupStep;
import org.springframework.boot.context.metrics.buffering.BufferingApplicationStartup;

import java.util.Comparator;

public class StartupTimingListener implements ApplicationListener<ApplicationEvent> {
    private static volatile BufferingApplicationStartup trace;

    /** Records every Spring start-up step so the slowest ones can be printed (dev diagnostic only). */
    public static ApplicationStartup tracing() {
        trace = new BufferingApplicationStartup(50_000);
        return trace;
    }

    @Override
    public void onApplicationEvent(ApplicationEvent e) {
        if (e instanceof ApplicationEnvironmentPreparedEvent) {
            StartupState.environmentPreparedAt = System.currentTimeMillis();
        } else if (e instanceof ContextRefreshedEvent && StartupState.contextRefreshedAt == 0) {
            StartupState.contextRefreshedAt = System.currentTimeMillis();
        } else if (e instanceof ApplicationReadyEvent) {
            StartupState.readyAt = System.currentTimeMillis();
            if (trace != null) printSlowest();
        }
    }

    private static void printSlowest() {
        trace.getBufferedTimeline().getEvents().stream()
                .sorted(Comparator.comparing((org.springframework.boot.context.metrics.buffering.StartupTimeline.TimelineEvent t) -> t.getDuration()).reversed())
                .limit(25)
                .forEach(t -> {
                    StringBuilder tags = new StringBuilder();
                    for (StartupStep.Tag tag : t.getStartupStep().getTags()) tags.append(' ').append(tag.getKey()).append('=').append(tag.getValue());
                    System.out.println("SMS_TRACE " + t.getDuration().toMillis() + " ms  " + t.getStartupStep().getName() + tags);
                });
    }
}
