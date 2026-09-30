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
 * Service modification and cancellation end-to-end (Feature 15) against a real
 * PostgreSQL (Flyway V1→V13 run on context startup). Skipped automatically
 * without Docker.
 *
 * <p>Covers the date modification endpoint (PATCH /api/executions/{id}/
 * scheduled-date): allowed only while PLANNED and up to J-5 included (the
 * current service date minus 5 days must be today or later; J-10/J-6/J-5 ok,
 * J-4/J-1/J refused 409), 404 for unknown and soft-deleted executions, 400
 * without a date, and the optional-version optimistic locking convention.
 *
 * <p>Covers the cancellation endpoint (PATCH /api/executions/{id}/cancel):
 * allowed only while PLANNED, server-stamped cancelledAt, optional reason
 * (max 2000 characters), terminal CANCELLED status, and the derived amounts —
 * the retention is 25% of the ACCEPTED proposal TOTAL (never of what was
 * paid), the potential refund is paid - retained floored at 0. The payment
 * history (payments, receipts, invoices) is never modified nor deleted.
 *
 * <p>The theme is not covered: no modifiable theme data exists in the
 * operational model (the demand-phase theme belongs to the demand, not to the
 * execution), so only the date is modifiable — Feature 15 §4 limitation.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ServiceModificationCancellationIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "service-modification-tests@example.com";
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
        // Full FK-safe reset, children first: this class may run after any other
        // workflow feature and needs a clean workflow state (invoices and receipts
        // both reference payments).
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

    /**
     * Full workflow up to a PLANNED execution whose service date is set to
     * today plus the given number of days (J-N from the service perspective).
     */
    private String createScheduledExecution(long unitPrice, long requiredDeposit, long paid,
            long daysUntilService) throws Exception {
        String proposalId = createAcceptedProposal(unitPrice, requiredDeposit);
        pay(proposalId, paid);
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        String id = objectMapper.readTree(execute(preparationId, 201)).get("id").asText();
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

    /** PATCH /api/executions/{id}/scheduled-date with an optional version. */
    private MvcResult reschedule(String executionId, String newDate, Long version,
            int expected) throws Exception {
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

    /** PATCH /api/executions/{id}/cancel with an optional version and optional reason. */
    private MvcResult cancelExecution(String executionId, String reason, Long version,
            int expected) throws Exception {
        var parts = new java.util.ArrayList<String>();
        if (reason != null) {
            parts.add("\"reason\": \"" + reason + "\"");
        }
        if (version != null) {
            parts.add("\"version\": " + version);
        }
        String body = "{" + String.join(", ", parts) + "}";
        return mockMvc.perform(patch("/api/executions/" + executionId + "/cancel")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is(expected))
                .andReturn();
    }

    private String createReceipt(String paymentId) throws Exception {
        String body = mockMvc.perform(post("/api/payment-receipts").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paymentId\": \"%s\"}".formatted(paymentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private String createInvoice(String paymentId) throws Exception {
        String body = mockMvc.perform(post("/api/invoices").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"paymentId\": \"%s\"}".formatted(paymentId)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** GETs a document endpoint and returns its JSON body as a string. */
    private String getDocumentJson(String url) throws Exception {
        return mockMvc.perform(get(url).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    // ----- date modification tests -----

    /** J-10: modification allowed, the new date is persisted. */
    @Test
    void reschedulesFarBeforeTheService() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        LocalDate newDate = LocalDate.now().plusDays(30);

        reschedule(id, newDate.toString(), currentVersion(id), 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(newDate.toString());
    }

    /** Exactly J-5: still allowed (date - 5 days >= today). */
    @Test
    void allowsRescheduleExactlyAtJ5() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 5);
        LocalDate newDate = LocalDate.now().plusDays(20);

        reschedule(id, newDate.toString(), currentVersion(id), 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(newDate.toString());
    }

    /** J-4: the J-5 rule no longer holds -> 409, the date is unchanged. */
    @Test
    void refusesRescheduleAtJ4() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 4);
        String before = getExecution(id);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(getExecution(id)).isEqualTo(before);
    }

    /** J-1: refused 409. */
    @Test
    void refusesRescheduleAtJ1() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 1);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(LocalDate.now().plusDays(1).toString());
    }

    /** Day J itself: refused 409. */
    @Test
    void refusesRescheduleOnServiceDay() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 0);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(LocalDate.now().toString());
    }

    /** An execution without a scheduled date has nothing to protect: first date allowed. */
    @Test
    void allowsSettingTheFirstDateWhenNoneScheduled() throws Exception {
        String proposalId = createAcceptedProposal(4000000, 2000000);
        pay(proposalId, 2000000);
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        String id = objectMapper.readTree(execute(preparationId, 201)).get("id").asText();
        LocalDate newDate = LocalDate.now().plusDays(10);

        reschedule(id, newDate.toString(), currentVersion(id), 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(newDate.toString());
    }

    /** An IN_PROGRESS execution can never be rescheduled: 409. */
    @Test
    void refusesRescheduleWhenInProgress() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        changeStatus(id, "IN_PROGRESS", 200);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("IN_PROGRESS");
    }

    /** A COMPLETED execution can never be rescheduled: 409. */
    @Test
    void refusesRescheduleWhenCompleted() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("COMPLETED");
    }

    /** A CANCELLED execution is terminal: 409 on reschedule. */
    @Test
    void refusesRescheduleWhenCancelled() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        cancelExecution(id, "Annulation", null, 200);

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("CANCELLED");
    }

    /** Unknown execution: 404. */
    @Test
    void refusesRescheduleForUnknownExecution() throws Exception {
        reschedule(UUID.randomUUID().toString(), LocalDate.now().plusDays(30).toString(), null, 404);
    }

    /** Soft-deleted execution: 404 (never an active service). */
    @Test
    void refusesRescheduleForSoftDeletedExecution() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        mockMvc.perform(delete("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        reschedule(id, LocalDate.now().plusDays(30).toString(), null, 404);
    }

    /** The new date is mandatory: 400. */
    @Test
    void rejectsRescheduleWithoutDate() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);

        mockMvc.perform(patch("/api/executions/" + id + "/scheduled-date")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(LocalDate.now().plusDays(10).toString());
    }

    /** Optimistic locking: a stale optional version is 409, a fresh one 200. */
    @Test
    void rescheduleChecksOptionalVersion() throws Exception {
        String id = createScheduledExecution(4000000, 2000000, 2000000, 10);
        long stale = currentVersion(id);
        setServiceDate(id, LocalDate.now().plusDays(11));
        long fresh = currentVersion(id);
        assertThat(stale).isLessThan(fresh);

        reschedule(id, LocalDate.now().plusDays(30).toString(), stale, 409);
        reschedule(id, LocalDate.now().plusDays(30).toString(), fresh, 200);

        assertThat(objectMapper.readTree(getExecution(id)).get("scheduledDate").asText())
                .isEqualTo(LocalDate.now().plusDays(30).toString());
    }

    // ----- cancellation tests -----

    /** PLANNED execution cancelled: 1 000 000 total, 500 000 paid, 250 000 kept, 250 000 refundable. */
    @Test
    void cancelsPlannedExecutionWithHalfPaid() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);

        MvcResult result = cancelExecution(id, "Annulation demandée par le client",
                currentVersion(id), 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("id").asText()).isEqualTo(id);
        assertThat(json.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(json.get("cancelledAt").isNull()).isFalse();
        assertThat(json.get("cancellationReason").asText()).isEqualTo("Annulation demandée par le client");
        assertThat(json.get("proposalTotal").decimalValue()).isEqualByComparingTo("1000000.00");
        assertThat(json.get("totalPaid").decimalValue()).isEqualByComparingTo("500000.00");
        assertThat(json.get("retainedAmount").decimalValue()).isEqualByComparingTo("250000.00");
        assertThat(json.get("potentialRefundAmount").decimalValue()).isEqualByComparingTo("250000.00");

        var after = objectMapper.readTree(getExecution(id));
        assertThat(after.get("status").asText()).isEqualTo("CANCELLED");
        assertThat(after.get("cancelledAt").isNull()).isFalse();
        assertThat(after.get("cancellationReason").asText()).isEqualTo("Annulation demandée par le client");
    }

    /** Paid below the retention: the potential refund is floored at 0 (never a debt). */
    @Test
    void floorsRefundAtZeroWhenPaidBelowRetention() throws Exception {
        String id = createScheduledExecution(1000000, 100000, 100000, 10);

        MvcResult result = cancelExecution(id, null, null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("proposalTotal").decimalValue()).isEqualByComparingTo("1000000.00");
        assertThat(json.get("totalPaid").decimalValue()).isEqualByComparingTo("100000.00");
        assertThat(json.get("retainedAmount").decimalValue()).isEqualByComparingTo("250000.00");
        assertThat(json.get("potentialRefundAmount").decimalValue()).isEqualByComparingTo("0.00");
        // Without a reason the field stays null (it is optional).
        assertThat(json.get("cancellationReason").isNull()).isTrue();
    }

    /** Fully paid: 250 000 kept, 750 000 refundable. */
    @Test
    void refundsWhenFullyPaid() throws Exception {
        String id = createScheduledExecution(1000000, 1000000, 1000000, 10);

        MvcResult result = cancelExecution(id, "Annulation", null, 200);

        var json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.get("totalPaid").decimalValue()).isEqualByComparingTo("1000000.00");
        assertThat(json.get("retainedAmount").decimalValue()).isEqualByComparingTo("250000.00");
        assertThat(json.get("potentialRefundAmount").decimalValue()).isEqualByComparingTo("750000.00");
    }

    /** A second cancellation is refused: CANCELLED is terminal. */
    @Test
    void refusesSecondCancellation() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);
        cancelExecution(id, "Annulation", null, 200);

        cancelExecution(id, "Encore", null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("CANCELLED");
    }

    /** An IN_PROGRESS execution cannot be cancelled by this feature: 409, unchanged. */
    @Test
    void refusesCancelWhenInProgress() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);
        changeStatus(id, "IN_PROGRESS", 200);

        cancelExecution(id, "Trop tard", null, 409);

        var json = objectMapper.readTree(getExecution(id));
        assertThat(json.get("status").asText()).isEqualTo("IN_PROGRESS");
        assertThat(json.get("cancelledAt").isNull()).isTrue();
        assertThat(json.get("cancellationReason").isNull()).isTrue();
    }

    /** A COMPLETED execution cannot be cancelled: 409. */
    @Test
    void refusesCancelWhenCompleted() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);
        changeStatus(id, "IN_PROGRESS", 200);
        changeStatus(id, "COMPLETED", 200);

        cancelExecution(id, null, null, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("COMPLETED");
    }

    /** Unknown execution: 404. */
    @Test
    void refusesCancelForUnknownExecution() throws Exception {
        cancelExecution(UUID.randomUUID().toString(), null, null, 404);
    }

    /** Soft-deleted execution: 404. */
    @Test
    void refusesCancelForSoftDeletedExecution() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);
        mockMvc.perform(delete("/api/executions/" + id).header("Authorization", auth))
                .andExpect(status().isNoContent());

        cancelExecution(id, null, null, 404);
    }

    /** The reason is capped at 2000 characters: 400. */
    @Test
    void rejectsReasonAbove2000Characters() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);

        cancelExecution(id, "x".repeat(2001), null, 400);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("PLANNED");
    }

    /** Optimistic locking: a stale optional version is 409, nothing is cancelled. */
    @Test
    void cancelChecksOptionalVersion() throws Exception {
        String id = createScheduledExecution(1000000, 500000, 500000, 10);
        long stale = currentVersion(id);
        setServiceDate(id, LocalDate.now().plusDays(11));
        long fresh = currentVersion(id);

        cancelExecution(id, "Annulation", stale, 409);

        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("PLANNED");
        cancelExecution(id, "Annulation", fresh, 200);
        assertThat(objectMapper.readTree(getExecution(id)).get("status").asText())
                .isEqualTo("CANCELLED");
    }

    // ----- payment history preservation -----

    /**
     * A cancellation never rewrites history: the payment keeps its exact JSON
     * body, the receipt and the invoice keep theirs too, and no payment row is
     * added, removed or soft-deleted.
     */
    @Test
    void preservesPaymentHistoryOnCancellation() throws Exception {
        String proposalId = createAcceptedProposal(1000000, 500000);
        pay(proposalId, 500000);
        String paymentId = objectMapper.readTree(mockMvc.perform(get("/api/payments")
                        .param("proposalId", proposalId).header("Authorization", auth))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get(0).get("id").asText();
        String receiptId = createReceipt(paymentId);
        String invoiceId = createInvoice(paymentId);
        String preparationId = objectMapper.readTree(prepare(proposalId, 201)).get("id").asText();
        String id = objectMapper.readTree(execute(preparationId, 201)).get("id").asText();

        String paymentBefore = getDocumentJson("/api/payments/" + paymentId);
        String receiptBefore = getDocumentJson("/api/payment-receipts/" + receiptId);
        String invoiceBefore = getDocumentJson("/api/invoices/" + invoiceId);
        long paymentsBefore = payments.count();
        long receiptsBefore = receipts.count();
        long invoicesBefore = invoices.count();

        cancelExecution(id, "Annulation demandée par le client", null, 200);

        assertThat(payments.count()).isEqualTo(paymentsBefore);
        assertThat(receipts.count()).isEqualTo(receiptsBefore);
        assertThat(invoices.count()).isEqualTo(invoicesBefore);
        assertThat(getDocumentJson("/api/payments/" + paymentId)).isEqualTo(paymentBefore);
        assertThat(getDocumentJson("/api/payment-receipts/" + receiptId)).isEqualTo(receiptBefore);
        assertThat(getDocumentJson("/api/invoices/" + invoiceId)).isEqualTo(invoiceBefore);
        // The payment stays active (never soft-deleted by the cancellation).
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getDeletedAt()).isNull();
    }
}
