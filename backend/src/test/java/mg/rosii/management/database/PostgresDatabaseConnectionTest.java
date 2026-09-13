package mg.rosii.management.database;

import java.sql.Connection;
import java.sql.ResultSet;

import javax.sql.DataSource;

import mg.rosii.management.IntegrationTestSupport;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies real PostgreSQL connectivity and that Flyway applied the migrations.
 *
 * <p>Skipped automatically on machines without Docker
 * (the future integration-test strategy is documented in docs/architecture.md).
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PostgresDatabaseConnectionTest extends IntegrationTestSupport {

    @ServiceConnection
    static final PostgreSQLContainer<?> postgres = POSTGRES;

    @Autowired
    private DataSource dataSource;

    @Test
    void appliesFlywayMigrations() throws Exception {
        try (Connection connection = dataSource.getConnection();
                ResultSet rs = connection.createStatement().executeQuery(
                        "SELECT version FROM flyway_schema_history WHERE installed_rank = 1")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getString("version")).isEqualTo("1");
        }
    }
}
