package kh.school.sms.common;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class TimeConfig {
    /** One injectable clock so throttling and expiry are testable without sleeping. */
    @Bean
    Clock clock() { return Clock.systemUTC(); }
}
