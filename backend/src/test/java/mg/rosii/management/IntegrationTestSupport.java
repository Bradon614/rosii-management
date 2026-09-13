package mg.rosii.management;

import java.sql.DriverManager;

import org.junit.jupiter.api.BeforeAll;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Base class for integration tests that need a real PostgreSQL.
 *
 * <p>One container is shared by every subclass: it is started once (lazily, so
 * the per-class {@code @Testcontainers(disabledWithoutDocker = true)} skip still
 * works without Docker) and never stopped mid-run, keeping its mapped port
 * stable. Combined with identical {@code @SpringBootTest} properties across the
 * subclasses, Spring caches a single application context for the whole suite.
 *
 * <p>This replaces one-container-per-class, which occasionally starved the CI
 * runner (six containers and six cached contexts) and got the container killed
 * mid-class, surfacing as "connection refused" on its mapped port.
 *
 * <p>The container is removed by Testcontainers' resource reaper when the test
 * JVM exits. Because the database is shared, each test class starts from a
 * clean business-data state (schema/migration history is preserved).
 */
public abstract class IntegrationTestSupport {

    protected static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");

    @BeforeAll
    static void startSharedPostgresAndResetData() throws Exception {
        if (!POSTGRES.isRunning()) {
            POSTGRES.start();
        }
        try (var connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
                var statement = connection.createStatement()) {
            // @BeforeAll runs before the Spring context is created, so on a fresh
            // database Flyway has not run yet and there is nothing to reset. The
            // newest migration's table is the marker that the schema exists.
            var rs = statement.executeQuery("SELECT EXISTS (SELECT 1 FROM information_schema.tables"
                    + " WHERE table_name = 'demand_event_details')");
            rs.next();
            if (!rs.getBoolean(1)) {
                return;
            }
            // FK-safe order: children before parents.
            statement.execute("DELETE FROM demand_event_details");
            statement.execute("DELETE FROM demands");
            statement.execute("DELETE FROM clients");
            statement.execute("DELETE FROM services");
            statement.execute("DELETE FROM users");
        }
    }
}
