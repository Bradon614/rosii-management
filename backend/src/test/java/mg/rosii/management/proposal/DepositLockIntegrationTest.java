package mg.rosii.management.proposal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.JsonNode;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.PreparationRepository;
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
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 22 deposit-lock fix — {@code PATCH /api/proposals/{id}/deposit} must
 * answer 409 once an active preparation exists for the proposal, even on a
 * direct HTTP call. Real PostgreSQL through Testcontainers (skipped without
 * Docker), so the transaction/lock behavior is the production one.
 *
 * <p>Every assertion goes through the real endpoint: the bug was that the F22
 * UI hid the action while the API still returned 200, so a service-level test
 * alone would not prove the contract. The deposit is always read back from the
 * API after a refused call to prove nothing was written.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class DepositLockIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "deposit-lock-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";
    /** The proposal line total. */
    private static final String TOTAL = "4000000";
    /** The requested deposit used by most tests. */
    private static final String DEPOSIT = "2000000";

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

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private PreparationRepository preparations;

    @Autowired
    private ExecutionRepository executions;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns these tables: reset them in FK-safe order.
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

    private String createAcceptedProposal(String requiredDeposit) throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId": "%s", "demandId": "%s", "title": "Mariage Rakoto",
                                 "validUntil": "%s", "requiredDeposit": %s,
                                 "lines": [{"description": "Prestation", "unit": "forfait",
                                  "quantity": 1, "unitPrice": %s}]}
                                """.formatted(clientId, demandId, VALID_UNTIL, requiredDeposit, TOTAL)))
                .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readTree(body).get("id").asText();
        transition(id, "SENT", 0);
        transition(id, "ACCEPTED", 1);
        return id;
    }

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

    private String prepare(String proposalId) throws Exception {
        String body = mockMvc.perform(post("/api/preparations").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\": \"%s\"}".formatted(proposalId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createExecution(String preparationId) throws Exception {
        String body = mockMvc.perform(post("/api/executions").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preparationId\": \"%s\"}".formatted(preparationId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private void changeExecutionStatus(String executionId, String target) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\"}".formatted(target)))
                .andExpect(status().isOk());
    }

    /** Calls PATCH deposit with an explicit version (null omits it). */
    private ResultActions patchDeposit(String proposalId, String requiredDeposit, Long version) throws Exception {
        String body = version == null
                ? "{\"requiredDeposit\": %s}".formatted(requiredDeposit)
                : "{\"requiredDeposit\": %s, \"version\": %d}".formatted(requiredDeposit, version);
        return mockMvc.perform(patch("/api/proposals/" + proposalId + "/deposit")
                .header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private JsonNode proposalJson(String proposalId) throws Exception {
        String body = mockMvc.perform(get("/api/proposals/" + proposalId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    /** A proposal that reached its deposit, with an active preparation. */
    private String proposalWithPreparation() throws Exception {
        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);
        prepare(proposalId);
        return proposalId;
    }

    // ----- tests -----

    /** 1. No active preparation: the deposit stays editable. */
    @Test
    void allowsDepositChangeWithoutPreparation() throws Exception {
        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requiredDeposit").value(2500000.00))
                .andExpect(jsonPath("$.version").value(3));

        JsonNode stored = proposalJson(proposalId);
        assertThat(stored.get("requiredDeposit").decimalValue()).isEqualByComparingTo("2500000.00");
        assertThat(stored.get("requiredDepositUpdatedAt").isNull()).isFalse();
    }

    /** 2. An active preparation locks the deposit: direct HTTP call -> 409. */
    @Test
    void refusesDepositChangeWithActivePreparation() throws Exception {
        String proposalId = proposalWithPreparation();

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(DEPOSIT + ".00");
    }

    /** 3. The lock is effective immediately after the preparation is created. */
    @Test
    void refusesDepositChangeImmediatelyAfterPreparationCreation() throws Exception {
        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);
        prepare(proposalId);

        patchDeposit(proposalId, "3000000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(DEPOSIT + ".00");
    }

    /** 4. PLANNED execution: still locked (the preparation exists). */
    @Test
    void refusesDepositChangeWithPlannedExecution() throws Exception {
        String proposalId = proposalWithPreparation();
        String executionId = createExecution(preparations.findAll().get(0).getId().toString());
        // The execution starts as PLANNED after creation.
        assertThat(executions.findById(java.util.UUID.fromString(executionId)).orElseThrow().getStatus())
                .hasToString("PLANNED");

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(DEPOSIT + ".00");
    }

    /** 5. IN_PROGRESS execution: still locked. */
    @Test
    void refusesDepositChangeWithInProgressExecution() throws Exception {
        String proposalId = proposalWithPreparation();
        String executionId = createExecution(preparations.findAll().get(0).getId().toString());
        changeExecutionStatus(executionId, "IN_PROGRESS");

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(DEPOSIT + ".00");
    }

    /** 6. COMPLETED execution: still locked (the preparation still exists). */
    @Test
    void refusesDepositChangeWithCompletedExecution() throws Exception {
        String proposalId = proposalWithPreparation();
        String executionId = createExecution(preparations.findAll().get(0).getId().toString());
        changeExecutionStatus(executionId, "IN_PROGRESS");
        changeExecutionStatus(executionId, "COMPLETED");

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(DEPOSIT + ".00");
    }

    /**
     * 7. Soft-deleted preparation: the slot is released, so the deposit becomes
     * editable again (soft deletion is the only deletion, and it unlocks).
     */
    @Test
    void allowsDepositChangeAfterPreparationSoftDeletion() throws Exception {
        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);
        String preparationId = prepare(proposalId);

        mockMvc.perform(delete("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requiredDeposit").value(2500000.00));

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo("2500000.00");
    }

    /** 8. A refused update leaves the stored deposit exactly as it was. */
    @Test
    void keepsDepositUnchangedAfterRefusal() throws Exception {
        String proposalId = proposalWithPreparation();

        patchDeposit(proposalId, "3500000", 2L)
                .andExpect(status().isConflict());

        JsonNode stored = proposalJson(proposalId);
        assertThat(stored.get("requiredDeposit").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(stored.get("totalPaid").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(stored.get("depositReached").asBoolean()).isTrue();
    }

    /** 9. No side effect at all on conflict: same version, same audit stamp, same rows. */
    @Test
    void hasNoSideEffectWhenTheDepositIsRefused() throws Exception {
        String proposalId = proposalWithPreparation();
        JsonNode before = proposalJson(proposalId);

        patchDeposit(proposalId, "2500000", before.get("version").asLong())
                .andExpect(status().isConflict());

        JsonNode after = proposalJson(proposalId);
        assertThat(after.get("version").asLong()).isEqualTo(before.get("version").asLong());
        assertThat(after.get("requiredDeposit").decimalValue())
                .isEqualByComparingTo(before.get("requiredDeposit").decimalValue());
        assertThat(after.get("requiredDepositUpdatedAt").asText())
                .isEqualTo(before.get("requiredDepositUpdatedAt").asText());
        assertThat(after.get("updatedAt").asText()).isEqualTo(before.get("updatedAt").asText());
        assertThat(preparations.count()).isEqualTo(1);
        assertThat(executions.count()).isZero();
    }

    /** 10. The previous deposit validations are unchanged (400/409, never a write). */
    @Test
    void keepsPreviousDepositValidations() throws Exception {
        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);

        // Mandatory, strictly positive, never above the total.
        patchDeposit(proposalId, "0", 2L).andExpect(status().isBadRequest());
        patchDeposit(proposalId, "-1", 2L).andExpect(status().isBadRequest());
        patchDeposit(proposalId, "4000001", 2L).andExpect(status().isBadRequest());
        // Version is mandatory and must be current.
        patchDeposit(proposalId, "2500000", null).andExpect(status().isBadRequest());
        patchDeposit(proposalId, "2500000", 99L).andExpect(status().isConflict());

        JsonNode stored = proposalJson(proposalId);
        assertThat(stored.get("requiredDeposit").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(stored.get("version").asLong()).isEqualTo(2L);
    }

    /** 10 (continued). Unknown or soft-deleted proposals keep answering 404. */
    @Test
    void unknownOrSoftDeletedProposalStillAnswers404() throws Exception {
        patchDeposit(java.util.UUID.randomUUID().toString(), "2500000", 0L)
                .andExpect(status().isNotFound());

        String proposalId = createAcceptedProposal(DEPOSIT);
        pay(proposalId, DEPOSIT);
        mockMvc.perform(delete("/api/proposals/" + proposalId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        patchDeposit(proposalId, "2500000", 2L)
                .andExpect(status().isNotFound());
    }

    /**
     * 10 (continued). A proposal with an active preparation ignores even a
     * change that would move the deposit below what was already paid: the lock
     * wins and answers 409, not a validation error.
     */
    @Test
    void preparationLockIsCheckedBeforeFinancialRecalculation() throws Exception {
        String proposalId = proposalWithPreparation();

        patchDeposit(proposalId, "100000", 2L)
                .andExpect(status().isConflict());

        assertThat(proposalJson(proposalId).get("requiredDeposit").decimalValue())
                .isEqualByComparingTo("2000000.00");
    }
}
