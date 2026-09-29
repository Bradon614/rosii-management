package mg.rosii.management.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.UUID;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.paymentreceipt.PaymentReceiptRepository;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.ProposalRepository;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.junit.jupiter.api.AfterEach;
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
 * Invoice management end-to-end against a real PostgreSQL (Flyway V1→V12 run on
 * context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 13: creation gated on an existing active payment with amount
 * &gt; 0 (Feature 08 guarantee) and at most one active invoice, backend-generated
 * FAC-YYYY-NNNN numbers, the full payment snapshot (amount/method/date/reference,
 * issuedAt stamped automatically, payment never modified), reads and list
 * filters, soft delete (deleted numbers never reused, slot released for
 * recreation), immutability (no PUT: 405) and payload validation. No PDF or
 * document generation exists (out of scope).
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class InvoiceManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "invoice-tests@example.com";
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
    private InvoiceRepository invoices;

    @Autowired
    private PaymentReceiptRepository receipts;

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
        // Full FK-safe reset, children first: this class may run after any other
        // workflow feature, so clear every workflow table whose rows would block
        // the deletion of payments (invoices and receipts both reference them).
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

    /** Never leave invoices behind: other classes hard-delete payments (FK). */
    @AfterEach
    void cleanUpInvoices() {
        invoices.deleteAll();
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

    /** Creates an ACCEPTED proposal (payments require ACCEPTED). */
    private String createAcceptedProposal(String requiredDeposit) throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);
        String id = createProposal(clientId, demandId, requiredDeposit);
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

    private String payJson(String proposalId, String amount, String method, String reference) {
        return """
                {"proposalId": "%s", "amount": %s, "method": "%s", "paymentDate": "%s",
                 "reference": "%s", "notes": "Acompte"}
                """.formatted(proposalId, amount, method, PAYMENT_DATE, reference);
    }

    private String pay(String proposalId, String amount, String method, String reference, int expected)
            throws Exception {
        return mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payJson(proposalId, amount, method, reference)))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    /** A brand-new payment on its own ACCEPTED proposal; returns the payment id. */
    private String createPayment(String amount, String method, String reference) throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        return paymentIdOf(pay(proposalId, amount, method, reference, 201));
    }

    private String paymentIdOf(String paymentBody) throws Exception {
        return objectMapper.readTree(paymentBody).get("id").asText();
    }

    private String invoiceJson(String paymentId) {
        return "{\"paymentId\": \"%s\"}".formatted(paymentId);
    }

    private String postInvoice(String json, int expected) throws Exception {
        return mockMvc.perform(post("/api/invoices").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private String getInvoice(String id, int expected) throws Exception {
        return mockMvc.perform(get("/api/invoices/" + id).header("Authorization", auth))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private void deleteInvoice(String id, int expected) throws Exception {
        mockMvc.perform(delete("/api/invoices/" + id).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    private String invoiceIdOf(String invoiceBody) throws Exception {
        return objectMapper.readTree(invoiceBody).get("id").asText();
    }

    private String invoiceNumberOf(String invoiceBody) throws Exception {
        return objectMapper.readTree(invoiceBody).get("invoiceNumber").asText();
    }

    /** Regle 1 - an invoice is created for a valid payment with the full snapshot. */
    @Test
    void createsInvoiceForValidPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-001");

        var json = objectMapper.readTree(postInvoice(invoiceJson(paymentId), 201));

        assertThat(json.get("paymentId").asText()).isEqualTo(paymentId);
        assertThat(json.get("invoiceNumber").asText()).matches("FAC-\\d{4}-\\d{4}");
        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("500000.00");
        assertThat(json.get("paymentMethod").asText()).isEqualTo("CASH");
        assertThat(json.get("paymentDate").asText()).isEqualTo(PAYMENT_DATE);
        assertThat(json.get("paymentReference").asText()).isEqualTo("VIRE-001");
        assertThat(json.get("issuedAt")).isNotNull();
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("createdAt")).isNotNull();
        assertThat(json.get("updatedAt")).isNotNull();
        assertThat(invoices.count()).isEqualTo(1);
    }

    /** Regle 5/10 - format FAC-YYYY-NNNN with the current year, starting at 0001. */
    @Test
    void generatesInvoiceNumberFormat() throws Exception {
        String body = postInvoice(invoiceJson(createPayment("500000", "CASH", "VIRE-002")), 201);

        String number = invoiceNumberOf(body);
        assertThat(number).matches("FAC-\\d{4}-\\d{4}");
        assertThat(number).isEqualTo("FAC-%s-0001".formatted(LocalDate.now().getYear()));
    }

    /** Regle 4 - snapshot: amount, and the payment itself is never modified. */
    @Test
    void snapshotCopiesAmountFromPayment() throws Exception {
        String paymentId = createPayment("750000", "MOBILE_MONEY", "VIRE-003");

        var json = objectMapper.readTree(postInvoice(invoiceJson(paymentId), 201));

        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("750000.00");
        var payment = payments.findById(UUID.fromString(paymentId)).orElseThrow();
        assertThat(payment.getAmount()).isEqualByComparingTo("750000");
        assertThat(payment.getVersion()).isZero();
    }

    /** Regle 4 - snapshot: payment method. */
    @Test
    void snapshotCopiesMethodFromPayment() throws Exception {
        String paymentId = createPayment("500000", "BANK_TRANSFER", "VIRE-004");

        var json = objectMapper.readTree(postInvoice(invoiceJson(paymentId), 201));

        assertThat(json.get("paymentMethod").asText()).isEqualTo("BANK_TRANSFER");
    }

    /** Regle 4 - snapshot: payment date. */
    @Test
    void snapshotCopiesDateFromPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-005");

        var json = objectMapper.readTree(postInvoice(invoiceJson(paymentId), 201));

        assertThat(json.get("paymentDate").asText()).isEqualTo(PAYMENT_DATE);
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getPaymentDate())
                .isEqualTo(LocalDate.parse(PAYMENT_DATE));
    }

    /** Regle 4 - snapshot: payment reference. */
    @Test
    void snapshotCopiesReferenceFromPayment() throws Exception {
        String paymentId = createPayment("500000", "MOBILE_MONEY", "ORANGE-778899");

        var json = objectMapper.readTree(postInvoice(invoiceJson(paymentId), 201));

        assertThat(json.get("paymentReference").asText()).isEqualTo("ORANGE-778899");
    }

    /** Regle 7 - issuedAt is stamped by the server (payload holds only paymentId). */
    @Test
    void stampsIssuedAtAutomatically() throws Exception {
        String body = postInvoice(invoiceJson(createPayment("500000", "CASH", "VIRE-006")), 201);

        var json = objectMapper.readTree(body);
        assertThat(json.get("issuedAt")).isNotNull();
        assertThat(json.get("createdAt")).isNotNull();
        var created = invoices.findById(UUID.fromString(invoiceIdOf(body))).orElseThrow();
        assertThat(created.getIssuedAt()).isNotNull();
    }

    /** Regle 13 - an unknown payment is 404, nothing created. */
    @Test
    void answers404ForUnknownPayment() throws Exception {
        postInvoice(invoiceJson(UUID.randomUUID().toString()), 404);

        assertThat(invoices.count()).isZero();
    }

    /** Regle 13 - a soft-deleted payment is not invoicable: 404. */
    @Test
    void answers404ForSoftDeletedPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-007");
        var payment = payments.findById(UUID.fromString(paymentId)).orElseThrow();
        payment.markDeleted();
        payments.save(payment);

        postInvoice(invoiceJson(paymentId), 404);

        assertThat(invoices.count()).isZero();
    }

    /** Regle 13 - one active invoice per payment: a second attempt is 409. */
    @Test
    void answers409ForSecondInvoiceOnSamePayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-008");
        postInvoice(invoiceJson(paymentId), 201);

        postInvoice(invoiceJson(paymentId), 409); // conflict, not a second row

        assertThat(invoices.count()).isEqualTo(1);
    }

    /** GET by id: 200 with the invoice, 404 when unknown. */
    @Test
    void getsInvoiceById() throws Exception {
        String id = invoiceIdOf(postInvoice(
                invoiceJson(createPayment("500000", "CASH", "VIRE-010")), 201));

        var json = objectMapper.readTree(getInvoice(id, 200));

        assertThat(json.get("id").asText()).isEqualTo(id);
        assertThat(json.get("invoiceNumber").asText())
                .isEqualTo("FAC-%s-0001".formatted(LocalDate.now().getYear()));
        getInvoice(UUID.randomUUID().toString(), 404);
    }

    /** GET /api/invoices lists every invoice (two payments, two invoices). */
    @Test
    void listsInvoices() throws Exception {
        postInvoice(invoiceJson(createPayment("500000", "CASH", "VIRE-011")), 201);
        postInvoice(invoiceJson(createPayment("300000", "MOBILE_MONEY", "VIRE-012")), 201);

        var json = objectMapper.readTree(
                mockMvc.perform(get("/api/invoices").header("Authorization", auth))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString());

        assertThat(json).isNotNull();
        assertThat(json.size()).isEqualTo(2);
        // Chronological listing (invoiceNumber asc): 0001 then 0002.
        assertThat(json.get(0).get("invoiceNumber").asText())
                .isEqualTo("FAC-%s-0001".formatted(LocalDate.now().getYear()));
        assertThat(json.get(1).get("invoiceNumber").asText())
                .isEqualTo("FAC-%s-0002".formatted(LocalDate.now().getYear()));
    }

    /** Combined filters work: paymentId isolates one invoice. */
    @Test
    void filtersByPaymentId() throws Exception {
        String first = createPayment("500000", "CASH", "VIRE-013");
        String second = createPayment("300000", "MOBILE_MONEY", "VIRE-014");
        String firstInvoice = invoiceIdOf(postInvoice(invoiceJson(first), 201));
        postInvoice(invoiceJson(second), 201);

        var json = objectMapper.readTree(mockMvc
                .perform(get("/api/invoices").param("paymentId", first)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(json.size()).isEqualTo(1);
        assertThat(json.get(0).get("id").asText()).isEqualTo(firstInvoice);
        assertThat(json.get(0).get("paymentId").asText()).isEqualTo(first);
    }

    /** Combined filters work: invoiceNumber isolates one invoice. */
    @Test
    void filtersByInvoiceNumber() throws Exception {
        String number = invoiceNumberOf(postInvoice(
                invoiceJson(createPayment("500000", "CASH", "VIRE-015")), 201));

        var json = objectMapper.readTree(mockMvc
                .perform(get("/api/invoices").param("invoiceNumber", number)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(json.size()).isEqualTo(1);
        assertThat(json.get(0).get("invoiceNumber").asText()).isEqualTo(number);

        // Unknown number: 200 with an empty list.
        var empty = objectMapper.readTree(mockMvc
                .perform(get("/api/invoices").param("invoiceNumber", "FAC-1999-9999")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(empty.size()).isZero();
    }

    /** Soft-deleted invoices disappear from GET by id, list and filters. */
    @Test
    void excludesSoftDeletedInvoicesFromReads() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-016");
        String id = invoiceIdOf(postInvoice(invoiceJson(paymentId), 201));

        deleteInvoice(id, 204);

        getInvoice(id, 404);
        var list = objectMapper.readTree(
                mockMvc.perform(get("/api/invoices").header("Authorization", auth))
                        .andExpect(status().isOk())
                        .andReturn().getResponse().getContentAsString());
        assertThat(list.size()).isZero();
        var filtered = objectMapper.readTree(mockMvc
                .perform(get("/api/invoices").param("paymentId", paymentId)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(filtered.size()).isZero();
    }

    /** Regle 11 - soft delete: 204, row kept (number + snapshot), gone from the API. */
    @Test
    void softDeletesInvoice() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-017");
        String id = invoiceIdOf(postInvoice(invoiceJson(paymentId), 201));
        String number = invoiceNumberOf(getInvoice(id, 200));

        deleteInvoice(id, 204);

        var row = invoices.findById(UUID.fromString(id)).orElseThrow();
        assertThat(row.getDeletedAt()).isNotNull();
        assertThat(row.getInvoiceNumber()).isEqualTo(number);
        assertThat(row.getAmount()).isEqualByComparingTo("500000");
        getInvoice(id, 404);
        // A second delete finds no active invoice: 404.
        deleteInvoice(id, 404);
    }

    /** Regle 10 - a deleted number is never reused: the next invoice gets N+1. */
    @Test
    void doesNotReuseNumberAfterSoftDelete() throws Exception {
        String year = String.valueOf(LocalDate.now().getYear());
        String id = invoiceIdOf(postInvoice(
                invoiceJson(createPayment("500000", "CASH", "VIRE-018")), 201));
        assertThat(invoiceNumberOf(getInvoice(id, 200))).isEqualTo("FAC-" + year + "-0001");

        deleteInvoice(id, 204);

        String next = invoiceNumberOf(postInvoice(
                invoiceJson(createPayment("300000", "CASH", "VIRE-019")), 201));
        // 0001 stays burned even though its row is soft-deleted.
        assertThat(next).isEqualTo("FAC-" + year + "-0002");
    }

    /** Regle 11 - deleting releases the per-payment slot: re-invoicing is allowed. */
    @Test
    void allowsRecreationForSamePaymentAfterSoftDelete() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-020");
        String id = invoiceIdOf(postInvoice(invoiceJson(paymentId), 201));

        deleteInvoice(id, 204);

        // Was 409 before the deletion; the partial unique index lets it through now.
        String body = postInvoice(invoiceJson(paymentId), 201);
        assertThat(invoiceIdOf(body)).isNotEqualTo(id);
        assertThat(invoices.count()).isEqualTo(2); // old row kept for history
    }

    /** Regle 12 - no PUT/PATCH endpoint exists: 405, nothing modified. */
    @Test
    void answers405ForUpdateAttempts() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-021");
        String id = invoiceIdOf(postInvoice(invoiceJson(paymentId), 201));
        String before = getInvoice(id, 200);

        mockMvc.perform(put("/api/invoices/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\": 1, \"invoiceNumber\": \"FAC-2000-0001\"}"))
                .andExpect(status().isMethodNotAllowed());
        mockMvc.perform(patch("/api/invoices/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"amount\": 1}"))
                .andExpect(status().isMethodNotAllowed());

        assertThat(getInvoice(id, 200)).isEqualTo(before);
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getVersion()).isZero();
    }

    /** Regle 4/15 - the snapshot is persisted in DB; the payment row is never written. */
    @Test
    void persistsSnapshotInDatabase() throws Exception {
        String paymentId = createPayment("650000", "BANK_TRANSFER", "VIRE-022");
        String id = invoiceIdOf(postInvoice(invoiceJson(paymentId), 201));

        var row = invoices.findById(UUID.fromString(id)).orElseThrow();
        assertThat(row.getAmount()).isEqualByComparingTo("650000");
        assertThat(row.getPaymentMethod().name()).isEqualTo("BANK_TRANSFER");
        assertThat(row.getPaymentDate()).isEqualTo(LocalDate.parse(PAYMENT_DATE));
        assertThat(row.getPaymentReference()).isEqualTo("VIRE-022");
        assertThat(row.getIssuedAt()).isNotNull();
        assertThat(row.getDeletedAt()).isNull();
        assertThat(row.getVersion()).isZero();
        assertThat(row.getPayment().getId()).isEqualTo(UUID.fromString(paymentId));
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getVersion()).isZero();
    }

    /** Regle 5/10 - numbers are sequential and unique: 0001, 0002, 0003. */
    @Test
    void generatesSequentialUniqueNumbers() throws Exception {
        String year = String.valueOf(LocalDate.now().getYear());

        String first = invoiceNumberOf(postInvoice(
                invoiceJson(createPayment("100000", "CASH", "VIRE-023")), 201));
        String second = invoiceNumberOf(postInvoice(
                invoiceJson(createPayment("200000", "CASH", "VIRE-024")), 201));
        String third = invoiceNumberOf(postInvoice(
                invoiceJson(createPayment("300000", "CASH", "VIRE-025")), 201));

        assertThat(first).isEqualTo("FAC-" + year + "-0001");
        assertThat(second).isEqualTo("FAC-" + year + "-0002");
        assertThat(third).isEqualTo("FAC-" + year + "-0003");
        assertThat(invoices.count()).isEqualTo(3);
    }

    // ----- validation -----

    /** Regle 14 - paymentId is mandatory: 400, nothing created. */
    @Test
    void answers400WhenPaymentIdMissing() throws Exception {
        postInvoice("{}", 400);

        assertThat(invoices.count()).isZero();
    }

    /** Regle 14 - a malformed paymentId cannot bind: 400, nothing created. */
    @Test
    void answers400ForMalformedPaymentId() throws Exception {
        postInvoice(invoiceJson("not-a-uuid"), 400);

        assertThat(invoices.count()).isZero();
    }
}
