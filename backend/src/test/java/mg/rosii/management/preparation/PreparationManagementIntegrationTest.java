package mg.rosii.management.preparation;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.proposal.ProposalRepository;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Preparation management end-to-end against a real PostgreSQL (Flyway V1→V8 run
 * on context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 09: preparation only for an ACCEPTED proposal with the
 * required deposit reached (409 otherwise, 404 unknown proposal), retrieval by
 * id and by proposal, one active preparation per proposal, and soft delete.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PreparationManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "preparation-tests@example.com";
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
    private PreparationRepository preparations;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns the preparations table: reset it (and its proposals'
        // payments/proposals) so each test starts from a clean state.
        preparations.deleteAll();
        payments.deleteAll();
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

    private String createDemand(String clientId) throws Exception {
        String body = mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\": \"%s\", \"type\": \"EVENT\", \"budgetType\": \"NONE\"}"
                                .formatted(clientId)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** Proposal with a single 4 000 000 line and the given requested deposit. */
    private String createProposal(String clientId, String demandId, String requiredDeposit) throws Exception {
        String body = mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId": "%s", "demandId": "%s", "title": "Mariage Rakoto",
                                 "validUntil": "%s", "requiredDeposit": %s,
                                 "lines": [{"description": "Prestation", "unit": "forfait",
                                  "quantity": 1, "unitPrice": 4000000}]}
                                """.formatted(clientId, demandId, VALID_UNTIL, requiredDeposit)))
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** Creates an ACCEPTED proposal (the only status that can be prepared). */
    private String createAcceptedProposal(String requiredDeposit) throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = createProposal(clientId, demandId, requiredDeposit);
        transition(id, "SENT", 0);
        transition(id, "ACCEPTED", 1);
        return id;
    }

    /** Applies a status transition that is expected to succeed. */
    private void transition(String proposalId, String target, long version) throws Exception {
        mockMvc.perform(patch("/api/proposals/" + proposalId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\", \"version\": %d}".formatted(target, version)))
                .andExpect(status().isOk());
    }

    private void pay(String proposalId, String amount) throws Exception {
        mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"proposalId": "%s", "amount": %s, "method": "CASH",
                                 "paymentDate": "2026-09-20"}
                                """.formatted(proposalId, amount)))
                .andExpect(status().isCreated());
    }

    private String prepare(String proposalId, int expected) throws Exception {
        return mockMvc.perform(post("/api/preparations").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\": \"%s\"}".formatted(proposalId)))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    // ----- tests -----

    /** Cas 1 — ACCEPTED + deposit reached: the preparation is created (201). */
    @Test
    void createsPreparationWhenAcceptedAndDepositReached() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");

        String body = prepare(proposalId, 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("proposalId").asText()).isEqualTo(proposalId);
        assertThat(json.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("createdAt")).isNotNull();

        // Cas 5 — retrieval by id returns the same preparation.
        String id = json.get("id").asText();
        mockMvc.perform(get("/api/preparations/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.proposalId").value(proposalId));
    }

    /** Cas 5 — the preparation linked to a proposal is readable by proposalId. */
    @Test
    void retrievesPreparationByProposal() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String id = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

        mockMvc.perform(get("/api/preparations").param("proposalId", proposalId)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.proposalId").value(proposalId));
    }

    /** Cas 2 — ACCEPTED but depositReached = false: 409, nothing created. */
    @Test
    void refusesCreationWhenDepositNotReached() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "1500000");

        prepare(proposalId, 409);

        assertThat(preparations.count()).isZero();
        mockMvc.perform(get("/api/preparations").param("proposalId", proposalId)
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    /** Cas 3 — a proposal that is not ACCEPTED cannot enter preparation. */
    @Test
    void refusesCreationWhenProposalNotAccepted() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String draftId = createProposal(clientId, demandId, "2000000");

        // DRAFT: refused even though nothing blocks the deposit check later.
        prepare(draftId, 409);

        // Also refused once SENT (still not ACCEPTED).
        transition(draftId, "SENT", 0);
        prepare(draftId, 409);

        assertThat(preparations.count()).isZero();
    }

    /** Cas 4 — unknown proposal: 404. */
    @Test
    void refusesCreationForUnknownProposal() throws Exception {
        prepare(java.util.UUID.randomUUID().toString(), 404);

        assertThat(preparations.count()).isZero();
    }

    /** One active preparation per proposal: a second creation is 409. */
    @Test
    void refusesSecondPreparationForSameProposal() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String id = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

        prepare(proposalId, 409);

        // The first preparation is untouched.
        mockMvc.perform(get("/api/preparations/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id));
    }

    /** Cas 7 — soft delete: hidden from every read, row kept, slot released. */
    @Test
    void softDeletesPreparation() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String id = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

        mockMvc.perform(delete("/api/preparations/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        // Gone from reads but the row is kept (soft delete).
        mockMvc.perform(get("/api/preparations/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/preparations").param("proposalId", proposalId)
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
        assertThat(preparations.findById(java.util.UUID.fromString(id)).orElseThrow().getDeletedAt())
                .isNotNull();

        // Deleting again is 404, and the slot is released for a new preparation.
        mockMvc.perform(delete("/api/preparations/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        prepare(proposalId, 201);
    }
}
