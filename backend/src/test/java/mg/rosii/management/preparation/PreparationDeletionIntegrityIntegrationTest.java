package mg.rosii.management.preparation;

import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.execution.ExecutionStatus;
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
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 30 — deletion integrity of preparations, end-to-end against a real
 * PostgreSQL (Testcontainers). Skipped automatically without Docker.
 *
 * <p>A preparation with an <em>active</em> execution or closure answers 409 and
 * stays untouched; soft-deleted dependencies never block the soft delete. The
 * HTTP/PostgreSQL behavior is asserted here because the frontend guard is not
 * an integrity guarantee — a direct API call must be refused too.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PreparationDeletionIntegrityIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "preparation-deletion-tests@example.com";
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

    /** Workflow ending on an active preparation ready for its execution. */
    private String createPreparedPreparation() throws Exception {
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

    private void completeExecution(String executionId) throws Exception {
        changeExecutionStatus(executionId, "IN_PROGRESS");
        changeExecutionStatus(executionId, "COMPLETED");
    }

    private String close(String preparationId) throws Exception {
        String body = mockMvc.perform(post("/api/closures").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preparationId\": \"%s\"}".formatted(preparationId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private void deleteExecution(String executionId, int expected) throws Exception {
        mockMvc.perform(delete("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    private void deleteClosure(String closureId, int expected) throws Exception {
        mockMvc.perform(delete("/api/closures/" + closureId).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    private MockHttpServletResponse deletePreparation(String preparationId, int expected) throws Exception {
        return mockMvc.perform(delete("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().is(expected))
                .andReturn().getResponse();
    }

    private Preparation storedPreparation(String preparationId) {
        return preparations.findById(UUID.fromString(preparationId)).orElseThrow();
    }

    // ----- tests -----

    /** 1. No dependency: the existing soft delete is unchanged (204). */
    @Test
    void deletesPreparationWithoutActiveDependencies() throws Exception {
        String preparationId = createPreparedPreparation();

        deletePreparation(preparationId, 204);

        assertThat(storedPreparation(preparationId).getDeletedAt()).isNotNull();
        mockMvc.perform(get("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    /** 2. An active execution blocks the deletion with 409; nothing is modified. */
    @Test
    void refusesDeletionWhenAnActiveExecutionExists() throws Exception {
        String preparationId = createPreparedPreparation();
        String executionId = execute(preparationId);

        MockHttpServletResponse response = deletePreparation(preparationId, 409);

        assertThat(response.getErrorMessage()).contains("execution");
        assertThat(storedPreparation(preparationId).getDeletedAt()).isNull();
        Execution execution = executions.findById(UUID.fromString(executionId)).orElseThrow();
        assertThat(execution.getDeletedAt()).isNull();
        assertThat(execution.getStatus()).isEqualTo(ExecutionStatus.PLANNED);
        // The preparation is still readable through the API.
        mockMvc.perform(get("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().isOk());
    }

    /** 3. An active closure blocks the deletion even when the execution is gone. */
    @Test
    void refusesDeletionWhenAnActiveClosureExists() throws Exception {
        String preparationId = createPreparedPreparation();
        String executionId = execute(preparationId);
        completeExecution(executionId);
        String closureId = close(preparationId);
        // F10 deletion is out of scope: soft-deleting the execution leaves the
        // closure as the only ACTIVE dependency.
        deleteExecution(executionId, 204);

        MockHttpServletResponse response = deletePreparation(preparationId, 409);

        assertThat(response.getErrorMessage()).contains("closure");
        assertThat(storedPreparation(preparationId).getDeletedAt()).isNull();
        ServiceClosure closure = closures.findById(UUID.fromString(closureId)).orElseThrow();
        assertThat(closure.getDeletedAt()).isNull();
        assertThat(closure.getStatus()).isEqualTo(ClosureStatus.COMPLETED);
    }

    /** 4. A soft-deleted execution does not block the deletion. */
    @Test
    void allowsDeletionWhenTheOnlyExecutionIsSoftDeleted() throws Exception {
        String preparationId = createPreparedPreparation();
        String executionId = execute(preparationId);
        deleteExecution(executionId, 204);

        deletePreparation(preparationId, 204);

        assertThat(storedPreparation(preparationId).getDeletedAt()).isNotNull();
        assertThat(executions.findById(UUID.fromString(executionId)).orElseThrow().getDeletedAt())
                .isNotNull();
    }

    /** 5. A soft-deleted closure does not block the deletion. */
    @Test
    void allowsDeletionWhenTheOnlyClosureIsSoftDeleted() throws Exception {
        String preparationId = createPreparedPreparation();
        String executionId = execute(preparationId);
        completeExecution(executionId);
        String closureId = close(preparationId);
        deleteExecution(executionId, 204);
        deleteClosure(closureId, 204);

        deletePreparation(preparationId, 204);

        assertThat(storedPreparation(preparationId).getDeletedAt()).isNotNull();
        assertThat(closures.findById(UUID.fromString(closureId)).orElseThrow().getDeletedAt())
                .isNotNull();
    }

    /** 6. Several dependencies, only the execution still active: 409. */
    @Test
    void refusesDeletionWhenOneOfSeveralDependenciesIsActive() throws Exception {
        String preparationId = createPreparedPreparation();
        String executionId = execute(preparationId);
        completeExecution(executionId);
        String closureId = close(preparationId);
        deleteClosure(closureId, 204);

        MockHttpServletResponse response = deletePreparation(preparationId, 409);

        assertThat(response.getErrorMessage()).contains("execution");
        assertThat(storedPreparation(preparationId).getDeletedAt()).isNull();
        assertThat(executions.findById(UUID.fromString(executionId)).orElseThrow().getDeletedAt())
                .isNull();
        assertThat(closures.findById(UUID.fromString(closureId)).orElseThrow().getDeletedAt())
                .isNotNull();
    }

    /** 7. Unknown preparation: 404 is unchanged. */
    @Test
    void unknownPreparationStillAnswers404() throws Exception {
        deletePreparation(UUID.randomUUID().toString(), 404);
    }

    /** 8. Already soft-deleted preparation: 404 is unchanged. */
    @Test
    void softDeletedPreparationStillAnswers404() throws Exception {
        String preparationId = createPreparedPreparation();
        deletePreparation(preparationId, 204);

        deletePreparation(preparationId, 404);

        assertThat(storedPreparation(preparationId).getDeletedAt()).isNotNull();
    }
}