package mg.rosii.management;

import java.sql.DriverManager;

import org.junit.jupiter.api.BeforeAll;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
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
                    + " WHERE table_name = 'proposal_lines')");
            rs.next();
            if (!rs.getBoolean(1)) {
                return;
            }
            // FK-safe order: children before parents.
            statement.execute("DELETE FROM proposal_lines");
            statement.execute("DELETE FROM proposals");
            statement.execute("DELETE FROM demand_event_details");
            statement.execute("DELETE FROM demands");
            statement.execute("DELETE FROM clients");
            statement.execute("DELETE FROM services");
            statement.execute("DELETE FROM users");
        }
    }

    // The container is intentionally never stopped: @AfterAll runs once per
    // concrete test class, so stopping it here would remove the container while
    // later subclasses still need it (and their cached Spring context / Hikari
    // pool would keep the previous mapped port, failing with ConnectException).
    // Ryuk removes the container when the test JVM exits.

    @DynamicPropertySource
    static void configureDatasource(DynamicPropertyRegistry registry) {
        // Register the container's JDBC URL so Spring Boot connects to the
        // single shared PostgreSQL started in @BeforeAll instead of spinning up
        // a second one via @ServiceConnection.
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
