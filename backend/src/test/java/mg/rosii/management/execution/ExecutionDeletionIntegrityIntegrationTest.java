package mg.rosii.management.execution;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.PreparationRepository;
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
import org.springframework.mock.web.MockHttpServletResponse;
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
 * Feature 31 — deletion integrity of executions, end-to-end against a real
 * PostgreSQL (Testcontainers). Skipped automatically without Docker.
 *
 * <p>An execution whose preparation carries an <em>active</em> closure answers
 * 409 and stays untouched; a soft-deleted closure never blocks the soft delete.
 * A closure is linked to the preparation (Feature 11), so the dependency is the
 * one exposed by the API: the execution is the only active execution of that
 * preparation. The HTTP/PostgreSQL behavior is asserted here because the
 * frontend guard is not an integrity guarantee — a direct API call must be
 * refused too.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ExecutionDeletionIntegrityIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "execution-deletion-tests@example.com";
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
        // This class owns the operational chain: reset closures -> executions ->
        // preparations -> payments -> proposals so each test starts clean.
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

    /** ACCEPTED proposal with the required deposit paid. */
    private String createAcceptedPaidProposal() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String proposalId = createProposal(clientId, demandId, "2000000");
        transition(proposalId, "SENT", 0);
        transition(proposalId, "ACCEPTED", 1);
        pay(proposalId, "2000000");
        return proposalId;
    }

    /** Workflow ending on an active preparation (no execution yet). */
    private String createPreparation() throws Exception {
        String proposalId = createAcceptedPaidProposal();
        String body = mockMvc.perform(post("/api/preparations").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\": \"%s\"}".formatted(proposalId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String execute(String preparationId) throws Exception {
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

    /**
     * Workflow ending on a COMPLETED execution — the only state a closure can
     * close, hence the only way an active closure can exist through the API.
     */
    private Workflow createCompletedWorkflow() throws Exception {
        String preparationId = createPreparation();
        String executionId = execute(preparationId);
        changeExecutionStatus(executionId, "IN_PROGRESS");
        changeExecutionStatus(executionId, "COMPLETED");
        return new Workflow(preparationId, executionId);
    }

    private String close(String preparationId) throws Exception {
        String body = mockMvc.perform(post("/api/closures").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preparationId\": \"%s\"}".formatted(preparationId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private void deleteClosure(String closureId, int expected) throws Exception {
        mockMvc.perform(delete("/api/closures/" + closureId).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    private MockHttpServletResponse deleteExecution(String executionId, int expected) throws Exception {
        return mockMvc.perform(delete("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().is(expected))
                .andReturn().getResponse();
    }

    private Execution storedExecution(String executionId) {
        return executions.findById(UUID.fromString(executionId)).orElseThrow();
    }

    private ServiceClosure storedClosure(String closureId) {
        return closures.findById(UUID.fromString(closureId)).orElseThrow();
    }

    /** Preparation id + execution id of one operational chain. */
    private record Workflow(String preparationId, String executionId) {
    }

    // ----- tests -----

    /** 1 + 9. No active closure: the existing soft delete is unchanged (204, row kept). */
    @Test
    void softDeletesExecutionWithoutActiveClosure() throws Exception {
        String preparationId = createPreparation();
        String executionId = execute(preparationId);

        deleteExecution(executionId, 204);

        // Rule 9: an allowed deletion stays a LOGICAL deletion — the row is kept.
        Execution execution = storedExecution(executionId);
        assertThat(execution.getDeletedAt()).isNotNull();
        // Rule 1: and it leaves every read endpoint, exactly as before F31.
        mockMvc.perform(get("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/executions").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** 2 + 7 + 8. An active closure blocks the deletion with 409; nothing is modified. */
    @Test
    void refusesDeletionWhenAnActiveClosureExists() throws Exception {
        Workflow workflow = createCompletedWorkflow();
        String closureId = close(workflow.preparationId());
        Execution before = storedExecution(workflow.executionId());
        ServiceClosure closureBefore = storedClosure(closureId);

        MockHttpServletResponse response = deleteExecution(workflow.executionId(), 409);

        assertThat(response.getErrorMessage()).contains("closure");
        // Rule 7: the refused deletion did NOT set deletedAt (nor anything else).
        Execution after = storedExecution(workflow.executionId());
        assertThat(after.getDeletedAt()).isNull();
        assertThat(after.getStatus()).isEqualTo(ExecutionStatus.COMPLETED);
        assertThat(after.getVersion()).isEqualTo(before.getVersion());
        // Rule 8: the active closure is untouched by the refusal.
        ServiceClosure closureAfter = storedClosure(closureId);
        assertThat(closureAfter.getDeletedAt()).isNull();
        assertThat(closureAfter.getStatus()).isEqualTo(ClosureStatus.COMPLETED);
        assertThat(closureAfter.getVersion()).isEqualTo(closureBefore.getVersion());
        assertThat(closureAfter.getClosedAt()).isEqualTo(closureBefore.getClosedAt());
        // The execution is still readable through the API.
        mockMvc.perform(get("/api/executions/" + workflow.executionId()).header("Authorization", auth))
                .andExpect(status().isOk());
    }

    /** 3. A soft-deleted closure does not block the deletion. */
    @Test
    void allowsDeletionWhenTheOnlyClosureIsSoftDeleted() throws Exception {
        Workflow workflow = createCompletedWorkflow();
        String closureId = close(workflow.preparationId());
        deleteClosure(closureId, 204);

        deleteExecution(workflow.executionId(), 204);

        assertThat(storedExecution(workflow.executionId()).getDeletedAt()).isNotNull();
        assertThat(storedClosure(closureId).getDeletedAt()).isNotNull();
    }

    /** 4. Unknown execution: 404 is unchanged. */
    @Test
    void unknownExecutionStillAnswers404() throws Exception {
        deleteExecution(UUID.randomUUID().toString(), 404);
    }

    /** 5. Already soft-deleted execution: 404 is unchanged. */
    @Test
    void softDeletedExecutionStillAnswers404() throws Exception {
        String preparationId = createPreparation();
        String executionId = execute(preparationId);
        deleteExecution(executionId, 204);

        deleteExecution(executionId, 404);

        assertThat(storedExecution(executionId).getDeletedAt()).isNotNull();
    }

    /** 6. Several closures, only one active: the deletion is still refused. */
    @Test
    void refusesDeletionWhenOneOfSeveralClosuresIsActive() throws Exception {
        Workflow workflow = createCompletedWorkflow();
        // A first closure, then released: a second one may be created while the
        // rules still hold (the partial unique index only covers active rows).
        String releasedClosureId = close(workflow.preparationId());
        deleteClosure(releasedClosureId, 204);
        String activeClosureId = close(workflow.preparationId());

        MockHttpServletResponse response = deleteExecution(workflow.executionId(), 409);

        assertThat(response.getErrorMessage()).contains("closure");
        assertThat(storedExecution(workflow.executionId()).getDeletedAt()).isNull();
        assertThat(storedClosure(releasedClosureId).getDeletedAt()).isNotNull();
        assertThat(storedClosure(activeClosureId).getDeletedAt()).isNull();
        assertThat(storedClosure(activeClosureId).getStatus()).isEqualTo(ClosureStatus.COMPLETED);
    }
}
