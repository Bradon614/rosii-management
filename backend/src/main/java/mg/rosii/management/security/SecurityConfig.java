package mg.rosii.management.security;

import java.util.List;

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
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Stateless JWT security for the ROSII API.
 *
 * <p>Public: health check, login, and the one-time setup endpoint (which locks
 * itself as soon as a patronne exists). Everything else requires a valid token.
 *
 * <p>CORS: the compiled Tauri window calls the API from its own virtual origin
 * ({@code http://tauri.localhost} on Windows), so an explicit allowlist is
 * required. Origins come from {@code app.cors.allowed-origins} (environment
 * driven) and never contain a wildcard.
 */
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties({ JwtProperties.class, CorsProperties.class })
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            JwtService jwtService,
            UserRepository userRepository,
            RestAuthenticationEntryPoint authenticationEntryPoint,
            CorsConfigurationSource corsConfigurationSource) throws Exception {
        // Built here (not as a bean) so Boot does not also register it as a global servlet filter.
        JwtAuthenticationFilter jwtAuthenticationFilter = new JwtAuthenticationFilter(jwtService, userRepository);
        return http
                // The CorsFilter runs before authorization, so OPTIONS preflight
                // requests are answered without requiring a bearer token.
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
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

    /**
     * Explicit CORS policy for the API.
     *
     * <p>Only the listed origins are accepted. The bearer token is sent in the
     * {@code Authorization} header, so credentials/cookies are deliberately not
     * allowed. {@code Content-Disposition} is exposed because the desktop client
     * reads it to name downloaded invoice and receipt PDFs.
     */
    @Bean
    public CorsConfigurationSource corsConfigurationSource(CorsProperties properties) {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(properties.allowedOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "Accept"));
        configuration.setExposedHeaders(List.of("Content-Disposition"));
        configuration.setAllowCredentials(false);
        // Browsers may cache the preflight answer; it is cheap to re-validate hourly.
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/api/**", configuration);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
