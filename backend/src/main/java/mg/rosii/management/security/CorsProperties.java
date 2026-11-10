package mg.rosii.management.security;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * CORS settings, bound from environment variables (see application.yml).
 *
 * <p>The origins are always an explicit allowlist. A wildcard would let any web
 * page call the API with the bearer token stored by the desktop client, so
 * {@code "*"} (and blank entries) are refused at startup instead of silently
 * producing a permissive policy.
 */
@ConfigurationProperties("app.cors")
public record CorsProperties(List<String> allowedOrigins) {

    public CorsProperties {
        if (allowedOrigins == null || allowedOrigins.isEmpty()) {
            throw new IllegalArgumentException(
                    "app.cors.allowed-origins must list at least one explicit origin");
        }
        allowedOrigins = allowedOrigins.stream()
                .map(origin -> origin == null ? "" : origin.trim())
                .peek(origin -> {
                    if (origin.isEmpty()) {
                        throw new IllegalArgumentException(
                                "app.cors.allowed-origins must not contain a blank origin");
                    }
                    if ("*".equals(origin)) {
                        throw new IllegalArgumentException(
                                "app.cors.allowed-origins must not contain the '*' wildcard; "
                                        + "list explicit origins instead");
                    }
                })
                .toList();
    }
}
