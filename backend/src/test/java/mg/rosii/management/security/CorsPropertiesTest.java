package mg.rosii.management.security;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

/**
 * The CORS allowlist configuration refuses values that would silently make the
 * API reachable from any web page.
 */
class CorsPropertiesTest {

    @Test
    void trimsConfiguredOrigins() {
        assertThat(new CorsProperties(List.of(" http://tauri.localhost ", "http://localhost:5173"))
                .allowedOrigins())
                .containsExactly("http://tauri.localhost", "http://localhost:5173");
    }

    @Test
    void refusesTheWildcard() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new CorsProperties(List.of("*")))
                .withMessageContaining("wildcard");
    }

    @Test
    void refusesABlankOrigin() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new CorsProperties(List.of("http://tauri.localhost", "  ")))
                .withMessageContaining("blank");
    }

    @Test
    void refusesAnEmptyAllowlist() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> new CorsProperties(List.of()))
                .withMessageContaining("at least one");
    }
}