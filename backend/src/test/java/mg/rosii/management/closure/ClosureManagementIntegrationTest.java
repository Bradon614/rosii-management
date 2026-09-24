package mg.rosii.management.closure;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.UUID;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.proposal.ProposalStatus;
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
 * Closure management end-to-end against a real PostgreSQL (Flyway V1→V10 run on
 * context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 11: creation gated on an active preparation + ACCEPTED
 * proposal + reached deposit + COMPLETED execution + one active closure, reads
 * and list filters, the definitive-closure rule (every PUT answers 409 and
 * closedAt/finalNotes stay untouched), payload validation, soft delete with
 * recreation once the slot is released, and optimistic locking.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ClosureManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "closure-tests@example.com";
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
    private ServiceClosureRepository closures;

    @Autowired
    private ExecutionRepository executions;

    @Autowired
    private PreparationRepository preparations;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns the service_closures table: reset it (and the workflow
        // tables below) so each test starts from a clean state.
        closures.deleteAll();
        executions.deleteAll();
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

    /** Creates an ACCEPTED proposal (the only status that can be prepared/executed). */
    private String createAcceptedProposal(String requiredDeposit) throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = createProposal(clientId, demandId, requiredDeposit);
        transition(id, "SENT", 0);
        transition(id, "ACCEPTED", 1);
        return id;
    }

    /** Applies a proposal status transition that is expected to succeed. */
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

    private String execute(String preparationId, int expected) throws Exception {
        return mockMvc.perform(post("/api/executions").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preparationId\": \"%s\"}".formatted(preparationId)))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private void changeExecutionStatus(String executionId, String target, int expected) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\"}".formatted(target)))
                .andExpect(status().is(expected));
    }

    /** Workflow ending on a preparation ready for its execution (accepted + paid). */
    private String createPreparedPreparation() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        return objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
    }

    /** The only state a closure may close: the preparation's execution is COMPLETED. */
    private void completeExecution(String preparationId) throws Exception {
        String executionId = objectMapper.readTree(execute(preparationId, 201)).get("id").asText();
        changeExecutionStatus(executionId, "IN_PROGRESS", 200);
        changeExecutionStatus(executionId, "COMPLETED", 200);
    }

    /** Full stack (ACCEPTED + deposit paid + preparation + COMPLETED execution). */
    private String createCompletedWorkflow() throws Exception {
        String preparationId = createPreparedPreparation();
        completeExecution(preparationId);
        return preparationId;
    }

    private String close(String body, int expected) throws Exception {
        return mockMvc.perform(post("/api/closures").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    /** POST payload; null fields are simply omitted (status then defaults server-side). */
    private String closeJson(String preparationId, String status, String finalNotes) {
        var json = new StringBuilder("{\"preparationId\": \"%s\"".formatted(preparationId));
        if (status != null) {
            json.append(", \"status\": \"").append(status).append('"');
        }
        if (finalNotes != null) {
            json.append(", \"finalNotes\": \"").append(finalNotes).append('"');
        }
        return json.append('}').toString();
    }

    /** Closes a fresh completed workflow and returns the closure id. */
    private String createReadyClosure() throws Exception {
        String preparationId = createCompletedWorkflow();
        return objectMapper.readTree(close(closeJson(preparationId, null, null), 201)).get("id").asText();
    }

    private String getClosure(String closureId) throws Exception {
        return mockMvc.perform(get("/api/closures/" + closureId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private void putClosure(String closureId, String body, int expected) throws Exception {
        mockMvc.perform(put("/api/closures/" + closureId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected));
    }

    private void deleteClosure(String closureId, int expected) throws Exception {
        mockMvc.perform(delete("/api/closures/" + closureId).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    // ----- tests -----
    /** Regle 1 - preparation with a COMPLETED execution: 201, explicit COMPLETED status. */
    @Test
    void createsClosureWithCompletedExecution() throws Exception {
        String preparationId = createCompletedWorkflow();

        String body = close(closeJson(preparationId, "COMPLETED", "Prestation terminee sans probleme."), 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("preparationId").asText()).isEqualTo(preparationId);
        assertThat(json.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(json.get("closedAt").isNull()).isFalse();
        assertThat(json.get("finalNotes").asText()).isEqualTo("Prestation terminee sans probleme.");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("createdAt").isNull()).isFalse();
        assertThat(json.get("updatedAt").isNull()).isFalse();
        assertThat(closures.count()).isEqualTo(1);
    }

    /** Regle 2 - WITH_ISSUE lets the patronne close despite a problem; notes round-trip in UTF-8. */
    @Test
    void createsClosureWithStatusWithIssue() throws Exception {
        String preparationId = createCompletedWorkflow();

        String body = close(closeJson(preparationId, "WITH_ISSUE", "Matériel manquant: scène abîmée."), 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("status").asText()).isEqualTo("WITH_ISSUE");
        assertThat(json.get("finalNotes").asText()).isEqualTo("Matériel manquant: scène abîmée.");
        assertThat(json.get("closedAt").isNull()).isFalse();
    }

    /** Regle 3 - status omitted: the server defaults it to COMPLETED. */
    @Test
    void defaultsToCompletedStatusWhenOmitted() throws Exception {
        String preparationId = createCompletedWorkflow();

        String body = close(closeJson(preparationId, null, "Remarque client."), 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(json.get("finalNotes").asText()).isEqualTo("Remarque client.");
    }

    /** Regle 4 - unknown preparation: 404, nothing created. */
    @Test
    void refusesCreationForUnknownPreparation() throws Exception {
        close(closeJson(UUID.randomUUID().toString(), null, null), 404);

        assertThat(closures.count()).isZero();
    }

    /** Regle 5 - soft-deleted preparation: 404 (only active preparations can be closed). */
    @Test
    void refusesCreationForSoftDeletedPreparation() throws Exception {
        String preparationId = createCompletedWorkflow();
        mockMvc.perform(delete("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        close(closeJson(preparationId, null, null), 404);
        assertThat(closures.count()).isZero();
    }

    /** Regle 6 - the preparation has no execution at all: 404 (referenced resource missing). */
    @Test
    void refusesCreationWhenExecutionMissing() throws Exception {
        String preparationId = createPreparedPreparation();

        close(closeJson(preparationId, null, null), 404);
        assertThat(closures.count()).isZero();
    }

    /** Regle 7 - the execution exists but is not COMPLETED yet: 409 (business state). */
    @Test
    void refusesCreationWhenExecutionNotCompleted() throws Exception {
        String preparationId = createPreparedPreparation();
        execute(preparationId, 201); // stays PLANNED

        close(closeJson(preparationId, null, null), 409);
        assertThat(closures.count()).isZero();
    }

    /** Regle 8 - the proposal behind the preparation is no longer ACCEPTED: 409. */
    @Test
    void refusesCreationWhenProposalNotAccepted() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        completeExecution(preparationId);

        // ACCEPTED is terminal in the API: simulate a state the workflow cannot
        // produce through its endpoints (direct data surgery, test-only).
        Proposal proposal = proposals.findByIdAndDeletedAtIsNull(UUID.fromString(proposalId)).orElseThrow();
        proposal.setStatus(ProposalStatus.SENT);
        proposals.saveAndFlush(proposal);

        close(closeJson(preparationId, null, null), 409);
        assertThat(closures.count()).isZero();
    }

    /** Regle 9 - required deposit no longer reached (raised after execution): 409. */
    @Test
    void refusesCreationWhenDepositNotReached() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        completeExecution(preparationId);

        // Raise the required deposit above what was paid (still <= the 4M total):
        // creation re-derives depositReached and refuses (2M < 3M).
        long proposalVersion = objectMapper.readTree(mockMvc.perform(get("/api/proposals/" + proposalId)
                        .header("Authorization", auth)).andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString())
                .get("version").asLong();
        mockMvc.perform(patch("/api/proposals/" + proposalId + "/deposit")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"requiredDeposit\": 3000000, \"version\": %d}".formatted(proposalVersion)))
                .andExpect(status().isOk());

        close(closeJson(preparationId, null, null), 409);
        assertThat(closures.count()).isZero();
    }

    /** Regle 10 - one active closure per preparation (partial unique index): 409. */
    @Test
    void refusesSecondActiveClosureForSamePreparation() throws Exception {
        String preparationId = createCompletedWorkflow();
        String firstId = objectMapper.readTree(close(closeJson(preparationId, null, null), 201))
                .get("id").asText();

        close(closeJson(preparationId, "WITH_ISSUE", "Tentative de re-cloture."), 409);

        assertThat(closures.count()).isEqualTo(1);
        mockMvc.perform(get("/api/closures/" + firstId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(firstId));
    }

    /** Regle 11 - retrieval by id returns the same closure. */
    @Test
    void retrievesClosureById() throws Exception {
        String id = createReadyClosure();

        mockMvc.perform(get("/api/closures/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.preparationId").isNotEmpty())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.closedAt").isNotEmpty());
    }

    /** Regle 12 - the list returns every active closure. */
    @Test
    void listsAllClosures() throws Exception {
        close(closeJson(createCompletedWorkflow(), "COMPLETED", null), 201);
        close(closeJson(createCompletedWorkflow(), "WITH_ISSUE", null), 201);

        mockMvc.perform(get("/api/closures").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));
    }

    /** Regle 13 - filter by preparationId (including an unknown preparation: empty list). */
    @Test
    void filtersListByPreparationId() throws Exception {
        String firstPreparation = createCompletedWorkflow();
        String secondPreparation = createCompletedWorkflow();
        close(closeJson(firstPreparation, null, null), 201);
        close(closeJson(secondPreparation, null, null), 201);

        mockMvc.perform(get("/api/closures?preparationId=" + firstPreparation)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].preparationId").value(firstPreparation));
        mockMvc.perform(get("/api/closures?preparationId=" + UUID.randomUUID())
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regle 14 - filter by status. */
    @Test
    void filtersListByStatus() throws Exception {
        close(closeJson(createCompletedWorkflow(), "COMPLETED", null), 201);
        close(closeJson(createCompletedWorkflow(), "WITH_ISSUE", null), 201);

        mockMvc.perform(get("/api/closures?status=WITH_ISSUE").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("WITH_ISSUE"));
        mockMvc.perform(get("/api/closures?status=COMPLETED").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    /** Regle 15 - an active closure is definitive: every PUT answers 409, nothing changes. */
    @Test
    void refusesUpdateOfActiveClosure() throws Exception {
        String id = createReadyClosure();
        String before = getClosure(id);

        putClosure(id, "{\"version\": 0, \"finalNotes\": \"Tentative de modification.\"}", 409);

        assertThat(objectMapper.readTree(getClosure(id))).isEqualTo(objectMapper.readTree(before));
    }

    /** Regle 16 - closedAt can never be modified (not even through a PUT payload). */
    @Test
    void closedAtIsNeverModifiable() throws Exception {
        String id = createReadyClosure();
        String closedAtBefore = objectMapper.readTree(getClosure(id)).get("closedAt").asText();

        putClosure(id, "{\"version\": 0, \"finalNotes\": \"Note tardive.\","
                + " \"closedAt\": \"2000-01-01T00:00:00Z\"}", 409);

        var json = objectMapper.readTree(getClosure(id));
        assertThat(json.get("closedAt").asText()).isEqualTo(closedAtBefore);
        assertThat(json.get("finalNotes").isNull()).isTrue();
    }

    /** Regle 17 - finalNotes cannot be corrected after the closure: 409, original value kept. */
    @Test
    void finalNotesNotModifiableAfterClosure() throws Exception {
        String preparationId = createCompletedWorkflow();
        String id = objectMapper.readTree(
                close(closeJson(preparationId, "COMPLETED", "Remarque initiale."), 201)).get("id").asText();

        putClosure(id, "{\"version\": 0, \"finalNotes\": \"Remarque corrigee.\"}", 409);

        assertThat(objectMapper.readTree(getClosure(id)).get("finalNotes").asText())
                .isEqualTo("Remarque initiale.");
    }

    /** Regle 18 - soft delete: row kept, excluded everywhere, delete again 404. */
    @Test
    void softDeletesClosure() throws Exception {
        String id = createReadyClosure();

        deleteClosure(id, 204);

        // The row is kept (soft delete), never physically removed.
        assertThat(closures.findById(UUID.fromString(id)).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(closures.count()).isEqualTo(1);
        mockMvc.perform(get("/api/closures/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        putClosure(id, "{\"version\": 0}", 404);
        deleteClosure(id, 404);
    }

    /** Regle 19 - a soft-deleted closure never appears in the list. */
    @Test
    void excludesSoftDeletedFromList() throws Exception {
        String id = createReadyClosure();
        deleteClosure(id, 204);

        mockMvc.perform(get("/api/closures").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regle 20 - after soft delete the slot is released: a new closure may be created. */
    @Test
    void allowsRecreationAfterSoftDelete() throws Exception {
        String preparationId = createCompletedWorkflow();
        String firstId = objectMapper.readTree(close(closeJson(preparationId, null, null), 201))
                .get("id").asText();
        deleteClosure(firstId, 204);

        // The workflow rules (ACCEPTED, deposit reached, COMPLETED execution) still
        // hold, so the recreation is legitimate and returns 201.
        close(closeJson(preparationId, "WITH_ISSUE", "Nouvelle cloture apres correction."), 201);

        assertThat(closures.findMatching(UUID.fromString(preparationId), null)).hasSize(1);
        assertThat(closures.count()).isEqualTo(2); // the soft-deleted row is kept
        mockMvc.perform(get("/api/closures").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("WITH_ISSUE"));
    }

    /** Regle 21 - preparationId is mandatory: 400, nothing created. */
    @Test
    void rejectsCreateWithoutPreparationId() throws Exception {
        close("{}", 400);

        assertThat(closures.count()).isZero();
    }

    /** Regle 22 - finalNotes longer than 2000 characters: 400, nothing created. */
    @Test
    void rejectsFinalNotesLongerThan2000() throws Exception {
        String preparationId = createCompletedWorkflow();

        close(closeJson(preparationId, null, "x".repeat(2001)), 400);

        assertThat(closures.count()).isZero();
    }

    /** Regle 23 - a status outside ClosureStatus: 400 (enum deserialization), nothing created. */
    @Test
    void rejectsInvalidStatus() throws Exception {
        String preparationId = createCompletedWorkflow();

        close(closeJson(preparationId, "ARCHIVED", null), 400);

        assertThat(closures.count()).isZero();
    }

    /** Regle 24 - optimistic locking convention: a stale version answers 409, data untouched. */
    @Test
    void rejectsStaleVersionOnUpdate() throws Exception {
        String id = createReadyClosure();

        putClosure(id, "{\"version\": 999, \"finalNotes\": \"Concurrent edit.\"}", 409);

        var json = objectMapper.readTree(getClosure(id));
        assertThat(json.get("finalNotes").isNull()).isTrue();
        assertThat(json.get("version").asLong()).isZero();
    }
}