package mg.rosii.management.user;

import mg.rosii.management.IntegrationTestSupport;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Verifies the users table (V2 migration) against a real PostgreSQL.
 * Skipped automatically on machines without Docker.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class UserRepositoryIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @AfterEach
    void cleanUp() {
        userRepository.deleteAll();
    }

    @Test
    void createsUserWithUuidAndHashedPassword() {
        String rawPassword = "first-secret-password";
        User user = new User("patronne@example.com", passwordEncoder.encode(rawPassword), Role.PATRONNE);

        User saved = userRepository.saveAndFlush(user);

        assertThat(saved.getId()).isNotNull();
        // BCrypt hash stored, never the plaintext.
        assertThat(saved.getPasswordHash()).startsWith("$2");
        assertThat(saved.getPasswordHash()).isNotEqualTo(rawPassword);
        assertThat(passwordEncoder.matches(rawPassword, saved.getPasswordHash())).isTrue();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getVersion()).isZero();
    }

    @Test
    void rejectsDuplicateActiveEmail() {
        userRepository.saveAndFlush(new User("taken@example.com", hash(), Role.PATRONNE));

        assertThatThrownBy(() ->
                userRepository.saveAndFlush(new User("taken@example.com", hash(), Role.PATRONNE)))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void softDeletedEmailCanBeReused() {
        User original = userRepository.saveAndFlush(new User("reuse@example.com", hash(), Role.PATRONNE));
        original.markDeleted();
        userRepository.saveAndFlush(original);

        User replacement = userRepository.saveAndFlush(new User("reuse@example.com", hash(), Role.PATRONNE));

        assertThat(replacement.getId()).isNotEqualTo(original.getId());
    }

    private String hash() {
        return passwordEncoder.encode("some-password");
    }
}
