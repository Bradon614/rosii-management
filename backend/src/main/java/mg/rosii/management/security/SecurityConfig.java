package mg.rosii.management.security;

import mg.rosii.management.user.UserRepository;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * Stateless JWT security for the ROSII API.
 *
 * <p>Public: health check, login, and the one-time setup endpoint (which locks
 * itself as soon as a patronne exists). Everything else requires a valid token.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            JwtService jwtService,
            UserRepository userRepository,
            RestAuthenticationEntryPoint authenticationEntryPoint) throws Exception {
        // Built here (not as a bean) so Boot does not also register it as a global servlet filter.
        JwtAuthenticationFilter jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtService, userRepository);
        return http
                // Stateless API for a desktop client; no CSRF session to protect.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .exceptionHandling(handling -> handling.authenticationEntryPoint(authenticationEntryPoint))
                .authorizeHttpRequests(auth -> auth
                        // Error dispatch must stay reachable, otherwise handling a
                        // controller error (e.g. 409) would itself be blocked and
                        // rewritten as 401 by the entry point.
                        .requestMatchers("/error").permitAll()
                        .requestMatchers("/api/health").permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/auth/login", "/api/auth/setup").permitAll()
                        .anyRequest().authenticated())
                .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class)
                .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
