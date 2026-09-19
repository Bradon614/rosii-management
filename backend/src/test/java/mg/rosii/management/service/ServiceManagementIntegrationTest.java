package mg.rosii.management.service;

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
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Catalogue management end-to-end against a real PostgreSQL (Flyway V1→V4 run
 * on context startup). Skipped automatically without Docker.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ServiceManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "catalogue-tests@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ServiceRepository services;

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
        services.deleteAll();
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    private String createJson(String name, String category, String description, String defaultUnit,
            String price, String active) throws Exception {
        return mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name": "%s", "category": "%s", "description": %s,
                                 "defaultUnit": "%s", "referencePrice": %s, "active": %s}
                                """.formatted(name, category, jsonTextOrNull(description),
                                defaultUnit, price, active == null ? "null" : active)))
                .andReturn().getResponse().getContentAsString();
    }

    /** {@code value} may be null (JSON null) or already-quoted text (""...""). */
    private static String jsonTextOrNull(String value) {
        if (value == null) {
            return "null";
        }
        return value.startsWith("\"") ? value : "\"" + value + "\"";
    }

    private UUID createService(String name, String category, String description, String defaultUnit, String price)
            throws Exception {
        String body = createJson(name, category, description, defaultUnit, price, null);
        return UUID.fromString(objectMapper.readTree(body).get("id").asText());
    }

    private String updateJson(String name, String category, String description, String defaultUnit,
            String price, long version) {
        return """
                {"name": "%s", "category": "%s", "description": %s,
                 "defaultUnit": "%s", "referencePrice": %s, "version": %d}
                """.formatted(name, category, jsonTextOrNull(description), defaultUnit, price, version);
    }

    @Test
    void flywayAppliedV4Migration() throws Exception {
        try (var rs = dataSource.getConnection().createStatement().executeQuery(
                "SELECT success FROM flyway_schema_history WHERE version = '4'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getBoolean(1)).isTrue();
        }
    }

    @Test
    void createReturns201AndPersistsConventions() throws Exception {
        String body = createJson("Traiteur premium", "CATERING", "  Menu complet pour mariages  ",
                "personne", "150000.00", null);
        JsonNode json = objectMapper.readTree(body);
        UUID id = UUID.fromString(json.get("id").asText());

        assertThat(json.get("active").asBoolean()).isTrue(); // active defaults to true
        assertThat(json.get("version").asLong()).isZero();

        Service saved = services.findById(id).orElseThrow();
        assertThat(saved.getId()).isNotNull();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getDeletedAt()).isNull();
        assertThat(saved.getVersion()).isZero();
        assertThat(saved.getDescription()).isEqualTo("Menu complet pour mariages"); // trimmed
    }

    @Test
    void blankOptionalDescriptionBecomesNull() throws Exception {
        String body = createJson("Fleuriste basic", "FLORIST", "\"   \"", "bouquet", "50000", null);
        assertThat(objectMapper.readTree(body).get("description").isNull()).isTrue();
    }

    @Test
    void invalidRequestsAreRejected() throws Exception {
        // Invalid category value.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"X\", \"category\": \"CATERING_INVALID\", \"defaultUnit\": \"unité\", \"referencePrice\": 10}"))
                .andExpect(status().isBadRequest());

        // Missing name.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"category\": \"FLORIST\", \"defaultUnit\": \"unité\", \"referencePrice\": 10}"))
                .andExpect(status().isBadRequest());

        // Blank name.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"  \", \"category\": \"FLORIST\", \"defaultUnit\": \"unité\", \"referencePrice\": 10}"))
                .andExpect(status().isBadRequest());

        // Blank defaultUnit.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"X\", \"category\": \"FLORIST\", \"defaultUnit\": \"  \", \"referencePrice\": 10}"))
                .andExpect(status().isBadRequest());

        // Negative reference price.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"X\", \"category\": \"FLORIST\", \"defaultUnit\": \"unité\", \"referencePrice\": -1}"))
                .andExpect(status().isBadRequest());

        // Zero reference price is accepted.
        mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Gratuit\", \"category\": \"OTHER\", \"defaultUnit\": \"unité\", \"referencePrice\": 0}"))
                .andExpect(status().isCreated());
    }

    @Test
    void listExcludesDeletedAndOrdersDeterministicallyByName() throws Exception {
        createService("Zeta Service", "OTHER", null, "unité", "10");
        createService("alpha service", "DECORATION", null, "unité", "20");
        UUID mid = createService("Mid Service", "FLORIST", null, "unité", "30");

        mockMvc.perform(delete("/api/services/" + mid).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/services").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // Case-insensitive name ordering: alpha before Zeta; Mid (deleted) absent.
                .andExpect(jsonPath("$[0].name").value("alpha service"))
                .andExpect(jsonPath("$[1].name").value("Zeta Service"));
    }

    @Test
    void searchMatchesNameAndDescriptionCaseInsensitively() throws Exception {
        createService("Traiteur premium", "CATERING", "Menus pour mariage et gala", "personne", "150000");
        createService("Décoration salle", "DECORATION", null, "unité", "80000");

        mockMvc.perform(get("/api/services").header("Authorization", auth).param("search", "TRAITEUR"))
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/services").header("Authorization", auth).param("search", "mariage"))
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/services").header("Authorization", auth).param("search", "zzz-absent"))
                .andExpect(jsonPath("$.length()").value(0));
        // Blank search behaves like no search.
        mockMvc.perform(get("/api/services").header("Authorization", auth).param("search", "   "))
                .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void filtersWorkIndividuallyAndCombined() throws Exception {
        createService("Traiteur A", "CATERING", "mariage", "personne", "100");
        createService("Déco B", "DECORATION", null, "unité", "200");
        String inactive = createJson("Voiture C", "CAR_RENTAL", null, "jour", "300", "false");
        UUID inactiveId = UUID.fromString(objectMapper.readTree(inactive).get("id").asText());

        mockMvc.perform(get("/api/services").header("Authorization", auth).param("category", "CATERING"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].name").value("Traiteur A"));
        mockMvc.perform(get("/api/services").header("Authorization", auth).param("active", "true"))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/services").header("Authorization", auth).param("active", "false"))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(inactiveId.toString()));
        // Combined: search + category + active.
        mockMvc.perform(get("/api/services").header("Authorization", auth)
                        .param("search", "traiteur").param("category", "CATERING").param("active", "true"))
                .andExpect(jsonPath("$.length()").value(1));
        // Combined with no match.
        mockMvc.perform(get("/api/services").header("Authorization", auth)
                        .param("search", "traiteur").param("category", "DECORATION"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void getByIdReturnsServiceAndHandlesErrors() throws Exception {
        UUID id = createService("Hall climatisé", "HALL_RENTAL", null, "jour", "900000");

        mockMvc.perform(get("/api/services/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Hall climatisé"))
                .andExpect(jsonPath("$.category").value("HALL_RENTAL"));

        mockMvc.perform(get("/api/services/" + UUID.randomUUID()).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/services/not-a-uuid").header("Authorization", auth))
                .andExpect(status().isBadRequest());
    }

    @Test
    void updateChangesFieldsAndIncrementsVersion() throws Exception {
        UUID id = createService("Traiteur basic", "CATERING", null, "personne", "100000");

        mockMvc.perform(put("/api/services/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson("Traiteur deluxe", "CATERING", "\"nouveau\"", "personne", "180000.50", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Traiteur deluxe"))
                .andExpect(jsonPath("$.referencePrice").value(180000.50))
                .andExpect(jsonPath("$.version").value(1));

        Service saved = services.findById(id).orElseThrow();
        assertThat(saved.getVersion()).isEqualTo(1);
        assertThat(saved.getDeletedAt()).isNull();
    }

    @Test
    void updateWithStaleVersionReturns409() throws Exception {
        UUID id = createService("Fleurd", "FLORIST", null, "bouquet", "20000");

        // First update succeeds (version 0 -> 1).
        mockMvc.perform(put("/api/services/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson("Fleuriste", "FLORIST", null, "bouquet", "25000", 0)))
                .andExpect(status().isOk());

        // Second update still claims version 0 -> stale -> 409.
        mockMvc.perform(put("/api/services/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson("Renamed again", "FLORIST", null, "bouquet", "30000", 0)))
                .andExpect(status().isConflict());
    }

    @Test
    void updateOfMissingServiceReturns404() throws Exception {
        mockMvc.perform(put("/api/services/" + UUID.randomUUID()).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson("Ghost", "OTHER", null, "unité", "1", 0)))
                .andExpect(status().isNotFound());
    }

    @Test
    void patchActiveTogglesStateAndPreservesFields() throws Exception {
        UUID id = createService("Navette aéroport", "TRANSPORT", "service navette", "course", "75000");

        mockMvc.perform(patch("/api/services/" + id + "/active").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\": false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(false))
                .andExpect(jsonPath("$.name").value("Navette aéroport"))
                .andExpect(jsonPath("$.description").value("service navette"))
                .andExpect(jsonPath("$.referencePrice").value(75000));

        mockMvc.perform(patch("/api/services/" + id + "/active").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\": true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.active").value(true));

        // Invalid body (missing active) -> 400.
        mockMvc.perform(patch("/api/services/" + id + "/active").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteSoftDeletesAndHidesTheService() throws Exception {
        UUID id = createService("Prestation temporaire", "OTHER", null, "unité", "1000");

        mockMvc.perform(delete("/api/services/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/services/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/services").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(0));
        // Deleted service cannot be updated or re-activated either.
        mockMvc.perform(patch("/api/services/" + id + "/active").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\": true}"))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/services/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());

        // The row remains in PostgreSQL with deletedAt populated.
        Service kept = services.findById(id).orElseThrow();
        assertThat(kept.getDeletedAt()).isNotNull();
    }

    @Test
    void unauthenticatedRequestsAreRejectedOnAllEndpoints() throws Exception {
        mockMvc.perform(get("/api/services")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/services").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"X\", \"category\": \"OTHER\", \"defaultUnit\": \"u\", \"referencePrice\": 1}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/services/" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(updateJson("X", "OTHER", null, "u", "1", 0)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/services/" + UUID.randomUUID() + "/active").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"active\": true}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/services/" + UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
