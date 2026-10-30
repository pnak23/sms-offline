package kh.school.sms.security;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/** Server-side session limits (docs §4A.1, default 4): 30 min idle, 12 h absolute. */
@ConfigurationProperties(prefix = "sms.session")
public record SessionProperties(@DefaultValue("30") int idleMinutes, @DefaultValue("12") int absoluteHours) {}
