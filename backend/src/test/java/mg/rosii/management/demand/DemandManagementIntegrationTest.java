package mg.rosii.management.demand;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Demand management end-to-end against a real PostgreSQL (Flyway V1→V5 run on
 * context startup). Skipped automatically without Docker.
 *
 * <p>Covers the Feature 06 checkpoints: validation, budget rules, client
 * relationship, CRUD, soft delete, optimistic locking, combined filters,
 * cross-field search, event details lifecycle and security.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class DemandManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "demand-tests@example.com";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private DemandRepository demands;

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
    void resetDataAndAuthenticate() throws Exception {
        try (var statement = dataSource.getConnection().createStatement()) {
            statement.execute("DELETE FROM demand_event_details");
            statement.execute("DELETE FROM demands");
            statement.execute("DELETE FROM clients");
        }
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    /** Creates an active client through the real API and returns its id. */
    private String createClient(String name, String phone1, String phone2) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("name", name);
        payload.put("phone1", phone1);
        payload.put("phone2", phone2);
        String body = mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String demandJson(Object... keyValues) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            payload.put((String) keyValues[i], keyValues[i + 1]);
        }
        return objectMapper.writeValueAsString(payload);
    }

    private String createDemand(String clientId, String type, String status, Object... extra) throws Exception {
        Object[] base = {"clientId", clientId, "type", type, "status", status};
        Object[] all = new Object[base.length + extra.length];
        System.arraycopy(base, 0, all, 0, base.length);
        System.arraycopy(extra, 0, all, base.length, extra.length);
        return mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson(all)))
                .andReturn().getResponse().getContentAsString();
    }

    private Map<String, Object> eventDetails(String eventType, Boolean hallNeeded, Boolean florist) {
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("eventType", eventType);
        details.put("hallNeeded", hallNeeded);
        details.put("floristRequested", florist);
        return details;
    }

    private int countRows(String table) throws Exception {
        try (var rs = dataSource.getConnection().createStatement()
                .executeQuery("SELECT count(*) FROM " + table)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    @Test
    void flywayAppliedV5Migration() throws Exception {
        try (var rs = dataSource.getConnection().createStatement().executeQuery(
                "SELECT success FROM flyway_schema_history WHERE version = '5'")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getBoolean(1)).isTrue();
        }
    }

    @Test
    void createEventDemandWithDetailsReturns201AndPersistsConventions() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", "+261 32 98 76 54 32");

        String body = createDemand(clientId, "EVENT", null,
                "requestedDate", "2026-11-15",
                "estimatedPeople", 150,
                "budgetType", "RANGE",
                "budgetMin", new BigDecimal("4000000"),
                "budgetMax", new BigDecimal("6000000"),
                "location", "Salle Ivandry",
                "notes", "Proposition personnalisée",
                "eventDetails", eventDetails("Mariage", true, null));

        assertThat(objectMapper.readTree(body).get("status").asText()).isEqualTo("NEW"); // default

        var json = objectMapper.readTree(body);
        UUID id = UUID.fromString(json.get("id").asText());
        assertThat(json.get("clientName").asText()).isEqualTo("Alice Rakoto");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("eventDetails").get("eventType").asText()).isEqualTo("Mariage");
        // Nullable Boolean distinction preserved: null stays null.
        assertThat(json.get("eventDetails").get("floristRequested").isNull()).isTrue();
        assertThat(json.get("eventDetails").get("hallNeeded").asBoolean()).isTrue();

        Demand saved = demands.findById(id).orElseThrow();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getDeletedAt()).isNull();
        assertThat(saved.getVersion()).isZero();
        assertThat(saved.getRequestedDate().toString()).isEqualTo("2026-11-15");
        assertThat(countRows("demand_event_details")).isEqualTo(1);
    }

    @Test
    void createNonEventDemandWithoutDetailsIsValid() throws Exception {
        String clientId = createClient("Bob Example", "+261 33 00 11 22 33", null);

        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "TRANSPORT",
                                "budgetType", "NONE")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.eventDetails").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.status").value("NEW"));
    }

    @Test
    void creationValidations() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);

        // Missing client reference.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("type", "EVENT")))
                .andExpect(status().isBadRequest());

        // Missing type.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId)))
                .andExpect(status().isBadRequest());

        // Unknown client -> 404.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", UUID.randomUUID().toString(), "type", "EVENT")))
                .andExpect(status().isNotFound());

        // Invalid enum values -> 400.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "WEDDING")))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT", "status", "APPROVED")))
                .andExpect(status().isBadRequest());

        // estimatedPeople rules.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT", "estimatedPeople", 0)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT", "estimatedPeople", -5)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT")))
                .andExpect(status().isCreated());

        // Soft-deleted client cannot receive a new demand -> 404.
        mockMvc.perform(delete("/api/clients/" + clientId).header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT")))
                .andExpect(status().isNotFound());
    }

    @Test
    void budgetConsistencyRules() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);

        // Omitted budgetType defaults to NONE and is valid without amounts.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.budgetType").value("NONE"));

        // NONE with amounts is rejected, never silently repaired.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "NONE", "budgetMin", 1000)))
                .andExpect(status().isBadRequest());

        // EXACT requires equal amounts.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "EXACT", "budgetMin", 5000000, "budgetMax", 5000000)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "EXACT", "budgetMin", 5000000, "budgetMax", 6000000)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "EXACT", "budgetMin", 5000000)))
                .andExpect(status().isBadRequest());

        // RANGE requires min < max; zero allowed.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "RANGE", "budgetMin", 0, "budgetMax", 100)))
                .andExpect(status().isCreated());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "RANGE", "budgetMin", 5000000, "budgetMax", 5000000)))
                .andExpect(status().isBadRequest());
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "RANGE", "budgetMin", 6000000, "budgetMax", 5000000)))
                .andExpect(status().isBadRequest());

        // Negative amounts rejected.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "OTHER",
                                "budgetType", "RANGE", "budgetMin", -1, "budgetMax", 100)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void blankOptionalTextsBecomeNullAndEventTypeIsTrimmed() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);

        String body = createDemand(clientId, "EVENT", null,
                "location", "   ", "notes", "  ",
                "eventDetails", eventDetails("  Anniversaire  ", null, null));

        var json = objectMapper.readTree(body);
        assertThat(json.get("location").isNull()).isTrue();
        assertThat(json.get("notes").isNull()).isTrue();
        assertThat(json.get("eventDetails").get("eventType").asText()).isEqualTo("Anniversaire");

        // Blank eventType inside provided details -> 400.
        mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", clientId, "type", "EVENT",
                                "eventDetails", eventDetails("   ", null, null))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getReturnsDemandAndHandlesErrors() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        UUID id = UUID.fromString(objectMapper.readTree(createDemand(clientId, "EVENT", "IN_ANALYSIS",
                "eventDetails", eventDetails("Baptême", null, null))).get("id").asText());

        mockMvc.perform(get("/api/demands/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_ANALYSIS"))
                .andExpect(jsonPath("$.eventDetails.eventType").value("Baptême"));

        mockMvc.perform(get("/api/demands/" + UUID.randomUUID()).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/demands/not-a-uuid").header("Authorization", auth))
                .andExpect(status().isBadRequest());
    }

    @Test
    void listIsNewestFirstAndExcludesDeleted() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        createDemand(clientId, "CATERING", null);
        String second = createDemand(clientId, "DECORATION", null);
        UUID secondId = UUID.fromString(objectMapper.readTree(second).get("id").asText());
        createDemand(clientId, "FLORIST", null);

        mockMvc.perform(delete("/api/demands/" + secondId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/demands").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                // createdAt DESC: FLORIST (last created) first.
                .andExpect(jsonPath("$[0].type").value("FLORIST"))
                .andExpect(jsonPath("$[1].type").value("CATERING"));
    }

    @Test
    void filtersCombineAcrossClientTypeAndStatus() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        String bob = createClient("Bob Example", "+261 33 00 11 22 33", null);
        createDemand(alice, "EVENT", "NEW");
        createDemand(alice, "EVENT", "IN_ANALYSIS");
        createDemand(bob, "TRANSPORT", "NEW");

        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("clientId", alice))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("type", "EVENT"))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("status", "NEW"))
                .andExpect(jsonPath("$.length()").value(2));
        mockMvc.perform(get("/api/demands").header("Authorization", auth)
                        .param("clientId", alice).param("type", "EVENT").param("status", "IN_ANALYSIS"))
                .andExpect(jsonPath("$.length()").value(1));
        mockMvc.perform(get("/api/demands").header("Authorization", auth)
                        .param("clientId", bob).param("type", "EVENT"))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void searchCoversClientAndDemandFieldsCaseInsensitively() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", "+261 32 98 76 54 32");
        createDemand(alice, "EVENT", null,
                "location", "Salle Ivandry", "notes", "Proposition élégante",
                "eventDetails", eventDetails("Mariage", null, null));

        for (String term : new String[]{"rakoto", "ALICE", "12 34 56", "98 76", "IVANDRY",
                "élégante", "MARIAGE"}) {
            mockMvc.perform(get("/api/demands").header("Authorization", auth).param("search", term))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.length()").value(1));
        }

        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("search", "zzz-absent"))
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("search", "   "))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void searchEscapesLikeWildcards() throws Exception {
        String percent = createClient("100% Pure", "+261 34 00 00 00 00", null);
        createClient("Plain Name", "+261 33 11 11 11 11", null);
        createDemand(percent, "OTHER", null);

        // Literal "%" must be escaped: only the client named "100% Pure" matches.
        mockMvc.perform(get("/api/demands").header("Authorization", auth).param("search", "100%"))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void updateChangesFieldsAndIncrementsVersion() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        String bob = createClient("Bob Example", "+261 33 00 11 22 33", null);
        UUID id = UUID.fromString(objectMapper.readTree(
                createDemand(alice, "EVENT", null, "estimatedPeople", 100,
                        "eventDetails", eventDetails("Mariage", true, null))).get("id").asText());

        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", bob, "type", "CATERING", "status", "QUOTE_SENT",
                                "requestedDate", "2026-12-24", "estimatedPeople", 200,
                                "budgetType", "EXACT", "budgetMin", 3000000, "budgetMax", 3000000,
                                "location", "Antongondoha", "notes", "Devis envoyé",
                                "eventDetails", eventDetails("Événement professionnel", false, true),
                                "version", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.clientId").value(bob))
                .andExpect(jsonPath("$.clientName").value("Bob Example"))
                .andExpect(jsonPath("$.type").value("CATERING"))
                .andExpect(jsonPath("$.status").value("QUOTE_SENT"))
                .andExpect(jsonPath("$.eventDetails.eventType").value("Événement professionnel"))
                .andExpect(jsonPath("$.version").value(1));

        Demand saved = demands.findById(id).orElseThrow();
        assertThat(saved.getEstimatedPeople()).isEqualTo(200);
        assertThat(saved.getDeletedAt()).isNull();
    }

    @Test
    void updateWithStaleVersionReturns409() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        UUID id = UUID.fromString(objectMapper.readTree(
                createDemand(alice, "OTHER", null)).get("id").asText());

        String update = demandJson("clientId", alice, "type", "OTHER", "status", "IN_ANALYSIS", "version", 0);
        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(update))
                .andExpect(status().isConflict());
    }

    @Test
    void updateRemovesEventDetailsWhenNull() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        UUID id = UUID.fromString(objectMapper.readTree(createDemand(alice, "EVENT", null,
                "eventDetails", eventDetails("Fête privée", null, null))).get("id").asText());
        assertThat(countRows("demand_event_details")).isEqualTo(1);

        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", alice, "type", "EVENT",
                                "status", "NEW", "eventDetails", null, "version", 0)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.eventDetails").value(org.hamcrest.Matchers.nullValue()));

        assertThat(countRows("demand_event_details")).isZero(); // orphan removal
    }

    @Test
    void updateValidations() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        UUID id = UUID.fromString(objectMapper.readTree(
                createDemand(alice, "OTHER", null)).get("id").asText());

        // Missing demand.
        mockMvc.perform(put("/api/demands/" + UUID.randomUUID()).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", alice, "type", "OTHER", "status", "NEW", "version", 0)))
                .andExpect(status().isNotFound());

        // Unknown client.
        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", UUID.randomUUID().toString(), "type", "OTHER",
                                "status", "NEW", "version", 0)))
                .andExpect(status().isNotFound());

        // Invalid budget combination.
        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", alice, "type", "OTHER", "status", "NEW",
                                "budgetType", "RANGE", "budgetMin", 10, "budgetMax", 5, "version", 0)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deleteSoftDeletesAndHidesTheDemand() throws Exception {
        String alice = createClient("Alice Rakoto", "+261 34 12 34 56 78", null);
        UUID id = UUID.fromString(objectMapper.readTree(createDemand(alice, "EVENT", null,
                "eventDetails", eventDetails("Autre", null, null))).get("id").asText());

        mockMvc.perform(delete("/api/demands/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/demands/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/demands").header("Authorization", auth))
                .andExpect(jsonPath("$.length()").value(0));
        mockMvc.perform(put("/api/demands/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", alice, "type", "EVENT", "status", "NEW", "version", 0)))
                .andExpect(status().isNotFound());
        mockMvc.perform(delete("/api/demands/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());

        // The row remains in PostgreSQL with deletedAt populated.
        Demand kept = demands.findById(id).orElseThrow();
        assertThat(kept.getDeletedAt()).isNotNull();
    }

    @Test
    void unauthenticatedRequestsAreRejectedOnAllVerbs() throws Exception {
        mockMvc.perform(get("/api/demands")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/demands").contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", UUID.randomUUID().toString(), "type", "EVENT")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/demands/" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
                        .content(demandJson("clientId", UUID.randomUUID().toString(), "type", "EVENT",
                                "status", "NEW", "version", 0)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(delete("/api/demands/" + UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthRemainsPublic() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }
}
