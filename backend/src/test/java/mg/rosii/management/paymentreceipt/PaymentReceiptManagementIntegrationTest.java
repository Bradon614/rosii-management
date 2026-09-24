package mg.rosii.management.paymentreceipt;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.UUID;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Payment receipt management end-to-end against a real PostgreSQL (Flyway V1→V11
 * run on context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 12: creation gated on an existing active payment with at
 * most one active receipt, backend-generated REC-YYYY-NNNN numbers, the full
 * payment snapshot (amount/method/date/reference, payment never modified),
 * reads and list filters, soft delete (deleted numbers never reused, slot
 * released for recreation), immutability (no PUT: 405) and payload validation.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PaymentReceiptManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "receipt-tests@example.com";
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
    private PaymentReceiptRepository receipts;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private ProposalRepository proposals;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns the payment_receipts table: reset it (and its payments and
        // proposals) so each test starts from a clean state.
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

    private String receiptJson(String paymentId) {
        return "{\"paymentId\": \"%s\"}".formatted(paymentId);
    }

    private String postReceipt(String json, int expected) throws Exception {
        return mockMvc.perform(post("/api/payment-receipts").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private String getReceipt(String id, int expected) throws Exception {
        return mockMvc.perform(get("/api/payment-receipts/" + id).header("Authorization", auth))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private void deleteReceipt(String id, int expected) throws Exception {
        mockMvc.perform(delete("/api/payment-receipts/" + id).header("Authorization", auth))
                .andExpect(status().is(expected));
    }

    private String receiptIdOf(String receiptBody) throws Exception {
        return objectMapper.readTree(receiptBody).get("id").asText();
    }

    private String receiptNumberOf(String receiptBody) throws Exception {
        return objectMapper.readTree(receiptBody).get("receiptNumber").asText();
    }

    // ----- creation -----

    /** Regle 1/7 - a receipt is created for a valid payment with the full snapshot. */
    @Test
    void createsReceiptForValidPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-001");

        var json = objectMapper.readTree(postReceipt(receiptJson(paymentId), 201));

        assertThat(json.get("paymentId").asText()).isEqualTo(paymentId);
        assertThat(json.get("receiptNumber").asText()).matches("REC-\\d{4}-\\d{4}");
        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("500000.00");
        assertThat(json.get("paymentMethod").asText()).isEqualTo("CASH");
        assertThat(json.get("paymentDate").asText()).isEqualTo(PAYMENT_DATE);
        assertThat(json.get("paymentReference").asText()).isEqualTo("VIRE-001");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("createdAt")).isNotNull();
        assertThat(json.get("updatedAt")).isNotNull();
        assertThat(receipts.count()).isEqualTo(1);
    }

    /** Regle 2.3 - snapshot: amount, and the payment itself is never modified. */
    @Test
    void snapshotCopiesAmountFromPayment() throws Exception {
        String paymentId = createPayment("750000", "MOBILE_MONEY", "VIRE-002");

        var json = objectMapper.readTree(postReceipt(receiptJson(paymentId), 201));

        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("750000.00");
        var payment = payments.findById(UUID.fromString(paymentId)).orElseThrow();
        assertThat(payment.getAmount()).isEqualByComparingTo("750000");
        assertThat(payment.getVersion()).isZero();
    }

    /** Regle 2.3 - snapshot: payment method. */
    @Test
    void snapshotCopiesMethodFromPayment() throws Exception {
        String paymentId = createPayment("500000", "BANK_TRANSFER", "VIRE-003");

        var json = objectMapper.readTree(postReceipt(receiptJson(paymentId), 201));

        assertThat(json.get("paymentMethod").asText()).isEqualTo("BANK_TRANSFER");
    }

    /** Regle 2.3 - snapshot: payment date. */
    @Test
    void snapshotCopiesDateFromPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-004");

        var json = objectMapper.readTree(postReceipt(receiptJson(paymentId), 201));

        assertThat(json.get("paymentDate").asText()).isEqualTo(PAYMENT_DATE);
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getPaymentDate())
                .isEqualTo(LocalDate.parse(PAYMENT_DATE));
    }

    /** Regle 2.3 - snapshot: payment reference. */
    @Test
    void snapshotCopiesReferenceFromPayment() throws Exception {
        String paymentId = createPayment("500000", "MOBILE_MONEY", "ORANGE-778899");

        var json = objectMapper.readTree(postReceipt(receiptJson(paymentId), 201));

        assertThat(json.get("paymentReference").asText()).isEqualTo("ORANGE-778899");
    }

    /** Regle 2.2 - unknown payment: 404, nothing created. */
    @Test
    void answers404ForUnknownPayment() throws Exception {
        postReceipt(receiptJson(UUID.randomUUID().toString()), 404);

        assertThat(receipts.count()).isZero();
    }

    /** Regle 2.2 - soft-deleted payment: 404, nothing created. */
    @Test
    void answers404ForSoftDeletedPayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-005");
        mockMvc.perform(delete("/api/payments/" + paymentId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        postReceipt(receiptJson(paymentId), 404);

        assertThat(receipts.count()).isZero();
    }

    /** Regle 2.1 - second active receipt for the same payment: 409. */
    @Test
    void answers409ForSecondReceiptOnSamePayment() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-006");
        postReceipt(receiptJson(paymentId), 201);

        postReceipt(receiptJson(paymentId), 409);

        assertThat(receipts.count()).isEqualTo(1);
    }

    // ----- consultation -----

    /** GET by id: 200 with the receipt, 404 when unknown. */
    @Test
    void getsReceiptById() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-010");
        String id = receiptIdOf(postReceipt(receiptJson(paymentId), 201));

        var json = objectMapper.readTree(getReceipt(id, 200));

        assertThat(json.get("id").asText()).isEqualTo(id);
        assertThat(json.get("paymentId").asText()).isEqualTo(paymentId);
        assertThat(json.get("receiptNumber").asText()).matches("REC-\\d{4}-\\d{4}");
        getReceipt(UUID.randomUUID().toString(), 404);
    }

    /** The list returns every active receipt in issuance order. */
    @Test
    void listsReceipts() throws Exception {
        String first = postReceipt(receiptJson(createPayment("500000", "CASH", "VIRE-011")), 201);
        String second = postReceipt(receiptJson(createPayment("400000", "CASH", "VIRE-012")), 201);

        var list = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(list).hasSize(2);
        assertThat(list.get(0).get("id").asText()).isEqualTo(receiptIdOf(first));
        assertThat(list.get(1).get("id").asText()).isEqualTo(receiptIdOf(second));
    }

    /** Filter by paymentId: only that payment's receipt. */
    @Test
    void filtersByPaymentId() throws Exception {
        String paymentA = createPayment("500000", "CASH", "VIRE-013");
        String paymentB = createPayment("400000", "CASH", "VIRE-014");
        String receiptA = postReceipt(receiptJson(paymentA), 201);
        postReceipt(receiptJson(paymentB), 201);

        var list = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .param("paymentId", paymentA).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("id").asText()).isEqualTo(receiptIdOf(receiptA));
        assertThat(list.get(0).get("paymentId").asText()).isEqualTo(paymentA);

        var none = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .param("paymentId", UUID.randomUUID().toString()).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(none).isEmpty();
    }

    /** Filter by receiptNumber: exact match only. */
    @Test
    void filtersByReceiptNumber() throws Exception {
        String body = postReceipt(receiptJson(createPayment("500000", "CASH", "VIRE-015")), 201);
        String number = receiptNumberOf(body);

        var list = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .param("receiptNumber", number).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());

        assertThat(list).hasSize(1);
        assertThat(list.get(0).get("receiptNumber").asText()).isEqualTo(number);

        var none = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .param("receiptNumber", "REC-1999-0001").header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(none).isEmpty();
    }

    /** Soft-deleted receipts never appear in reads or filtered lists. */
    @Test
    void excludesSoftDeletedReceiptsFromReads() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-016");
        String id = receiptIdOf(postReceipt(receiptJson(paymentId), 201));
        deleteReceipt(id, 204);

        getReceipt(id, 404);
        var list = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(list).isEmpty();
        var filtered = objectMapper.readTree(mockMvc.perform(get("/api/payment-receipts")
                        .param("paymentId", paymentId).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(filtered).isEmpty();
    }

    // ----- suppression -----

    /** Regle 11 - soft delete: 204, row kept, gone from the API (never physical). */
    @Test
    void softDeletesReceipt() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-017");
        String id = receiptIdOf(postReceipt(receiptJson(paymentId), 201));

        deleteReceipt(id, 204);

        assertThat(receipts.findById(UUID.fromString(id)).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(receipts.count()).isEqualTo(1); // the row stays for history
        getReceipt(id, 404);
        deleteReceipt(id, 404);
    }

    /** Regle 11 - a deleted number is never reused: the next one moves forward. */
    @Test
    void doesNotReuseNumberAfterSoftDelete() throws Exception {
        String firstBody = postReceipt(receiptJson(createPayment("500000", "CASH", "VIRE-018")), 201);
        String firstNumber = receiptNumberOf(firstBody);
        deleteReceipt(receiptIdOf(firstBody), 204);

        String secondNumber = receiptNumberOf(postReceipt(
                receiptJson(createPayment("400000", "CASH", "VIRE-019")), 201));

        assertThat(secondNumber).isNotEqualTo(firstNumber);
        assertThat(Integer.parseInt(secondNumber.substring(secondNumber.length() - 4)))
                .isEqualTo(Integer.parseInt(firstNumber.substring(firstNumber.length() - 4)) + 1);
    }

    /** Regle 17 - the slot is released: the same payment may get a new receipt. */
    @Test
    void allowsRecreationForSamePaymentAfterSoftDelete() throws Exception {
        String paymentId = createPayment("500000", "CASH", "VIRE-020");
        String firstBody = postReceipt(receiptJson(paymentId), 201);
        String firstNumber = receiptNumberOf(firstBody);
        deleteReceipt(receiptIdOf(firstBody), 204);

        String secondBody = postReceipt(receiptJson(paymentId), 201);

        assertThat(receiptNumberOf(secondBody)).isNotEqualTo(firstNumber);
        assertThat(receipts.findMatching(UUID.fromString(paymentId), null)).hasSize(1);
        assertThat(receipts.count()).isEqualTo(2); // the soft-deleted row is kept
    }

    // ----- immutabilite -----

    /** Regle 12 - no PUT exists: a receipt can never be modified (405), data untouched. */
    @Test
    void answers405OnPut() throws Exception {
        String body = postReceipt(receiptJson(createPayment("500000", "CASH", "VIRE-021")), 201);
        String id = receiptIdOf(body);
        String number = receiptNumberOf(body);

        mockMvc.perform(put("/api/payment-receipts/" + id).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"version\": 0, \"amount\": 1}"))
                .andExpect(status().isMethodNotAllowed());

        var json = objectMapper.readTree(getReceipt(id, 200));
        assertThat(json.get("receiptNumber").asText()).isEqualTo(number);
        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("500000.00");
        assertThat(json.get("version").asLong()).isZero();
    }

    // ----- validation -----

    /** Regle 17 - paymentId is mandatory: 400, nothing created. */
    @Test
    void answers400WhenPaymentIdMissing() throws Exception {
        postReceipt("{}", 400);

        assertThat(receipts.count()).isZero();
    }

    /** Regle 17 - malformed paymentId: 400 (deserialization), nothing created. */
    @Test
    void answers400ForMalformedPaymentId() throws Exception {
        postReceipt(receiptJson("not-a-uuid"), 400);

        assertThat(receipts.count()).isZero();
    }

    /** Regle 17 - the snapshot is really persisted on the receipt row itself. */
    @Test
    void persistsSnapshotInDatabase() throws Exception {
        String paymentId = createPayment("750000", "MOBILE_MONEY", "REF-DB-1");

        String id = receiptIdOf(postReceipt(receiptJson(paymentId), 201));

        var receipt = receipts.findById(UUID.fromString(id)).orElseThrow();
        assertThat(receipt.getPayment().getId()).isEqualTo(UUID.fromString(paymentId));
        assertThat(receipt.getReceiptNumber()).matches("REC-\\d{4}-\\d{4}");
        assertThat(receipt.getAmount()).isEqualByComparingTo("750000.00");
        assertThat(receipt.getPaymentMethod().name()).isEqualTo("MOBILE_MONEY");
        assertThat(receipt.getPaymentDate()).isEqualTo(LocalDate.parse(PAYMENT_DATE));
        assertThat(receipt.getPaymentReference()).isEqualTo("REF-DB-1");
        assertThat(receipt.getCreatedAt()).isNotNull();
        assertThat(receipt.getUpdatedAt()).isNotNull();
        assertThat(receipt.getDeletedAt()).isNull();
        assertThat(receipt.getVersion()).isZero();
        // Creating a receipt never touches the payment row.
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getVersion()).isZero();
    }

    // ----- numerotation -----

    /** Regle 3/17 - format REC-YYYY-NNNN with the current year, starting at 0001. */
    @Test
    void generatesReceiptNumberFormat() throws Exception {
        String body = postReceipt(receiptJson(createPayment("500000", "CASH", "VIRE-030")), 201);

        String number = receiptNumberOf(body);
        assertThat(number).matches("REC-\\d{4}-\\d{4}");
        assertThat(number).isEqualTo("REC-%s-0001".formatted(LocalDate.now().getYear()));
    }

    /** Regle 3/17 - several receipts get strictly increasing, collision-free numbers. */
    @Test
    void generatesSequentialUniqueNumbers() throws Exception {
        String n1 = receiptNumberOf(postReceipt(
                receiptJson(createPayment("500000", "CASH", "VIRE-031")), 201));
        String n2 = receiptNumberOf(postReceipt(
                receiptJson(createPayment("400000", "CASH", "VIRE-032")), 201));
        String n3 = receiptNumberOf(postReceipt(
                receiptJson(createPayment("300000", "CASH", "VIRE-033")), 201));

        String year = String.valueOf(LocalDate.now().getYear());
        assertThat(n1).isEqualTo("REC-%s-0001".formatted(year));
        assertThat(n2).isEqualTo("REC-%s-0002".formatted(year));
        assertThat(n3).isEqualTo("REC-%s-0003".formatted(year));
        assertThat(n1).isNotEqualTo(n2).isNotEqualTo(n3);
        assertThat(n2).isNotEqualTo(n3);
    }
}