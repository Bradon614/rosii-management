package mg.rosii.management.security;

import java.time.Duration;
import java.util.UUID;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;

import mg.rosii.management.user.Role;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pure unit tests for token issuing/validation (no Spring context, no database).
 */
class JwtServiceTest {

    private static final String SECRET = "unit-test-signing-secret-at-least-32-chars!";

    private final JwtService jwtService = new JwtService(new JwtProperties(SECRET, Duration.ofHours(1)));

    @Test
    void issuesAndParsesTokenWithIdentityClaims() {
        UUID userId = UUID.randomUUID();
        String token = jwtService.generateToken(userId, "patronne@example.com", Role.PATRONNE);

        Claims claims = jwtService.parseToken(token);

        assertThat(claims.getSubject()).isEqualTo("patronne@example.com");
        assertThat(claims.get("uid", String.class)).isEqualTo(userId.toString());
        assertThat(claims.get("role", String.class)).isEqualTo("PATRONNE");
    }

    @Test
    void rejectsExpiredToken() {
        JwtService shortLived = new JwtService(new JwtProperties(SECRET, Duration.ofMillis(1)));
        String token = shortLived.generateToken(UUID.randomUUID(), "patronne@example.com", Role.PATRONNE);

        sleep(50);

        assertThatThrownBy(() -> shortLived.parseToken(token))
                .isInstanceOf(ExpiredJwtException.class);
    }

    @Test
    void rejectsTokenSignedWithAnotherSecret() {
        JwtService attacker = new JwtService(
                new JwtProperties("a-completely-different-signing-secret-32b!", Duration.ofHours(1)));
        String forged = attacker.generateToken(UUID.randomUUID(), "patronne@example.com", Role.PATRONNE);

        assertThatThrownBy(() -> jwtService.parseToken(forged))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void rejectsGarbageToken() {
        assertThatThrownBy(() -> jwtService.parseToken("not-a-jwt"))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void refusesWeakSecret() {
        assertThatThrownBy(() -> new JwtService(new JwtProperties("too-short", Duration.ofHours(1))))
                .isInstanceOf(IllegalStateException.class);
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
