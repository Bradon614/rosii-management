package mg.rosii.management.execution;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.UUID;

import mg.rosii.management.IntegrationTestSupport;
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
 * Execution management end-to-end against a real PostgreSQL (Flyway V1→V9 run
 * on context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 10 (rules 1-36): creation gated on preparation + ACCEPTED
 * proposal + reached deposit + 1:1 uniqueness, reads and list filters, status-
 * dependent update restrictions, the strict state machine with server-stamped
 * timestamps, optimistic locking and soft delete.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ExecutionManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "execution-tests@example.com";
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
        // This class owns the executions table: reset it (and the children tables
        // of proposals) so each test starts from a clean state.
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

    /** Full stack (ACCEPTED + deposit paid + preparation) ending with an execution id. */
    private String createReadyExecution() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        return objectMapper.readTree(execute(preparationId, 201)).get("id").asText();
    }

    private String getExecution(String executionId) throws Exception {
        return mockMvc.perform(get("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private String preparationIdOf(String executionId) throws Exception {
        return objectMapper.readTree(getExecution(executionId)).get("preparationId").asText();
    }

    /** PUT body for the operational info; null fields are simply omitted. */
    private String updateJson(long version, String scheduledDate, String startTime,
            String endTime, String location, String notes) {
        var json = new StringBuilder("{\"version\": %d".formatted(version));
        if (scheduledDate != null) {
            json.append(", \"scheduledDate\": \"").append(scheduledDate).append('"');
        }
        if (startTime != null) {
            json.append(", \"startTime\": \"").append(startTime).append('"');
        }
        if (endTime != null) {
            json.append(", \"endTime\": \"").append(endTime).append('"');
        }
        if (location != null) {
            json.append(", \"location\": \"").append(location).append('"');
        }
        if (notes != null) {
            json.append(", \"notes\": \"").append(notes).append('"');
        }
        return json.append('}').toString();
    }

    private void updateExecution(String executionId, String body, int expected) throws Exception {
        mockMvc.perform(put("/api/executions/" + executionId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected));
    }

    private void changeStatus(String executionId, String target, int expected) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\"}".formatted(target)))
                .andExpect(status().is(expected));
    }

    // ----- tests -----

    /** Regles 1-4 - valid preparation (ACCEPTED + deposit reached): 201, initial status PLANNED. */
    @Test
    void createsExecutionForValidPreparation() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

        String body = execute(preparationId, 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("preparationId").asText()).isEqualTo(preparationId);
        assertThat(json.get("status").asText()).isEqualTo("PLANNED");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("scheduledDate").isNull()).isTrue();
        assertThat(json.get("startedAt").isNull()).isTrue();
        assertThat(json.get("completedAt").isNull()).isTrue();
        assertThat(json.get("cancelledAt").isNull()).isTrue();
        assertThat(executions.count()).isEqualTo(1);
    }

    /** Regle 5 - unknown preparation: 404. */
    @Test
    void refusesCreationForUnknownPreparation() throws Exception {
        execute(UUID.randomUUID().toString(), 404);

        assertThat(executions.count()).isZero();
    }

    /** Regle 6 - soft-deleted preparation: 404 (no Proposal -> Execution shortcut). */
    @Test
    void refusesCreationForSoftDeletedPreparation() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        mockMvc.perform(delete("/api/preparations/" + preparationId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        execute(preparationId, 404);
        assertThat(executions.count()).isZero();
    }

    /** Regle 7 - the proposal behind the preparation is no longer ACCEPTED: 409. */
    @Test
    void refusesCreationWhenProposalNotAccepted() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

        // ACCEPTED is terminal in the API: simulate a state the workflow cannot
        // produce through its endpoints (direct data surgery, test-only).
        Proposal proposal = proposals.findByIdAndDeletedAtIsNull(UUID.fromString(proposalId)).orElseThrow();
        proposal.setStatus(ProposalStatus.SENT);
        proposals.saveAndFlush(proposal);

        execute(preparationId, 409);
        assertThat(executions.count()).isZero();
    }

    /** Regle 8 - required deposit no longer reached (raised after preparation): 409. */
    @Test
    void refusesCreationWhenDepositNotReached() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();

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

        execute(preparationId, 409);
        assertThat(executions.count()).isZero();
    }

    /** Regle 9 - one active execution per preparation (partial unique index): 409. */
    @Test
    void refusesSecondExecutionForSamePreparation() throws Exception {
        String firstId = createReadyExecution();
        String preparationId = preparationIdOf(firstId);

        execute(preparationId, 409);

        assertThat(executions.count()).isEqualTo(1);
        mockMvc.perform(get("/api/executions/" + firstId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(firstId));
    }

    /** Regle 10 - retrieval by id returns the same execution. */
    @Test
    void retrievesExecutionById() throws Exception {
        String id = createReadyExecution();

        mockMvc.perform(get("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.preparationId").isNotEmpty())
                .andExpect(jsonPath("$.status").value("PLANNED"));
    }

    /** Regle 11 - the list returns every active execution. */
    @Test
    void listsExecutions() throws Exception {
        String a = createReadyExecution();
        String b = createReadyExecution();

        mockMvc.perform(get("/api/executions").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.id == '" + a + "')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == '" + b + "')]").isNotEmpty());
    }

    /** Regle 12 - optional preparationId filter (and unknown id -> empty list). */
    @Test
    void filtersListByPreparationId() throws Exception {
        String a = createReadyExecution();
        createReadyExecution();
        String preparationA = preparationIdOf(a);

        mockMvc.perform(get("/api/executions").param("preparationId", preparationA)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(a));
        mockMvc.perform(get("/api/executions").param("preparationId", UUID.randomUUID().toString())
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regle 13 - optional status filter. */
    @Test
    void filtersListByStatus() throws Exception {
        String planned = createReadyExecution();
        String cancelled = createReadyExecution();
        changeStatus(cancelled, "CANCELLED", 200);

        mockMvc.perform(get("/api/executions").param("status", "PLANNED")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(planned));
        mockMvc.perform(get("/api/executions").param("status", "CANCELLED")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(cancelled));
        mockMvc.perform(get("/api/executions").param("status", "IN_PROGRESS")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regle 14 - optional scheduledDate filter. */
    @Test
    void filtersListByScheduledDate() throws Exception {
        String id = createReadyExecution();
        updateExecution(id, updateJson(0, "2999-12-20", null, null, null, null), 200);

        mockMvc.perform(get("/api/executions").param("scheduledDate", "2999-12-20")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id));
        mockMvc.perform(get("/api/executions").param("scheduledDate", "2999-12-21")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regles 15/35 - a deleted execution is excluded from EVERY read endpoint. */
    @Test
    void excludesSoftDeletedFromEveryRead() throws Exception {
        String a = createReadyExecution();
        String b = createReadyExecution();
        String preparationA = preparationIdOf(a);
        mockMvc.perform(delete("/api/executions/" + a).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/executions/" + a).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/executions").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(b));
        mockMvc.perform(get("/api/executions").param("preparationId", preparationA)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    /** Regle 16 - PLANNED: every operational field is editable. */
    @Test
    void updatesAllOperationalInfoWhilePlanned() throws Exception {
        String id = createReadyExecution();

        updateExecution(id, updateJson(0, "2999-12-20", "08:00", "17:00",
                "Salle des fetes", "Montage le matin"), 200);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("scheduledDate").asText()).isEqualTo("2999-12-20");
        assertThat(json.get("startTime").asText()).isEqualTo("08:00:00");
        assertThat(json.get("endTime").asText()).isEqualTo("17:00:00");
        assertThat(json.get("location").asText()).isEqualTo("Salle des fetes");
        assertThat(json.get("notes").asText()).isEqualTo("Montage le matin");
    }

    /** Regle 17 - scheduledDate is mandatory: 400, no date is ever invented. */
    @Test
    void rejectsUpdateWithoutScheduledDate() throws Exception {
        String id = createReadyExecution();

        updateExecution(id, updateJson(0, null, "08:00", "17:00", null, null), 400);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").isNull()).isTrue();
    }

    /** Regle 18 - endTime before startTime: 400, nothing saved. */
    @Test
    void rejectsEndTimeBeforeStartTime() throws Exception {
        String id = createReadyExecution();

        updateExecution(id, updateJson(0, "2999-12-20", "17:00", "08:00", null, null), 400);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").isNull()).isTrue();
    }

    /** Regle 19 - IN_PROGRESS: location/notes stay editable, the schedule is locked. */
    @Test
    void restrictsUpdateOnceInProgress() throws Exception {
        String id = createReadyExecution();
        updateExecution(id, updateJson(0, "2999-12-20", "08:00", "17:00", "Salle A", null), 200);
        changeStatus(id, "IN_PROGRESS", 200);

        // Same schedule + new location/notes: allowed.
        updateExecution(id, updateJson(2, "2999-12-20", "08:00", "17:00", "Salle B", "Retard sonorisation"),
                200);
        // Any attempt to move the schedule: 409.
        updateExecution(id, updateJson(3, "2999-12-21", "08:00", "17:00", "Salle B", null), 409);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("scheduledDate").asText()).isEqualTo("2999-12-20");
        assertThat(json.get("location").asText()).isEqualTo("Salle B");
        assertThat(json.get("notes").asText()).isEqualTo("Retard sonorisation");
    }

    /** Regle 20 - COMPLETED: no modification anymore (409, not a silent write). */
    @Test
    void refusesUpdateOnceCompleted() throws Exception {
        String id = createReadyExecution();
        updateExecution(id, updateJson(0, "2999-12-20", null, null, null, null), 200);
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);

        // Current version on purpose: the 409 comes from the status rule.
        updateExecution(id, updateJson(3, "2999-12-20", null, null, "Nouveau lieu", null), 409);
    }

    /** Regle 21 - CANCELLED: no modification anymore. */
    @Test
    void refusesUpdateOnceCancelled() throws Exception {
        String id = createReadyExecution();
        updateExecution(id, updateJson(0, "2999-12-20", null, null, null, null), 200);
        changeStatus(id, "CANCELLED", 200);

        updateExecution(id, updateJson(2, "2999-12-21", null, null, "Nouveau lieu", null), 409);
    }

    /** Regle 22 - optimistic locking: a stale version answers 409. */
    @Test
    void rejectsStaleVersionOnUpdate() throws Exception {
        String id = createReadyExecution();
        String body = updateJson(0, "2999-12-20", null, null, null, null);

        updateExecution(id, body, 200); // version 0 accepted, entity moves to 1
        updateExecution(id, body, 409); // same payload replayed: stale version
    }

    /** Regles 23 + 31 - PLANNED -> IN_PROGRESS stamps startedAt server-side. */
    @Test
    void transitionsPlannedToInProgressAndStampsStartedAt() throws Exception {
        String id = createReadyExecution();

        mockMvc.perform(patch("/api/executions/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"IN_PROGRESS\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("IN_PROGRESS"));

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("startedAt").isNull()).isFalse();
        assertThat(json.get("completedAt").isNull()).isTrue();
        assertThat(json.get("cancelledAt").isNull()).isTrue();
    }

    /** Regles 24 + 32/33 - PLANNED -> CANCELLED stamps cancelledAt only. */
    @Test
    void transitionsPlannedToCancelled() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "CANCELLED", 200);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(json.get("cancelledAt").isNull()).isFalse();
        assertThat(json.get("startedAt").isNull()).isTrue();
        assertThat(json.get("completedAt").isNull()).isTrue();
    }

    /** Regles 25 + 32 - IN_PROGRESS -> COMPLETED stamps completedAt (after startedAt). */
    @Test
    void transitionsInProgressToCompletedAndStampsCompletedAt() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("status").asText()).isEqualTo("COMPLETED");
        assertThat(json.get("completedAt").isNull()).isFalse();
        assertThat(json.get("startedAt").isNull()).isFalse();
        assertThat(json.get("cancelledAt").isNull()).isTrue();
    }

    /** Regles 26 + 33 - IN_PROGRESS -> CANCELLED stamps cancelledAt, never completedAt. */
    @Test
    void transitionsInProgressToCancelled() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "CANCELLED", 200);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(json.get("cancelledAt").isNull()).isFalse();
        assertThat(json.get("completedAt").isNull()).isTrue();
    }

    /** Regle 27 - PLANNED -> COMPLETED is forbidden: 409, status unchanged. */
    @Test
    void refusesTransitionFromPlannedToCompleted() throws Exception {
        String id = createReadyExecution();

        changeStatus(id, "COMPLETED", 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText()).isEqualTo("PLANNED");
    }

    /** Regle 28 - IN_PROGRESS -> PLANNED is forbidden: 409. */
    @Test
    void refusesTransitionFromInProgressToPlanned() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "IN_PROGRESS", 200);

        changeStatus(id, "PLANNED", 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText()).isEqualTo("IN_PROGRESS");
    }

    /** Regle 29 - COMPLETED is terminal: no restart and no cancellation either. */
    @Test
    void refusesAnyTransitionFromCompleted() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);

        changeStatus(id, "IN_PROGRESS", 409);
        changeStatus(id, "CANCELLED", 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText()).isEqualTo("COMPLETED");
    }

    /** Regle 30 - CANCELLED is terminal: nothing can revive it. */
    @Test
    void refusesAnyTransitionFromCancelled() throws Exception {
        String id = createReadyExecution();
        changeStatus(id, "CANCELLED", 200);

        changeStatus(id, "PLANNED", 409);
        changeStatus(id, "IN_PROGRESS", 409);
        changeStatus(id, "COMPLETED", 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText()).isEqualTo("CANCELLED");
    }

    /** Regles 34 + 36 - soft delete: row kept, excluded everywhere, delete again 404. */
    @Test
    void softDeletesExecution() throws Exception {
        String id = createReadyExecution();

        mockMvc.perform(delete("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        // The row is kept (soft delete), never physically removed.
        assertThat(executions.findById(UUID.fromString(id)).orElseThrow().getDeletedAt()).isNotNull();
        mockMvc.perform(get("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/executions").header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
        // A deleted execution can no longer be read nor written by any endpoint.
        updateExecution(id, updateJson(0, "2999-12-20", null, null, null, null), 404);
        changeStatus(id, "IN_PROGRESS", 404);
        mockMvc.perform(delete("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNotFound());
    }
}