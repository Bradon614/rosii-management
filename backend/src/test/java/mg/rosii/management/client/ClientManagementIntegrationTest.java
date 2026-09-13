package mg.rosii.management.client;

import java.util.UUID;

import javax.sql.DataSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Client management end-to-end against a real PostgreSQL (V1→V3 migrations run
 * through Flyway on context startup). Skipped automatically without Docker.
 *
 * <p>Authentication reuses the existing JWT foundation: a synthetic patronne is
 * persisted and a token is issued directly through {@link JwtService}.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ClientManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "client-tests@example.com";

    @ServiceConnection
    static final PostgreSQLContainer<?> postgres = POSTGRES;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ClientRepository clients;

    @Autowired
    private UserRepository users;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private DataSource dataSource;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        clients.deleteAll();
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    private String createClientJson(String name, String phone1, String phone2, String email, String notes)
            throws Exception {
        return mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "%s", "phone1": "%s", "phone2": %s, "email": %s, "notes": %s}
                                """.formatted(name, phone1, jsonOrNull(phone2), jsonOrNull(email), jsonOrNull(notes))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private static String jsonOrNull(String value) {
        return value == null ? "null" : "\"" + value + "\"";
    }

    @Test
    void flywayAppliedV3Migration() throws Exception {
        try (var rs = dataSource.getConnection().createStatement().executeQuery(
                "SELECT success FROM flyway_schema_history WHERE version = '3'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getBoolean(1)).isTrue();
        }
    }

    @Test
    void createReturns201AndPersistsConventions() throws Exception {
        String body = createClientJson("Alice Rakoto", "+261 34 12 34 56 78",
                "+261 32 98 76 54 32", "Alice@Example.COM", "VIP client");
        UUID id = UUID.fromString(objectMapper.readTree(body).get("id").asText());

        Client saved = clients.findById(id).orElseThrow();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getVersion()).isZero();
        assertThat(saved.getDeletedAt()).isNull();
        // Email normalized to trimmed lowercase.
        assertThat(saved.getEmail()).isEqualTo("alice@example.com");
        // No credentials ever present in the client representation.
        assertThat(body).doesNotContain("password");
    }

    @Test
    void optionalFieldsCanBeAbsent() throws Exception {
        mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Bob Example\", \"phone1\": \"+261 34 00 00 00 00\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.phone2").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.email").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.notes").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void invalidInputIsRejectedWith400() throws Exception {
        mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"\", \"phone1\": \"+261 34 12 34 56\"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Alice\", \"phone1\": \"  \"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Alice\", \"phone1\": \"+261 34\", \"phone2\": \"\"}"))
                .andExpect(status().isBadRequest());

        mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Alice\", \"phone1\": \"+261 34\", \"email\": \"not-an-email\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getReturnsActiveClientAnd404ForUnknown() throws Exception {
        UUID id = UUID.fromString(objectMapper.readTree(
                createClientJson("Alice Rakoto", "+261 34 12 34 56 78", null, null, null)).get("id").asText());

        mockMvc.perform(get("/api/clients/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Alice Rakoto"));

        mockMvc.perform(get("/api/clients/" + UUID.randomUUID()).header("Authorization", auth))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/clients/not-a-uuid").header("Authorization", auth))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listReturnsActiveClientsOnly() throws Exception {
        createClientJson("Alice Rakoto", "+261 34 12 34 56 78", null, null, null);
        createClientJson("Bob Example", "+261 32 98 76 54 32", null, null, null);

        mockMvc.perform(get("/api/clients").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void searchMatchesNamePhonesAndEmailCaseInsensitively() throws Exception {
        createClientJson("Alice Rakoto", "+261 34 12 34 56 78", "+261 32 98 76 54 32", "alice@example.com", null);

        for (String term : new String[]{"RAKOTO", "alice ra", "12 34 56", "98 76", "EXAMPLE.com"}) {
            mockMvc.perform(get("/api/clients").header("Authorization", auth).param("search", term))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1));
        }

        mockMvc.perform(get("/api/clients").header("Authorization", auth).param("search", "zzz-no-match"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        // Blank search behaves like the normal list.
        mockMvc.perform(get("/api/clients").header("Authorization", auth).param("search", "   "))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void updateChangesFieldsAndIncrementsVersion() throws Exception {
        JsonNode created = objectMapper.readTree(
                createClientJson("Alice Rakoto", "+261 34 12 34 56 78", null, null, null));
        UUID id = UUID.fromString(created.get("id").asText());
        long originalVersion = created.get("version").asLong();

        mockMvc.perform(put("/api/clients/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "Alice Rakoto Randria", "phone1": "+261 34 99 99 99 99",
                                 "phone2": null, "email": "alice.r@example.com", "notes": "updated"}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Alice Rakoto Randria"))
                .andExpect(jsonPath("$.email").value("alice.r@example.com"))
                .andExpect(jsonPath("$.version").value(originalVersion + 1));

        Client saved = clients.findById(id).orElseThrow();
        assertThat(saved.getName()).isEqualTo("Alice Rakoto Randria");
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getDeletedAt()).isNull();
    }

    @Test
    void updateOfMissingClientReturns404() throws Exception {
        mockMvc.perform(put("/api/clients/" + UUID.randomUUID()).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Ghost\", \"phone1\": \"+261 34 00 00 00\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void deleteSoftDeletesAndHidesTheClient() throws Exception {
        UUID id = UUID.fromString(objectMapper.readTree(
                createClientJson("Alice Rakoto", "+261 34 12 34 56 78", null, null, null)).get("id").asText());

        mockMvc.perform(delete("/api/clients/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        // Invisible through the normal API...
        mockMvc.perform(get("/api/clients/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/clients").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(0));

        // ...but the row remains in PostgreSQL with deletedAt populated.
        Client kept = clients.findById(id).orElseThrow();
        assertThat(kept.getDeletedAt()).isNotNull();

        // A new client may reuse the same email: email is not unique.
        createClientJson("Alice Rakoto", "+261 34 12 34 56 78", null, "alice@example.com", null);
    }

    @Test
    void unauthenticatedRequestsAreRejected() throws Exception {
        mockMvc.perform(get("/api/clients"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/clients")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Alice\", \"phone1\": \"+261 34 12 34 56\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
