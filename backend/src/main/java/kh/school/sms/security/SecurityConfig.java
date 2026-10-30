package kh.school.sms.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain chain(HttpSecurity http, SessionRegistry sessions) throws Exception {
        http.csrf(c -> c.disable())                       // stateless bearer tokens, no cookies
                .cors(Customizer.withDefaults())
                .anonymous(a -> a.disable())
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(b -> b.disable())
                .formLogin(f -> f.disable())
                .logout(l -> l.disable())
                .authorizeHttpRequests(a -> a
                        .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .requestMatchers("/internal/**",
                                "/api/v1/auth/status", "/api/v1/auth/login", "/api/v1/auth/setup", "/api/v1/auth/recover",
                                "/api/v1/system/health").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                    res.setStatus(401);
                    res.setContentType("application/json");
                    res.getWriter().write("{\"code\":\"UNAUTHENTICATED\"}");
                }))
                .addFilterBefore(new SessionTokenFilter(sessions), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Runs before everything else, including Spring Security. */
    @Bean
    FilterRegistrationBean<LaunchSecretFilter> launchSecretFilter(@Value("${sms.launch-secret:}") String secret) {
        FilterRegistrationBean<LaunchSecretFilter> reg = new FilterRegistrationBean<>(new LaunchSecretFilter(secret));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE);
        return reg;
    }

    @Bean
    FilterRegistrationBean<SetupGateFilter> setupGateFilter(SetupState state) {
        FilterRegistrationBean<SetupGateFilter> reg = new FilterRegistrationBean<>(new SetupGateFilter(state));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 1);
        return reg;
    }

    @Bean
    CorsConfigurationSource corsConfigurationSource(@Value("${sms.cors.allowed-origins}") List<String> origins) {
        CorsConfiguration c = new CorsConfiguration();
        c.setAllowedOrigins(origins);                     // app://school (production) and the Nuxt dev server
        c.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        c.setAllowedHeaders(List.of("Authorization", "Content-Type", LaunchSecretFilter.HEADER));
        c.setMaxAge(600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", c);
        return source;
    }

    /** BCrypt cost 12; the hash embeds the cost, so it can be raised later and rehashed at next login. */
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }
}
