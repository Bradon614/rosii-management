package mg.rosii.management.execution;

import java.time.LocalDate;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.invoice.InvoiceRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.paymentreceipt.PaymentReceiptRepository;
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
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Service availability and conflict detection end-to-end (Feature 16) against
 * a real PostgreSQL (Flyway V1→V13 run on context startup). Skipped
 * automatically without Docker.
 *
 * <p>Covers the availability endpoint (GET /api/executions/availability): a
 * date is occupied only by an ACTIVE execution (PLANNED or IN_PROGRESS);
 * COMPLETED keeps the history but frees the date, CANCELLED and soft-deleted
 * never block; the optional excludeExecutionId must exist (404 otherwise) and
 * is ignored by the search. The date query parameter is mandatory and must be
 * a valid ISO local date (400 otherwise).
 *
 * <p>Covers the integration with creation (POST /api/executions: optional
 * scheduledDate refused 409 when another active execution occupies the date,
 * accepted on a free date or when the only occupant is COMPLETED/CANCELLED;
 * without a date the Feature 10 behavior is unchanged — a date is NOT
 * required) and with the Feature 15 date modification (PATCH .../scheduled-date:
 * 409 when the new date is occupied, existing date unchanged, moving to its
 * own date never conflicts because the execution excludes itself).
 *
 * <p>Covers cancellation: a CANCELLED execution releases its date
 * immediately, so a new service can be created on the same date.
 *
 * <p>Setup note: the Feature 10 PUT keeps its validated rule (full schedule
 * editable while PLANNED, no conflict check — Feature 16 does not modify
 * already-validated rules), so the fixtures build same-date conflicts through
 * PUT; the guarded paths are the new POST date and the Feature 15 PATCH.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ServiceAvailabilityIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "service-availability-tests@example.com";
    private static final String VALID_UNTIL = "2999-12-31";
    private static final String PAYMENT_DATE = "2026-09-20";

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
    private ServiceClosureRepository closures;

    @Autowired
    private InvoiceRepository invoices;

    @Autowired
    private PaymentReceiptRepository receipts;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // Full FK-safe reset, children first (invoices and receipts both
        // reference payments) so this class runs clean after any other feature.
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        invoices.deleteAll();
        receipts.deleteAll();
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
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createDemand(String clientId) throws Exception {
        String body = mockMvc.perform(post("/api/demands").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"clientId\": \"%s\", \"type\": \"EVENT\", \"budgetType\": \"NONE\"}"
                                .formatted(clientId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** Proposal with a single line of the given unit price and requested deposit. */
    private String createAcceptedProposal(long unitPrice, long requiredDeposit) throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String body = mockMvc.perform(post("/api/proposals").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"clientId": "%s", "demandId": "%s", "title": "Mariage Rakoto",
                                 "validUntil": "%s", "requiredDeposit": %d,
                                 "lines": [{"description": "Prestation", "unit": "forfait",
                                  "quantity": 1, "unitPrice": %d}]}
                                """.formatted(clientId, demandId, VALID_UNTIL, requiredDeposit, unitPrice)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = objectMapper.readTree(body).get("id").asText();
        mockMvc.perform(patch("/api/proposals/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"SENT\", \"version\": 0}"))
                .andExpect(status().isOk());
        mockMvc.perform(patch("/api/proposals/" + id + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"ACCEPTED\", \"version\": 1}"))
                .andExpect(status().isOk());
        return id;
    }

    private void pay(String proposalId, long amount) throws Exception {
        mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"proposalId": "%s", "amount": %d, "method": "CASH",
                                 "paymentDate": "%s"}
                                """.formatted(proposalId, amount, PAYMENT_DATE)))
                .andExpect(status().isCreated());
    }

    private String prepare(String proposalId) throws Exception {
        return mockMvc.perform(post("/api/preparations").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"proposalId\": \"%s\"}".formatted(proposalId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    /** POST /api/executions with an optional service date (Feature 16). */
    private MvcResult execute(String preparationId, String scheduledDate, int expected) throws Exception {
        String body = "{\"preparationId\": \"%s\"".formatted(preparationId);
        if (scheduledDate != null) {
            body += ", \"scheduledDate\": \"%s\"".formatted(scheduledDate);
        }
        body += "}";
        return mockMvc.perform(post("/api/executions").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected))
                .andReturn();
    }
    /**
     * Full workflow up to a PLANNED execution whose service date is set to
     * today plus the given number of days (negative for a past service date).
     */
    private String createScheduledExecution(long unitPrice, long requiredDeposit, long paid,
            long daysUntilService) throws Exception {
        String proposalId = createAcceptedProposal(unitPrice, requiredDeposit);
        pay(proposalId, paid);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        String id = objectMapper.readTree(execute(preparationId, null, 201)
                .getResponse().getContentAsString()).get("id").asText();
        setServiceDate(id, LocalDate.now().plusDays(daysUntilService));
        return id;
    }

    /** Sets the service date through the existing PLANNED PUT (Feature 10). */
    private void setServiceDate(String executionId, LocalDate date) throws Exception {
        mockMvc.perform(put("/api/executions/" + executionId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": %d, \"scheduledDate\": \"%s\"}"
                                .formatted(currentVersion(executionId), date)))
                .andExpect(status().isOk());
    }

    private long currentVersion(String executionId) throws Exception {
        return objectMapper.readTree(getExecution(executionId)).get("version").asLong();
    }

    private String getExecution(String executionId) throws Exception {
        return mockMvc.perform(get("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private void changeStatus(String executionId, String target, int expected) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\"}".formatted(target)))
                .andExpect(status().is(expected));
    }

    private void cancelExecution(String executionId, String reason, int expected) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/cancel")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\": \"%s\"}".formatted(reason)))
                .andExpect(status().is(expected));
    }

    /** PATCH /api/executions/{id}/scheduled-date with an optional version. */
    private MvcResult reschedule(String executionId, String newDate, Long version, int expected) throws Exception {
        var json = new StringBuilder("{\"scheduledDate\": \"" + newDate + "\"");
        if (version != null) {
            json.append(", \"version\": ").append(version);
        }
        json.append('}');
        return mockMvc.perform(patch("/api/executions/" + executionId + "/scheduled-date")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(json.toString()))
                .andExpect(status().is(expected))
                .andReturn();
    }

    /** GET /api/executions/availability with an optional excludeExecutionId. */
    private MvcResult availability(String scheduledDate, String excludeExecutionId, int expected) throws Exception {
        var url = new StringBuilder("/api/executions/availability");
        if (scheduledDate != null) {
            url.append("?scheduledDate=").append(scheduledDate);
        }
        if (excludeExecutionId != null) {
            url.append(url.indexOf("?") >= 0 ? "&" : "?")
                    .append("excludeExecutionId=").append(excludeExecutionId);
        }
        return mockMvc.perform(get(url.toString()).header("Authorization", auth))
                .andExpect(status().is(expected))
                .andReturn();
    }

    private void deleteExecution(String executionId) throws Exception {
        mockMvc.perform(delete("/api/executions/" + executionId).header("Authorization", auth))
                .andExpect(status().isNoContent());
    }
    // ----- availability tests -----

    /** A date with no execution at all is available. */
    @Test
    void reportsAFreeDateAsAvailable() throws Exception {
        LocalDate date = LocalDate.now().plusDays(20);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").asText()).isEqualTo(date.toString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }

    /** A PLANNED execution occupies its service date and is returned as conflict. */
    @Test
    void reportsAPlannedExecutionAsConflict() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").asText()).isEqualTo(date.toString());
        assertThat(json.get("available").asBoolean()).isFalse();
        assertThat(json.get("conflictingExecutionIds").get(0).asText()).isEqualTo(id);
        assertThat(json.get("conflictingExecutionIds").size()).isEqualTo(1);
    }

    /** An IN_PROGRESS execution still occupies its service date. */
    @Test
    void reportsAnInProgressExecutionAsConflict() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        changeStatus(id, "IN_PROGRESS", 200);
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isFalse();
        assertThat(json.get("conflictingExecutionIds").get(0).asText()).isEqualTo(id);
    }

    /** A COMPLETED execution keeps the history but no longer blocks the date. */
    @Test
    void doesNotReportACompletedExecutionAsConflict() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, -10);
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);
        LocalDate date = LocalDate.now().plusDays(-10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }

    /** A CANCELLED execution releases its date immediately. */
    @Test
    void doesNotReportACancelledExecutionAsConflict() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        cancelExecution(id, "Annulation demandée par le client", 200);
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }

    /** A soft-deleted execution never occupies anything. */
    @Test
    void doesNotReportASoftDeletedExecutionAsConflict() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        deleteExecution(id);
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }
    /** All the executions occupying the date are returned, not only the first one. */
    @Test
    void reportsEveryConflictingExecutionOfTheDate() throws Exception {
        String first = createScheduledExecution(4000000, 2000000, 2000000, 10);
        String second = createScheduledExecution(6000000, 3000000, 3000000, 20);
        // The Feature 10 PUT keeps its validated no-conflict rule, so the same
        // date is legitimately reachable for the fixture through that path.
        setServiceDate(second, LocalDate.now().plusDays(10));
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isFalse();
        assertThat(json.get("conflictingExecutionIds").size()).isEqualTo(2);
        assertThat(json.get("conflictingExecutionIds").get(0).asText()).isIn(first, second);
        assertThat(json.get("conflictingExecutionIds").get(1).asText()).isIn(first, second);
    }

    /** The scheduledDate query parameter is mandatory: 400 without it. */
    @Test
    void requiresTheScheduledDateParameter() throws Exception {
        availability(null, null, 400);
    }

    /** A non-ISO date is a client error: 400. */
    @Test
    void rejectsAnInvalidScheduledDateFormat() throws Exception {
        availability("20/10/2026", null, 400);
        availability("not-a-date", null, 400);
    }

    /** An unknown excludeExecutionId is 404, not a silent ignore. */
    @Test
    void refusesAnUnknownExcludedExecution() throws Exception {
        availability(LocalDate.now().plusDays(10).toString(), UUID.randomUUID().toString(), 404);
    }

    /** A soft-deleted excludeExecutionId is treated as nonexistent: 404. */
    @Test
    void refusesASoftDeletedExcludedExecution() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        deleteExecution(id);

        availability(LocalDate.now().plusDays(10).toString(), id, 404);
    }

    /** The excluded execution never conflicts with itself. */
    @Test
    void excludesTheGivenExecutionFromTheConflictSearch() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate date = LocalDate.now().plusDays(10);

        MvcResult result = availability(date.toString(), id, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }
    // ----- creation tests -----

    /** Creating an execution on a free date succeeds and stores the date. */
    @Test
    void createsAnExecutionOnAFreeDate() throws Exception {
        String proposalId = createAcceptedProposal(4000000, 2000000);
        pay(proposalId, 2000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        LocalDate date = LocalDate.now().plusDays(15);

        MvcResult result = execute(preparationId, date.toString(), 201);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").asText()).isEqualTo(date.toString());
        assertThat(json.get("status").asText()).isEqualTo("PLANNED");
    }

    /** Creating an execution on a date occupied by another active execution: 409, nothing created. */
    @Test
    void refusesToCreateAnExecutionOnAnOccupiedDate() throws Exception {
        createScheduledExecution(4000000, 2000000, 2000000, 10);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        LocalDate occupiedDate = LocalDate.now().plusDays(10);

        execute(preparationId, occupiedDate.toString(), 409);

        assertThat(executions.existsByPreparationIdAndDeletedAtIsNull(UUID.fromString(preparationId)))
                .isFalse();
        var json = objectMapper.readTree(availability(occupiedDate.toString(), null, 200)
                .getResponse().getContentAsString());
        assertThat(json.get("conflictingExecutionIds").size()).isEqualTo(1);
    }

    /** An IN_PROGRESS occupant blocks creation too. */
    @Test
    void refusesToCreateAnExecutionOnAnInProgressDate() throws Exception {
        String occupiedId = createScheduledExecution(4000000, 2000000, 2000000, 10);
        changeStatus(occupiedId, "IN_PROGRESS", 200);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();

        execute(preparationId, LocalDate.now().plusDays(10).toString(), 409);
    }

    /** A COMPLETED execution does not block creation on its historical date. */
    @Test
    void createsAnExecutionOnACompletedDate() throws Exception {
        String completedId = createScheduledExecution(4000000, 2000000, 2000000, -10);
        changeStatus(completedId, "IN_PROGRESS", 200);
        changeStatus(completedId, "COMPLETED", 200);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        LocalDate historicalDate = LocalDate.now().plusDays(-10);

        MvcResult result = execute(preparationId, historicalDate.toString(), 201);

        assertThat(objectMapper.readTree(result.getResponse().getContentAsString())
                .get("scheduledDate").asText()).isEqualTo(historicalDate.toString());
    }

    /** A CANCELLED execution frees its date: creation on that date succeeds. */
    @Test
    void createsAnExecutionOnACancelledDate() throws Exception {
        String cancelledId = createScheduledExecution(4000000, 2000000, 2000000, 10);
        cancelExecution(cancelledId, "Annulation demandée par le client", 200);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        LocalDate freedDate = LocalDate.now().plusDays(10);

        MvcResult result = execute(preparationId, freedDate.toString(), 201);

        assertThat(objectMapper.readTree(result.getResponse().getContentAsString())
                .get("scheduledDate").asText()).isEqualTo(freedDate.toString());
    }

    /** Without a date, creation keeps the exact Feature 10 behavior. */
    @Test
    void createsAnExecutionWithoutADateLikeFeature10() throws Exception {
        String proposalId = createAcceptedProposal(4000000, 2000000);
        pay(proposalId, 2000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();

        MvcResult result = execute(preparationId, null, 201);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").isNull()).isTrue();
        assertThat(json.get("status").asText()).isEqualTo("PLANNED");
    }
    // ----- Feature 15 modification tests -----

    /** Moving a service to a free date still succeeds (Feature 15 rule intact). */
    @Test
    void reschedulesToAFreeDate() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate newDate = LocalDate.now().plusDays(40);

        reschedule(id, newDate.toString(), currentVersion(id), 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(newDate.toString());
    }

    /** Moving a service to an occupied date: 409 and the existing date is unchanged. */
    @Test
    void refusesToRescheduleToAnOccupiedDate() throws Exception {
        String mover = createScheduledExecution(4000000, 2000000, 2000000, 10);
        String occupant = createScheduledExecution(6000000, 3000000, 3000000, 40);
        LocalDate currentMoverDate = LocalDate.now().plusDays(10);
        LocalDate occupiedDate = LocalDate.now().plusDays(40);
        assertThat(objectMapper.readTree(getExecution(mover)).get("scheduledDate").asText())
                .isEqualTo(currentMoverDate.toString());

        reschedule(mover, occupiedDate.toString(), currentVersion(mover), 409);

        assertThat(objectMapper.readTree(getExecution(mover)).get("scheduledDate").asText())
                .isEqualTo(currentMoverDate.toString());
        var json = objectMapper.readTree(availability(occupiedDate.toString(), null, 200)
                .getResponse().getContentAsString());
        assertThat(json.get("conflictingExecutionIds").get(0).asText()).isEqualTo(occupant);
    }

    /** Moving a service to its own current date is not a self-conflict. */
    @Test
    void allowsReschedulingToItsOwnDate() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate ownDate = LocalDate.now().plusDays(10);

        reschedule(id, ownDate.toString(), currentVersion(id), 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(ownDate.toString());
    }

    /** Setting the first date of an undated execution checks availability too. */
    @Test
    void refusesToSetAFirstDateOnAnOccupiedDate() throws Exception {
        createScheduledExecution(4000000, 2000000, 2000000, 10);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        String id = objectMapper.readTree(execute(preparationId, null, 201)
                .getResponse().getContentAsString()).get("id").asText();

        reschedule(id, LocalDate.now().plusDays(10).toString(), currentVersion(id), 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").isNull()).isTrue();
    }

    // ----- cancellation tests -----

    /** Cancelling releases the date for the availability check. */
    @Test
    void aCancellationReleasesTheDate() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate date = LocalDate.now().plusDays(10);
        assertThat(objectMapper.readTree(availability(date.toString(), null, 200)
                .getResponse().getContentAsString()).get("available").asBoolean()).isFalse();

        cancelExecution(id, "Annulation demandée par le client", 200);

        var json = objectMapper.readTree(availability(date.toString(), null, 200)
                .getResponse().getContentAsString());
        assertThat(json.get("available").asBoolean()).isTrue();
        assertThat(json.get("conflictingExecutionIds").isEmpty()).isTrue();
    }

    /** And a brand-new service can then be created on the freed date. */
    @Test
    void aNewExecutionCanBeCreatedAfterACancellation() throws Exception {
        String cancelledId = createScheduledExecution(4000000, 2000000, 2000000, 10);
        cancelExecution(cancelledId, "Annulation demandée par le client", 200);
        String proposalId = createAcceptedProposal(6000000, 3000000);
        pay(proposalId, 3000000);
        String preparationId = objectMapper.readTree(prepare(proposalId)).get("id").asText();
        LocalDate freedDate = LocalDate.now().plusDays(10);

        MvcResult result = execute(preparationId, freedDate.toString(), 201);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("scheduledDate").asText()).isEqualTo(freedDate.toString());
        assertThat(json.get("status").asText()).isEqualTo("PLANNED");
        var availabilityJson = objectMapper.readTree(availability(freedDate.toString(), null, 200)
                .getResponse().getContentAsString());
        assertThat(availabilityJson.get("conflictingExecutionIds").get(0).asText())
                .isEqualTo(json.get("id").asText());
    }
}
