package mg.rosii.management.database;

import java.sql.Connection;
import java.sql.ResultSet;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies real PostgreSQL connectivity and that Flyway applied the migrations.
 *
 * <p>Skipped automatically on machines without Docker
 * (the future integration-test strategy is documented in docs/architecture.md).
 */
@SpringBootTest
@Testcontainers(disabledWithoutDocker = true)
class PostgresDatabaseConnectionTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

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
