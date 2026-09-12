package mg.rosii.management.security;

import java.time.Duration;
import java.time.temporal.ChronoUnit;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.convert.DurationUnit;

/**
 * JWT settings, bound from environment variables (see application.yml).
 * The secret is never hardcoded; plain numeric expiration values are seconds.
 */
@ConfigurationProperties("jwt")
public record JwtProperties(
        String secret,
        @DurationUnit(ChronoUnit.SECONDS) Duration expiration) {
}
