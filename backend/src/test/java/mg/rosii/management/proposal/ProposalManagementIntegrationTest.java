package mg.rosii.management.proposal;

import java.util.UUID;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proposal management end-to-end against a real PostgreSQL (Flyway V1→V6 run on
 * context startup). Skipped automatically without Docker.
 *
 * <p>Covers the Feature 07 decisions: mandatory demand (A), strict status
 * transitions (B), PROP-YYYY-NNNN numbering (C), lazy expiration (E), catalogue
 * snapshots, derived totals, frozen editing and optimistic locking.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ProposalManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "proposal-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UserRepository users;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns the proposal tables: reset them so each test starts clean
        // (cascade removes proposal_lines with their proposal).
        proposals.deleteAll();
        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }


    // ----- helpers -----

    private String createClient(String name, String phone) throws Exception {
        String body = mockMvc.perform(post("/api/clients").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"%s\", \"phone1\": \"%s\"}".formatted(name, phone)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createService(String name, String category, String unit, String price) throws Exception {
        String body = mockMvc.perform(post("/api/services").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"name\": \"%s\", \"category\": \"%s\", \"defaultUnit\": \"%s\","
                                + " \"referencePrice\": %s}").formatted(name, category, unit, price)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createDemand(String clientId) throws Exception {
        String body = mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\": \"%s\", \"type\": \"EVENT\", \"budgetType\": \"NONE\"}"
                                .formatted(clientId)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** A valid two-line proposal: one catalogue-backed line, one free-form line. */
    private String proposalJson(String clientId, String demandId, String serviceId, String validUntil) {
        return """
                {"clientId": "%s", "demandId": "%s", "title": "Mariage Rakoto",
                 "validUntil": %s, "notes": "Devis initial",
                 "lines": [
                   {"serviceId": %s, "description": "Traiteur", "unit": "forfait",
                    "quantity": 2, "unitPrice": 400000, "notes": null},
                   {"serviceId": null, "description": "Transport", "unit": "trajet",
                    "quantity": 1, "unitPrice": 150000, "notes": null}
                 ]}
                """.formatted(clientId, demandId, validUntil == null ? "null" : "\"" + validUntil + "\"",
                serviceId == null ? "null" : "\"" + serviceId + "\"");
    }

    private String createProposal(String clientId, String demandId, String serviceId, String validUntil)
            throws Exception {
        return mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, serviceId, validUntil)))
                .andReturn().getResponse().getContentAsString();
    }

    private String proposalId(String body) throws Exception {
        return objectMapper.readTree(body).get("id").asText();
    }

    private long versionOf(String body) throws Exception {
        return objectMapper.readTree(body).get("version").asLong();
    }

    private void changeStatus(String id, String target, long version, int expected) throws Exception {
        mockMvc.perform(patch("/api/proposals/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\", \"version\": %d}".formatted(target, version)))
                .andExpect(status().is(expected));
    }

    private String getProposal(String id) throws Exception {
        return mockMvc.perform(get("/api/proposals/" + id).header("Authorization", auth))
                .andReturn().getResponse().getContentAsString();
    }

    // ----- tests -----

    @Test
    void createDraftProposalWithSnapshotAndTotals() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String serviceId = createService("Traiteur mariage", "CATERING", "forfait", "800000");

        String body = createProposal(clientId, demandId, serviceId, VALID_UNTIL);
        var json = objectMapper.readTree(body);
        assertThat(json.get("status").asText()).isEqualTo("DRAFT");
        assertThat(json.get("number").asText()).matches("PROP-\\d{4}-\\d{4}");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("totalAmount").decimalValue()).isEqualByComparingTo("950000.00");
        assertThat(json.get("sentAt").isNull()).isTrue();

        var lines = json.get("lines");
        assertThat(lines).hasSize(2);
        // Catalogue-backed line keeps its snapshot and link.
        assertThat(lines.get(0).get("serviceId").asText()).isEqualTo(serviceId);
        assertThat(lines.get(0).get("description").asText()).isEqualTo("Traiteur");
        assertThat(lines.get(0).get("lineTotal").decimalValue()).isEqualByComparingTo("800000.00");
        // Free-form line: no service link, values preserved.
        assertThat(lines.get(1).get("serviceId").isNull()).isTrue();
        assertThat(lines.get(1).get("lineTotal").decimalValue()).isEqualByComparingTo("150000.00");
    }

    @Test
    void numberIsSequentialAndUniquePerYear() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        String first = createProposal(clientId, demandId, null, null);
        String second = createProposal(clientId, demandId, null, null);
        String firstNumber = objectMapper.readTree(first).get("number").asText();
        String secondNumber = objectMapper.readTree(second).get("number").asText();

        assertThat(firstNumber).isNotEqualTo(secondNumber);
        int firstSeq = Integer.parseInt(firstNumber.substring(firstNumber.length() - 4));
        int secondSeq = Integer.parseInt(secondNumber.substring(secondNumber.length() - 4));
        assertThat(secondSeq).isEqualTo(firstSeq + 1);
    }

    @Test
    void getReturnsProposalWithLines() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));

        mockMvc.perform(get("/api/proposals/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.lines.length()").value(2))
                .andExpect(jsonPath("$.totalAmount").value(950000.00));
    }

    @Test
    void creationValidations() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // Missing client -> 400 (Bean Validation @NotNull).
        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson("", demandId, null, VALID_UNTIL).replace("\"clientId\": \"\", ", "")))
                .andExpect(status().isBadRequest());

        // Unknown client -> 404.
        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(UUID.randomUUID().toString(), demandId, null, VALID_UNTIL)))
                .andExpect(status().isNotFound());

        // Unknown demand -> 404.
        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, UUID.randomUUID().toString(), null, VALID_UNTIL)))
                .andExpect(status().isNotFound());

        // Empty lines -> 400.
        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\": \"%s\", \"demandId\": \"%s\", \"lines\": []}"
                                .formatted(clientId, demandId)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void demandClientMismatchIsRejected() throws Exception {
        String clientA = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String clientB = createClient("Bob Example", "+261 33 00 11 22 33");
        String demandOfB = createDemand(clientB);

        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientA, demandOfB, null, VALID_UNTIL)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void deletedDemandIsRejected() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/demands/" + demandId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, null, VALID_UNTIL)))
                .andExpect(status().isNotFound());
    }

    @Test
    void snapshotSurvivesCatalogueChanges() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String serviceId = createService("Traiteur mariage", "CATERING", "forfait", "800000");
        String id = proposalId(createProposal(clientId, demandId, serviceId, VALID_UNTIL));

        // Rename the catalogue service and change its reference price.
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/services/" + serviceId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\": \"Buffet premium\", \"category\": \"CATERING\","
                                + " \"description\": null, \"defaultUnit\": \"forfait\","
                                + " \"referencePrice\": 999999, \"version\": 0}"))
                .andExpect(status().isOk());

        // The proposal line must keep the values that were actually proposed.
        var json = objectMapper.readTree(getProposal(id));
        var line = json.get("lines").get(0);
        assertThat(line.get("description").asText()).isEqualTo("Traiteur");
        assertThat(line.get("unitPrice").decimalValue()).isEqualByComparingTo("400000.00");
        assertThat(json.get("totalAmount").decimalValue()).isEqualByComparingTo("950000.00");
    }

    @Test
    void lineTotalRoundsHalfUp() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // 2.5 × 80000.33 = 200000.825 -> 200000.83 (HALF_UP, scale 2).
        String body = mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId": "%s", "demandId": "%s",
                                 "lines": [{"description": "X", "unit": "u",
                                  "quantity": 2.5, "unitPrice": 80000.33}]}
                                """.formatted(clientId, demandId)))
                .andReturn().getResponse().getContentAsString();
        var line = objectMapper.readTree(body).get("lines").get(0);
        assertThat(line.get("lineTotal").decimalValue()).isEqualByComparingTo("200000.83");
    }

    @Test
    void fullHappyPathLifecycle() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = createProposal(clientId, demandId, null, VALID_UNTIL);
        String id = proposalId(body);
        long version = versionOf(body);

        // DRAFT is editable.
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/proposals/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, null, VALID_UNTIL)
                                .replace("\"Devis initial\"", "\"Devis révisé\"")
                                .replaceFirst("\\{", "{\"version\": %d,".formatted(version))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.notes").value("Devis révisé"))
                .andExpect(jsonPath("$.version").value(version + 1));

        // DRAFT -> SENT -> ACCEPTED, timestamps recorded.
        changeStatus(id, "SENT", version + 1, 200);
        var sent = objectMapper.readTree(getProposal(id));
        assertThat(sent.get("sentAt").isNull()).isFalse();
        changeStatus(id, "ACCEPTED", version + 2, 200);
        var accepted = objectMapper.readTree(getProposal(id));
        assertThat(accepted.get("acceptedAt").isNull()).isFalse();
        // ACCEPTED is terminal: further transitions are rejected.
        changeStatus(id, "DRAFT", version + 3, 409);
    }

    @Test
    void sentProposalIsFrozenUntilRecalled() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = createProposal(clientId, demandId, null, VALID_UNTIL);
        String id = proposalId(body);
        long version = versionOf(body);

        changeStatus(id, "SENT", version, 200);

        // Direct edit is forbidden while SENT.
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/proposals/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, null, VALID_UNTIL)
                                .replaceFirst("\\{", "{\"version\": %d,".formatted(version + 1))))
                .andExpect(status().isConflict());

        // Recall to DRAFT, then editing is possible again.
        changeStatus(id, "DRAFT", version + 1, 200);
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/proposals/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, null, VALID_UNTIL)
                                .replaceFirst("\\{", "{\"version\": %d,".formatted(version + 2))))
                .andExpect(status().isOk());
    }


    @Test
    void allLegalTransitionsFromDraftAndSent() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // DRAFT -> CANCELLED is legal and terminal.
        String cancelled = proposalId(createProposal(clientId, demandId, null, null));
        changeStatus(cancelled, "CANCELLED", 0, 200);
        changeStatus(cancelled, "SENT", 1, 409);

        // SENT -> REFUSED and SENT -> CANCELLED are legal.
        String refused = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        changeStatus(refused, "SENT", 0, 200);
        changeStatus(refused, "REFUSED", 1, 200);
        assertThat(objectMapper.readTree(getProposal(refused)).get("refusedAt").isNull()).isFalse();

        String cancelledFromSent = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        changeStatus(cancelledFromSent, "SENT", 0, 200);
        changeStatus(cancelledFromSent, "CANCELLED", 1, 200);
        assertThat(objectMapper.readTree(getProposal(cancelledFromSent)).get("cancelledAt").isNull()).isFalse();

        // SENT -> DRAFT is legal (recall).
        String recalled = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        changeStatus(recalled, "SENT", 0, 200);
        changeStatus(recalled, "DRAFT", 1, 200);
        assertThat(objectMapper.readTree(getProposal(recalled)).get("status").asText()).isEqualTo("DRAFT");
    }

    @Test
    void illegalTransitionsAreRejected() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));

        // DRAFT cannot jump straight to a decision or EXPIRED; same status is invalid too.
        changeStatus(id, "ACCEPTED", 0, 409);
        changeStatus(id, "REFUSED", 0, 409);
        changeStatus(id, "EXPIRED", 0, 409);
        changeStatus(id, "DRAFT", 0, 409);
    }

    @Test
    void sendRequiresValidUntilAndLines() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // Missing validUntil -> 400.
        String noValidity = proposalId(createProposal(clientId, demandId, null, null));
        changeStatus(noValidity, "SENT", 0, 400);

        // A DRAFT whose validUntil is in the past cannot be sent -> 400.
        String pastValidity = proposalId(createProposal(clientId, demandId, null, null));
        forceValidUntil(pastValidity, "2000-01-01");
        changeStatus(pastValidity, "SENT", 0, 400);

        // A proposal with no lines cannot be sent -> 400 (lines removed out of band).
        String noLines = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        deleteLines(noLines);
        changeStatus(noLines, "SENT", 0, 400);
    }

    @Test
    void invalidServiceReferenceIsRejected() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, UUID.randomUUID().toString(), VALID_UNTIL)))
                .andExpect(status().isNotFound());

        // A soft-deleted service is refused too.
        String serviceId = createService("Traiteur mariage", "CATERING", "forfait", "800000");
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/services/" + serviceId).header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, serviceId, VALID_UNTIL)))
                .andExpect(status().isNotFound());
    }

    /** Test-only fixture shaping: forces valid_until directly (connection closed properly). */
    private void forceValidUntil(String proposalId, String date) throws Exception {
        try (var connection = POSTGRES.createConnection("");
                var statement = connection.createStatement()) {
            statement.execute("UPDATE proposals SET valid_until = '" + date
                    + "' WHERE id = '" + proposalId + "'");
        }
    }

    /** Test-only fixture shaping: removes all lines directly. */
    private void deleteLines(String proposalId) throws Exception {
        try (var connection = POSTGRES.createConnection("");
                var statement = connection.createStatement()) {
            statement.execute("DELETE FROM proposal_lines WHERE proposal_id = '" + proposalId + "'");
        }
    }


    @Test
    void optimisticLockingRejectsStaleVersion() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = createProposal(clientId, demandId, null, VALID_UNTIL);
        String id = proposalId(body);

        // Stale version on update -> 409.
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/proposals/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(proposalJson(clientId, demandId, null, VALID_UNTIL)
                                .replaceFirst("\\{", "{\"version\": 99,")))
                .andExpect(status().isConflict());

        // Stale version on status change -> 409.
        changeStatus(id, "SENT", 99, 409);
    }


    @Test
    void listFiltersByClientDemandStatusAndSearch() throws Exception {
        String clientA = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String clientB = createClient("Bob Example", "+261 33 00 11 22 33");
        String demandA = createDemand(clientA);
        String demandB = createDemand(clientB);

        String propA = proposalId(createProposal(clientA, demandA, null, VALID_UNTIL));
        proposalId(createProposal(clientB, demandB, null, VALID_UNTIL));

        // By client and by demand.
        var byClient = mockMvc.perform(get("/api/proposals").param("clientId", clientA)
                        .header("Authorization", auth)).andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(byClient)).hasSize(1);
        var byDemand = mockMvc.perform(get("/api/proposals").param("demandId", demandB)
                        .header("Authorization", auth)).andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(byDemand)).hasSize(1);

        // By status: send only A.
        changeStatus(propA, "SENT", 0, 200);
        var sent = mockMvc.perform(get("/api/proposals").param("status", "SENT")
                        .header("Authorization", auth)).andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(sent)).hasSize(1);

        // Search matches the proposal title.
        var searched = mockMvc.perform(get("/api/proposals").param("search", "Rakoto")
                        .header("Authorization", auth)).andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(searched)).hasSize(2);
    }

    @Test
    void sentFilterExcludesProposalsPastTheirValidity() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // One SENT proposal still within its validity, one SENT proposal forced past it.
        String active = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        changeStatus(active, "SENT", 0, 200);

        String expired = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));
        changeStatus(expired, "SENT", 0, 200);
        forceValidUntil(expired, "2000-01-01");

        // The SENT filter must not report the effectively-expired proposal.
        var sent = mockMvc.perform(get("/api/proposals").param("status", "SENT")
                        .header("Authorization", auth)).andReturn().getResponse().getContentAsString();
        var sentNodes = objectMapper.readTree(sent);
        assertThat(sentNodes).hasSize(1);
        assertThat(sentNodes.get(0).get("id").asText()).isEqualTo(active);

        // It stays visible in unfiltered reads/lists, reported as EXPIRED.
        mockMvc.perform(get("/api/proposals/" + expired).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EXPIRED"));
        var all = mockMvc.perform(get("/api/proposals").header("Authorization", auth))
                .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(all)).hasSize(2);
    }

    @Test
    void softDeleteHidesProposalFromReadsAndLists() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/proposals/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/proposals/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        var list = mockMvc.perform(get("/api/proposals").header("Authorization", auth))
                .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(list)).isEmpty();
    }

    @Test
    void expiredWhenValidUntilHasPassed() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = proposalId(createProposal(clientId, demandId, null, VALID_UNTIL));

        // Send with a valid validity, then force valid_until into the past and re-read.
        changeStatus(id, "SENT", 0, 200);
        forceValidUntil(id, "2000-01-01");

        mockMvc.perform(get("/api/proposals/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("EXPIRED"));
    }
}


