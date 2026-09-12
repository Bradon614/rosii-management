package mg.rosii.management.security;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;

import javax.crypto.SecretKey;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

import mg.rosii.management.user.Role;

import org.springframework.stereotype.Service;

/**
 * Issues and validates HMAC-signed JWT access tokens.
 *
 * <p>Tokens carry only identity claims (user id, email, role) — never credentials.
 * Offline authentication (local token handling on the desktop) is a later feature;
 * this service covers the online authentication foundation only.
 */
@Service
public class JwtService {

    private static final int MIN_SECRET_BYTES = 32;

    private final SecretKey key;
    private final Duration expiration;

    public JwtService(JwtProperties properties) {
        String secret = properties.secret();
        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < MIN_SECRET_BYTES) {
            throw new IllegalStateException(
                    "JWT_SECRET must be configured with at least " + MIN_SECRET_BYTES
                            + " bytes (see .env.example); refusing to start without a signing key");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expiration = properties.expiration();
    }

    public String generateToken(UUID userId, String email, Role role) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(email)
                .claim("uid", userId.toString())
                .claim("role", role.name())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(expiration)))
                .signWith(key)
                .compact();
    }

    /** @throws io.jsonwebtoken.JwtException if the token is malformed, expired or forged */
    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(key)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public long expirationSeconds() {
        return expiration.toSeconds();
    }
}
