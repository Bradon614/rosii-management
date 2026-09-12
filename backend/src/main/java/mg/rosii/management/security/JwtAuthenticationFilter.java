package mg.rosii.management.security;

import java.io.IOException;
import java.util.List;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates requests carrying a {@code Authorization: Bearer <jwt>} header.
 *
 * <p>The user is reloaded from the database on each request so that a
 * soft-deleted account loses access immediately, without waiting for token
 * expiry. Invalid tokens simply leave the context empty; the configured
 * authentication entry point turns that into a 401.
 *
 * <p>Instantiated by {@link SecurityConfig} (not a servlet component) so the
 * filter runs exactly once, inside the security chain.
 */
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            try {
                Claims claims = jwtService.parseToken(header.substring(BEARER_PREFIX.length()));
                userRepository.findByEmailAndDeletedAtIsNull(claims.getSubject())
                        .ifPresent(user -> authenticate(user));
            } catch (JwtException | IllegalArgumentException e) {
                // Malformed, expired or forged token: stay anonymous, entry point answers 401.
                SecurityContextHolder.clearContext();
            }
        }
        filterChain.doFilter(request, response);
    }

    private void authenticate(User user) {
        var authentication = new UsernamePasswordAuthenticationToken(
                user, null, List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
