package mg.rosii.management.execution;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 32 — PUT /api/executions/{id} contract, end-to-end against a real
 * PostgreSQL (Testcontainers). Skipped automatically without Docker.
 *
 * <p>While PLANNED the scheduled date stays mandatory (400, nothing written);
 * while IN_PROGRESS the schedule fields of the payload are optional, so the
 * location and notes of an execution created without a date remain correctable,
 * the stored schedule is never touched nor invented, and any actually different
 * provided schedule value is still refused with 409. COMPLETED/CANCELLED and
 * the optimistic-locking conflict are unchanged. The database is asserted
 * directly, not only the HTTP response.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ExecutionInProgressUpdateIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "execution-in-progress-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";
    private static final LocalDate DATE = LocalDate.of(2999, 12, 20);
    private static final LocalTime START = LocalTime.of(8, 0);
    private static final LocalTime END = LocalTime.of(17, 0);

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

    /** Full stack (ACCEPTED + deposit paid + preparation) ending with a PLANNED, dateless execution. */
    private String createExecution() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String proposalId = createProposal(clientId, demandId, "2000000");
        transition(proposalId, "SENT", 0);
        transition(proposalId, "ACCEPTED", 1);
        pay(proposalId, "2000000");
        String preparationId = objectMapper.readTree(mockMvc.perform(post("/api/preparations")
                        .header("Authorization", auth).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\": \"%s\"}".formatted(proposalId)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString())
                .get("id").asText();
        String body = mockMvc.perform(post("/api/executions").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"preparationId\": \"%s\"}".formatted(preparationId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        var json = objectMapper.readTree(body);
        assertThat(json.get("scheduledDate").isNull()).isTrue();
        return json.get("id").asText();
    }

    private void changeStatus(String executionId, String target, int expected) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\"}".formatted(target)))
                .andExpect(status().is(expected));
    }

    /** PUT body; null fields are simply omitted (absent, not sent as null). */
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

    private String updateExecution(String executionId, String body, int expected) throws Exception {
        return mockMvc.perform(put("/api/executions/" + executionId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private Execution stored(String executionId) {
        return executions.findById(UUID.fromString(executionId)).orElseThrow();
    }

    // ----- tests -----

    /** 1. PLANNED without scheduledDate: the F10 mandatory rule is kept (400, nothing written). */
    @Test
    void refusesPlannedUpdateWithoutScheduledDate() throws Exception {
        String dateless = createExecution();
        updateExecution(dateless, updateJson(0, null, null, null, "Salle A", "Note"), 400);
        assertThat(stored(dateless).getScheduledDate()).isNull();
        assertThat(stored(dateless).getLocation()).isNull();

        // Same rule when a date is already stored: it is never cleared.
        String scheduled = createExecution();
        updateExecution(scheduled, updateJson(0, DATE.toString(), "08:00", "17:00", "Salle A", null), 200);
        updateExecution(scheduled, updateJson(1, null, null, null, "Salle B", null), 400);
        Execution after = stored(scheduled);
        assertThat(after.getScheduledDate()).isEqualTo(DATE);
        assertThat(after.getLocation()).isEqualTo("Salle A");
    }

    /** 2. PLANNED with a valid date: the F10 update still works. */
    @Test
    void updatesPlannedExecutionWithScheduledDate() throws Exception {
        String id = createExecution();

        updateExecution(id, updateJson(0, DATE.toString(), "08:00", "17:00", "Salle A", "Montage"), 200);

        Execution after = stored(id);
        assertThat(after.getScheduledDate()).isEqualTo(DATE);
        assertThat(after.getStartTime()).isEqualTo(START);
        assertThat(after.getEndTime()).isEqualTo(END);
        assertThat(after.getLocation()).isEqualTo("Salle A");
        assertThat(after.getNotes()).isEqualTo("Montage");
    }

    /** 3 + 7. IN_PROGRESS without a stored date: the location is correctable and no date appears. */
    @Test
    void correctsLocationOfInProgressExecutionWithoutDate() throws Exception {
        String id = createExecution();
        changeStatus(id, "IN_PROGRESS", 200);

        updateExecution(id, updateJson(1, null, null, null, "Salle A", null), 200);

        Execution after = stored(id);
        assertThat(after.getStatus()).isEqualTo(ExecutionStatus.IN_PROGRESS);
        assertThat(after.getLocation()).isEqualTo("Salle A");
        // No date is ever invented, not even implicitly.
        assertThat(after.getScheduledDate()).isNull();
        assertThat(after.getStartTime()).isNull();
        assertThat(after.getEndTime()).isNull();
        var json = objectMapper.readTree(mockMvc.perform(get("/api/executions/" + id)
                        .header("Authorization", auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").isNull()).isTrue();
        assertThat(json.get("location").asText()).isEqualTo("Salle A");
    }

    /** 4 + 7. IN_PROGRESS without a stored date: the notes are correctable and no date appears. */
    @Test
    void correctsNotesOfInProgressExecutionWithoutDate() throws Exception {
        String id = createExecution();
        changeStatus(id, "IN_PROGRESS", 200);

        updateExecution(id, updateJson(1, null, null, null, null, "Retard sonorisation"), 200);

        Execution after = stored(id);
        assertThat(after.getNotes()).isEqualTo("Retard sonorisation");
        assertThat(after.getScheduledDate()).isNull();
        assertThat(after.getStartTime()).isNull();
        assertThat(after.getEndTime()).isNull();
    }

    /** 5 + 6. IN_PROGRESS with an existing date: location/notes without resending the schedule. */
    @Test
    void correctsLocationAndNotesOfInProgressExecutionWithAnExistingDate() throws Exception {
        String id = createExecution();
        updateExecution(id, updateJson(0, DATE.toString(), "08:00", "17:00", "Salle A", "Montage"), 200);
        changeStatus(id, "IN_PROGRESS", 200);

        String body = updateExecution(id, updateJson(2, null, null, null, "Salle B", "Retard"), 200);

        Execution after = stored(id);
        assertThat(after.getLocation()).isEqualTo("Salle B");
        assertThat(after.getNotes()).isEqualTo("Retard");
        // The stored schedule is preserved exactly, in the row and in the response.
        assertThat(after.getScheduledDate()).isEqualTo(DATE);
        assertThat(after.getStartTime()).isEqualTo(START);
        assertThat(after.getEndTime()).isEqualTo(END);
        var json = objectMapper.readTree(body);
        assertThat(json.get("scheduledDate").asText()).isEqualTo(DATE.toString());
        assertThat(json.get("startTime").asText()).isEqualTo("08:00:00");
        assertThat(json.get("endTime").asText()).isEqualTo("17:00:00");
    }

    /** 8. IN_PROGRESS: an actually different provided schedule value is still refused (409). */
    @Test
    void refusesInProgressRescheduleAttempts() throws Exception {
        String id = createExecution();
        updateExecution(id, updateJson(0, DATE.toString(), "08:00", "17:00", "Salle A", null), 200);
        changeStatus(id, "IN_PROGRESS", 200);

        // A different date, a different start time, a different end time: all refused.
        updateExecution(id, updateJson(2, DATE.plusDays(1).toString(), null, null, "Salle B", null), 409);
        updateExecution(id, updateJson(2, DATE.toString(), "09:00", "17:00", "Salle B", null), 409);
        updateExecution(id, updateJson(2, DATE.toString(), "08:00", "18:00", "Salle B", null), 409);

        Execution after = stored(id);
        assertThat(after.getScheduledDate()).isEqualTo(DATE);
        assertThat(after.getStartTime()).isEqualTo(START);
        assertThat(after.getEndTime()).isEqualTo(END);
        assertThat(after.getLocation()).isEqualTo("Salle A");
        assertThat(after.getVersion()).isEqualTo(2L);
    }

    /** 9. COMPLETED and CANCELLED: no modification is ever allowed (409). */
    @Test
    void refusesUpdateOnceCompletedOrCancelled() throws Exception {
        String completed = createExecution();
        updateExecution(completed, updateJson(0, DATE.toString(), "08:00", "17:00", "Salle A", null), 200);
        changeStatus(completed, "IN_PROGRESS", 200);
        changeStatus(completed, "COMPLETED", 200);

        updateExecution(completed, updateJson(3, null, null, null, "Salle B", "Note"), 409);
        // The status rule wins even without a date: still 409, never a 400.
        updateExecution(completed, updateJson(3, DATE.toString(), null, null, "Salle B", null), 409);
        Execution afterCompleted = stored(completed);
        assertThat(afterCompleted.getLocation()).isEqualTo("Salle A");
        assertThat(afterCompleted.getScheduledDate()).isEqualTo(DATE);

        String cancelled = createExecution();
        changeStatus(cancelled, "CANCELLED", 200);
        updateExecution(cancelled, updateJson(1, null, null, null, "Salle B", "Note"), 409);
        Execution afterCancelled = stored(cancelled);
        assertThat(afterCancelled.getLocation()).isNull();
        assertThat(afterCancelled.getScheduledDate()).isNull();
    }

    /** 10. Optimistic locking: a stale version is still a 409 and writes nothing. */
    @Test
    void refusesStaleVersionOnInProgressUpdate() throws Exception {
        String id = createExecution();
        changeStatus(id, "IN_PROGRESS", 200);

        updateExecution(id, updateJson(0, null, null, null, "Salle A", null), 409);
        assertThat(stored(id).getLocation()).isNull();
        assertThat(stored(id).getVersion()).isEqualTo(1L);

        // The current version is accepted.
        updateExecution(id, updateJson(1, null, null, null, "Salle A", null), 200);
        assertThat(stored(id).getLocation()).isEqualTo("Salle A");
    }

    /** The corrected contract is specific to IN_PROGRESS: a soft-deleted execution stays 404. */
    @Test
    void softDeletedExecutionStillAnswers404() throws Exception {
        String id = createExecution();
        mockMvc.perform(delete("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        updateExecution(id, updateJson(0, null, null, null, "Salle A", null), 404);
    }
}
