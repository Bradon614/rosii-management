package mg.rosii.management.payment;

import java.math.BigDecimal;
import java.util.UUID;

import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Payment/deposit management end-to-end against a real PostgreSQL (Flyway V1→V7
 * run on context startup). Skipped automatically without Docker.
 *
 * <p>Covers Feature 08: payments only for ACCEPTED proposals, derived totals and
 * depositReached, soft delete excluded from totals, over-total refusal, over-deposit
 * allowed, optimistic locking and filters.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PaymentManagementIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "payment-tests@example.com";
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
    private ProposalRepository proposals;

    @Autowired
    private PaymentRepository payments;

    private String auth;

    @BeforeEach
    void authenticateAsPatronne() {
        // This class owns the payment table: reset it (and its proposals) so each
        // test starts from a clean state.
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

    /** Creates an ACCEPTED proposal (the only status that accepts payments). */
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

    private String payJson(String proposalId, String amount, String method) {
        return """
                {"proposalId": "%s", "amount": %s, "method": "%s", "paymentDate": "2026-09-20",
                 "reference": "REC-001", "notes": "Acompte"}
                """.formatted(proposalId, amount, method);
    }

    private String pay(String proposalId, String amount, String method, int expected) throws Exception {
        String body = mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payJson(proposalId, amount, method)))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
        return body;
    }

    private long versionOf(String body) throws Exception {
        return objectMapper.readTree(body).get("version").asLong();
    }

    private String proposalOf(String proposalId) throws Exception {
        return mockMvc.perform(get("/api/proposals/" + proposalId).header("Authorization", auth))
                .andReturn().getResponse().getContentAsString();
    }


    // ----- tests -----

    @Test
    void createsPaymentForAcceptedProposal() throws Exception {
        String proposalId = createAcceptedProposal("2000000");

        String body = pay(proposalId, "500000", "CASH", 201);
        var json = objectMapper.readTree(body);
        assertThat(json.get("proposalId").asText()).isEqualTo(proposalId);
        assertThat(json.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(json.get("amount").decimalValue()).isEqualByComparingTo("500000.00");
        assertThat(json.get("method").asText()).isEqualTo("CASH");
        assertThat(json.get("paymentDate").asText()).isEqualTo("2026-09-20");
        assertThat(json.get("version").asLong()).isZero();
        assertThat(json.get("reference").asText()).isEqualTo("REC-001");
    }

    @Test
    void allPaymentMethodsAreAccepted() throws Exception {
        String proposalId = createAcceptedProposal("2000000");

        pay(proposalId, "100000", "CASH", 201);
        pay(proposalId, "100000", "MOBILE_MONEY", 201);
        pay(proposalId, "100000", "BANK_TRANSFER", 201);

        var proposal = objectMapper.readTree(proposalOf(proposalId));
        assertThat(proposal.get("totalPaid").decimalValue()).isEqualByComparingTo("300000.00");
    }

    /** The main Feature 08 business case (two steps). */
    @Test
    void depositIsReachedByASecondPayment() throws Exception {
        String proposalId = createAcceptedProposal("2000000");

        pay(proposalId, "1500000", "CASH", 201);
        var afterFirst = objectMapper.readTree(proposalOf(proposalId));
        assertThat(afterFirst.get("proposalTotal").decimalValue()).isEqualByComparingTo("4000000.00");
        assertThat(afterFirst.get("requiredDeposit").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(afterFirst.get("totalPaid").decimalValue()).isEqualByComparingTo("1500000.00");
        assertThat(afterFirst.get("remainingAmount").decimalValue()).isEqualByComparingTo("2500000.00");
        assertThat(afterFirst.get("depositReached").asBoolean()).isFalse();

        pay(proposalId, "500000", "MOBILE_MONEY", 201);
        var afterSecond = objectMapper.readTree(proposalOf(proposalId));
        assertThat(afterSecond.get("totalPaid").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(afterSecond.get("remainingAmount").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(afterSecond.get("depositReached").asBoolean()).isTrue();
    }

    @Test
    void paymentAboveRequiredDepositIsAllowed() throws Exception {
        String proposalId = createAcceptedProposal("1500000");

        pay(proposalId, "2000000", "BANK_TRANSFER", 201);

        var proposal = objectMapper.readTree(proposalOf(proposalId));
        assertThat(proposal.get("totalPaid").decimalValue()).isEqualByComparingTo("2000000.00");
        assertThat(proposal.get("depositReached").asBoolean()).isTrue();
    }

    @Test
    void severalPaymentsAccumulate() throws Exception {
        String proposalId = createAcceptedProposal("2000000");

        pay(proposalId, "1000000", "CASH", 201);
        pay(proposalId, "500000", "CASH", 201);
        pay(proposalId, "700000", "MOBILE_MONEY", 201);

        var proposal = objectMapper.readTree(proposalOf(proposalId));
        assertThat(proposal.get("totalPaid").decimalValue()).isEqualByComparingTo("2200000.00");
        assertThat(proposal.get("depositReached").asBoolean()).isTrue();
        assertThat(proposal.get("remainingAmount").decimalValue()).isEqualByComparingTo("1800000.00");
    }

    @Test
    void paymentAboveProposalTotalIsRefused() throws Exception {
        String proposalId = createAcceptedProposal("2000000");

        // Two payments that exactly reach the 4 000 000 total.
        pay(proposalId, "2000000", "CASH", 201);
        pay(proposalId, "2000000", "BANK_TRANSFER", 201);

        // One more cent would exceed the total -> 409, never a refund/credit.
        pay(proposalId, "0.01", "CASH", 409);

        var proposal = objectMapper.readTree(proposalOf(proposalId));
        assertThat(proposal.get("totalPaid").decimalValue()).isEqualByComparingTo("4000000.00");
        assertThat(proposal.get("remainingAmount").decimalValue()).isEqualByComparingTo("0.00");
    }


    @Test
    void paymentOnlyForAcceptedProposal() throws Exception {
        String clientId = createClient("Alice Rakoto", "+261 34 12 34 56 78");
        String demandId = createDemand(clientId);

        // DRAFT -> 409.
        String draft = createProposal(clientId, demandId, "1000000");
        pay(draft, "100000", "CASH", 409);

        // SENT -> 409.
        transition(draft, "SENT", 0);
        pay(draft, "100000", "CASH", 409);

        // REFUSED -> 409.
        transition(draft, "REFUSED", 1);
        pay(draft, "100000", "CASH", 409);

        // CANCELLED -> 409.
        String cancelled = createProposal(clientId, demandId, "1000000");
        transition(cancelled, "CANCELLED", 0);
        pay(cancelled, "100000", "CASH", 409);

        // EXPIRED -> 409 (forced out of band; expiration is lazy).
        String expired = createProposal(clientId, demandId, "1000000");
        transition(expired, "SENT", 0);
        forceValidUntil(expired, "2000-01-01");
        mockMvc.perform(get("/api/proposals/" + expired).header("Authorization", auth))
                .andExpect(jsonPath("$.status").value("EXPIRED"));
        pay(expired, "100000", "CASH", 409);

        // Unknown proposal -> 404.
        pay(UUID.randomUUID().toString(), "100000", "CASH", 404);
    }

    @Test
    void softDeletedPaymentLeavesTheTotals() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        String created = pay(proposalId, "1500000", "CASH", 201);
        String paymentId = objectMapper.readTree(created).get("id").asText();

        mockMvc.perform(delete("/api/payments/" + paymentId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        var proposal = objectMapper.readTree(proposalOf(proposalId));
        assertThat(proposal.get("totalPaid").decimalValue()).isEqualByComparingTo("0.00");
        assertThat(proposal.get("depositReached").asBoolean()).isFalse();

        // The deleted payment disappears from reads and lists but the row stays.
        mockMvc.perform(get("/api/payments/" + paymentId).header("Authorization", auth))
                .andExpect(status().isNotFound());
        var list = mockMvc.perform(get("/api/payments").header("Authorization", auth))
                .andReturn().getResponse().getContentAsString();
        assertThat(objectMapper.readTree(list)).isEmpty();
        assertThat(payments.findById(UUID.fromString(paymentId)).orElseThrow().getDeletedAt()).isNotNull();
    }

    @Test
    void paymentUpdateChecksVersionAndProposalTotal() throws Exception {
        String proposalId = createAcceptedProposal("2000000");
        String created = pay(proposalId, "1000000", "CASH", 201);
        String paymentId = objectMapper.readTree(created).get("id").asText();
        long version = versionOf(created);

        // Valid update: amount, method and reference can change.
        mockMvc.perform(put("/api/payments/" + paymentId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"version\": %d, \"amount\": 1200000, \"method\": \"MOBILE_MONEY\","
                                + " \"paymentDate\": \"2026-09-21\", \"reference\": \"REC-002\","
                                + " \"notes\": null}").formatted(version)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.amount").value(1200000.00))
                .andExpect(jsonPath("$.method").value("MOBILE_MONEY"))
                .andExpect(jsonPath("$.version").value(version + 1));

        // Stale version -> 409.
        mockMvc.perform(put("/api/payments/" + paymentId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"version\": %d, \"amount\": 100000, \"method\": \"CASH\","
                                + " \"paymentDate\": \"2026-09-21\"}").formatted(version)))
                .andExpect(status().isConflict());

        // An update that would exceed the proposal total -> 409.
        mockMvc.perform(put("/api/payments/" + paymentId).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(("{\"version\": %d, \"amount\": 4000001, \"method\": \"CASH\","
                                + " \"paymentDate\": \"2026-09-21\"}").formatted(version + 1)))
                .andExpect(status().isConflict());
    }

    // ----- test-only fixture helpers -----

    /** Applies a status transition that is expected to succeed. */
    private void transition(String proposalId, String target, long version) throws Exception {
        mockMvc.perform(patch("/api/proposals/" + proposalId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\", \"version\": %d}".formatted(target, version)))
                .andExpect(status().isOk());
    }

    /** Forces valid_until out of band (connection always closed properly). */
    private void forceValidUntil(String proposalId, String date) throws Exception {
        try (var connection = POSTGRES.createConnection("");
                var statement = connection.createStatement()) {
            statement.execute("UPDATE proposals SET valid_until = '" + date
                    + "' WHERE id = '" + proposalId + "'");
        }
    }
}
