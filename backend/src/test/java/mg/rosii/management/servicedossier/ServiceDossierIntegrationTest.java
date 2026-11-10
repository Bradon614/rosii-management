package mg.rosii.management.servicedossier;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.security.JwtService;
import mg.rosii.management.user.Role;
import mg.rosii.management.user.User;
import mg.rosii.management.user.UserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 17 — service dossier, end-to-end against a real PostgreSQL (Flyway
 * V1→V13). Fixtures are built through the real APIs of Features 04–15 so the
 * dossier is validated against actual domain behavior, not hand-seeded rows.
 * Skipped automatically without Docker.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class ServiceDossierIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "dossier-tests@example.com";
    private static final String LINE_DESCRIPTION = "Traiteur mariage";
    private static final BigDecimal LINE_QUANTITY = new BigDecimal("2");
    private static final BigDecimal LINE_UNIT_PRICE = new BigDecimal("250000");
    private static final BigDecimal PROPOSAL_TOTAL = new BigDecimal("500000.00");
    private static final BigDecimal DEPOSIT = new BigDecimal("100000");
    /**
     * Feature 07 rule (unchanged): a proposal can only be SENT with a
     * {@code validUntil}. The dossier fixtures go through the real transition
     * DRAFT -> SENT -> ACCEPTED, so they must supply one like every other
     * integration test does.
     */
    private static final String VALID_UNTIL = "2999-12-31";

    @ServiceConnection
    static final PostgreSQLContainer<?> postgres = POSTGRES;

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
    private DataSource dataSource;

    private String auth;

    @BeforeEach
    void cleanDataAndAuthenticate() throws Exception {
        // Both resources are declared in the try-with-resources header: obtaining
        // the connection inline would make only the Statement auto-closable and
        // leak one pooled connection per test method, exhausting the shared
        // Hikari pool for the rest of the suite.
        try (var connection = dataSource.getConnection();
                var statement = connection.createStatement()) {
            statement.execute("DELETE FROM payment_receipts");
            statement.execute("DELETE FROM invoices");
            statement.execute("DELETE FROM payments");
            statement.execute("DELETE FROM service_closures");
            statement.execute("DELETE FROM executions");
            statement.execute("DELETE FROM preparations");
            statement.execute("DELETE FROM proposal_lines");
            statement.execute("DELETE FROM proposals");
            statement.execute("DELETE FROM demand_event_details");
            statement.execute("DELETE FROM demands");
            statement.execute("DELETE FROM clients");
            statement.execute("DELETE FROM services");
            statement.execute("DELETE FROM users");
        }
        User patronne = users.saveAndFlush(new User(
                AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    // ---------------------------------------------------------------- fixtures

    private String json(Object... keyValues) throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>();
        for (int i = 0; i < keyValues.length; i += 2) {
            payload.put((String) keyValues[i], keyValues[i + 1]);
        }
        return objectMapper.writeValueAsString(payload);
    }

    private JsonNode postJson(String path, Object... keyValues) throws Exception {
        String body = mockMvc.perform(post(path).header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(keyValues)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private String createClient(String name) throws Exception {
        return postJson("/api/clients", "name", name, "phone1", "+261 34 12 34 56 78")
                .get("id").asText();
    }

    private String createDemand(String clientId) throws Exception {
        return postJson("/api/demands", "clientId", clientId, "type", "EVENT")
                .get("id").asText();
    }

    private JsonNode createProposal(String clientId, String demandId) throws Exception {
        Map<String, Object> line = new LinkedHashMap<>();
        line.put("description", LINE_DESCRIPTION);
        line.put("unit", "personne");
        line.put("quantity", LINE_QUANTITY);
        line.put("unitPrice", LINE_UNIT_PRICE);
        return postJson("/api/proposals",
                "clientId", clientId,
                "demandId", demandId,
                "title", "Mariage Rakoto",
                "validUntil", VALID_UNTIL,
                "requiredDeposit", DEPOSIT,
                "lines", java.util.List.of(line));
    }

    private long transitionProposal(String proposalId, String target, long version) throws Exception {
        String body = mockMvc.perform(patch("/api/proposals/" + proposalId + "/status")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("status", target, "version", version)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("version").asLong();
    }

    private String acceptProposal(String proposalId, long version) throws Exception {
        long sentVersion = transitionProposal(proposalId, "SENT", version);
        transitionProposal(proposalId, "ACCEPTED", sentVersion);
        return proposalId;
    }

    private String createPayment(String proposalId, String amount) throws Exception {
        return postJson("/api/payments",
                "proposalId", proposalId,
                "amount", new BigDecimal(amount),
                "method", "CASH",
                "paymentDate", LocalDate.now().toString(),
                "reference", "Caisse 1")
                .get("id").asText();
    }

    private void createReceipt(String paymentId) throws Exception {
        postJson("/api/payment-receipts", "paymentId", paymentId);
    }

    private void createInvoice(String paymentId) throws Exception {
        postJson("/api/invoices", "paymentId", paymentId);
    }

    private String createPreparation(String proposalId) throws Exception {
        return postJson("/api/preparations", "proposalId", proposalId).get("id").asText();
    }

    private String createExecution(String preparationId) throws Exception {
        return postJson("/api/executions", "preparationId", preparationId,
                "scheduledDate", LocalDate.now().plusDays(7).toString())
                .get("id").asText();
    }

    private void setExecutionStatus(String executionId, String target) throws Exception {
        mockMvc.perform(patch("/api/executions/" + executionId + "/status")
                        .header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json("status", target)))
                .andExpect(status().isOk());
    }

    private String createClosure(String preparationId) throws Exception {
        return postJson("/api/closures", "preparationId", preparationId,
                "finalNotes", "Prestation terminée sans incident").get("id").asText();
    }

    /** Full happy-path chain: client → demand → accepted proposal → payment/docs → prep → execution → closure. */
    private DossierFixture createFullDossier() throws Exception {
        String clientId = createClient("Alice Rakoto");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();
        acceptProposal(proposalId, proposal.get("version").asLong());
        String paymentId = createPayment(proposalId, "150000");
        createReceipt(paymentId);
        createInvoice(paymentId);
        String preparationId = createPreparation(proposalId);
        String executionId = createExecution(preparationId);
        setExecutionStatus(executionId, "IN_PROGRESS");
        setExecutionStatus(executionId, "COMPLETED");
        String closureId = createClosure(preparationId);
        return new DossierFixture(clientId, demandId, proposalId, paymentId, preparationId,
                executionId, closureId);
    }

    private record DossierFixture(String clientId, String demandId, String proposalId,
            String paymentId, String preparationId, String executionId, String closureId) {
    }

    private JsonNode dossier(String proposalId) throws Exception {
        String body = mockMvc.perform(get("/api/service-dossiers/" + proposalId)
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static BigDecimal decimal(JsonNode node, String field) {
        return node.get(field).decimalValue();
    }

    /**
     * A section that does not exist yet is serialized as an explicit JSON null
     * (the record always carries the field): it is never an error and never
     * omitted. {@code assertThat(node).isNull()} cannot be used here — the
     * actual value is a Jackson {@code NullNode}, not a Java {@code null}.
     */
    private static void assertNullSection(JsonNode body, String section) {
        JsonNode node = body.get(section);
        assertThat(node).as("%s section must be present in the payload", section).isNotNull();
        assertThat(node.isNull()).as("%s section must be null", section).isTrue();
    }

    /** The section exists and carries data (JSON object, not JSON null). */
    private static void assertPresentSection(JsonNode body, String section) {
        JsonNode node = body.get(section);
        assertThat(node == null || node.isNull()).as("%s section must not be null", section).isFalse();
    }

    // ------------------------------------------------------------------- tests

    @Test
    void fullDossierReturnsEverySection() throws Exception {
        DossierFixture fixture = createFullDossier();

        JsonNode body = dossier(fixture.proposalId());

        assertThat(body.get("proposal").get("number").asText()).startsWith("PROP-");
        assertThat(body.get("proposal").get("status").asText()).isEqualTo("ACCEPTED");
        assertThat(body.get("proposal").get("title").asText()).isEqualTo("Mariage Rakoto");
        assertThat(body.get("proposal").get("lines")).hasSize(1);
        assertThat(body.get("proposal").get("lines").get(0).get("description").asText())
                .isEqualTo(LINE_DESCRIPTION);
        assertThat(decimal(body.get("proposal"), "proposalTotal")).isEqualByComparingTo(PROPOSAL_TOTAL);
        assertThat(decimal(body.get("proposal"), "requiredDeposit")).isEqualByComparingTo(DEPOSIT);
        assertThat(decimal(body.get("proposal"), "totalPaid")).isEqualByComparingTo("150000.00");
        assertThat(decimal(body.get("proposal"), "remainingAmount")).isEqualByComparingTo("350000.00");
        assertThat(body.get("proposal").get("depositReached").asBoolean()).isTrue();

        assertThat(body.get("client").get("id").asText()).isEqualTo(fixture.clientId());
        assertThat(body.get("client").get("name").asText()).isEqualTo("Alice Rakoto");
        assertThat(body.get("demand").get("id").asText()).isEqualTo(fixture.demandId());
        assertThat(body.get("demand").get("type").asText()).isEqualTo("EVENT");

        assertThat(body.get("payments")).hasSize(1);
        assertThat(body.get("payments").get(0).get("id").asText()).isEqualTo(fixture.paymentId());
        assertThat(body.get("receipts")).hasSize(1);
        assertThat(body.get("receipts").get(0).get("receiptNumber").asText()).startsWith("REC-");
        assertThat(body.get("invoices")).hasSize(1);
        assertThat(body.get("invoices").get(0).get("invoiceNumber").asText()).startsWith("FAC-");

        assertThat(body.get("preparation").get("proposalId").asText()).isEqualTo(fixture.proposalId());
        assertThat(body.get("execution").get("status").asText()).isEqualTo("COMPLETED");
        assertThat(body.get("closure").get("status").asText()).isEqualTo("COMPLETED");
        assertThat(body.get("closure").get("finalNotes").asText()).isEqualTo("Prestation terminée sans incident");
    }

    @Test
    void proposalWithoutPaymentsHasZeroPaid() throws Exception {
        String clientId = createClient("Bob Example");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();
        acceptProposal(proposalId, proposal.get("version").asLong());

        JsonNode body = dossier(proposalId);

        assertThat(body.get("payments")).isEmpty();
        assertThat(body.get("receipts")).isEmpty();
        assertThat(body.get("invoices")).isEmpty();
        assertThat(decimal(body.get("proposal"), "totalPaid")).isEqualByComparingTo("0.00");
        assertThat(decimal(body.get("proposal"), "remainingAmount")).isEqualByComparingTo(PROPOSAL_TOTAL);
        assertThat(body.get("proposal").get("depositReached").asBoolean()).isFalse();
        assertNullSection(body, "preparation");
        assertNullSection(body, "execution");
        assertNullSection(body, "closure");
    }

    @Test
    void paymentsWithoutReceiptOrInvoiceAreReportedAlone() throws Exception {
        String clientId = createClient("Alice Rakoto");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();
        acceptProposal(proposalId, proposal.get("version").asLong());
        createPayment(proposalId, "150000");

        JsonNode body = dossier(proposalId);

        assertThat(body.get("payments")).hasSize(1);
        assertThat(body.get("receipts")).isEmpty();
        assertThat(body.get("invoices")).isEmpty();
        assertThat(decimal(body.get("proposal"), "totalPaid")).isEqualByComparingTo("150000.00");
    }

    @Test
    void proposalWithoutPreparationOrExecutionReportsNullSections() throws Exception {
        String clientId = createClient("Alice Rakoto");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();
        acceptProposal(proposalId, proposal.get("version").asLong());

        JsonNode body = dossier(proposalId);

        assertNullSection(body, "preparation");
        assertNullSection(body, "execution");
        assertNullSection(body, "closure");
    }

    @Test
    void executionWithoutClosureReportsNullClosure() throws Exception {
        String clientId = createClient("Alice Rakoto");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();
        acceptProposal(proposalId, proposal.get("version").asLong());
        createPayment(proposalId, "150000");
        String preparationId = createPreparation(proposalId);
        String executionId = createExecution(preparationId);

        JsonNode body = dossier(proposalId);

        assertPresentSection(body, "preparation");
        assertThat(body.get("execution").get("status").asText()).isEqualTo("PLANNED");
        assertNullSection(body, "closure");
        assertThat(body.get("execution").get("scheduledDate").asText())
                .isEqualTo(LocalDate.now().plusDays(7).toString());
    }

    @Test
    void softDeletedPaymentReceiptAndInvoiceAreExcluded() throws Exception {
        DossierFixture fixture = createFullDossier();

        mockMvc.perform(delete("/api/payment-receipts/" + receiptId(fixture.paymentId()))
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/invoices/" + invoiceId(fixture.paymentId()))
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/payments/" + fixture.paymentId())
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());

        JsonNode body = dossier(fixture.proposalId());

        assertThat(body.get("payments")).isEmpty();
        assertThat(body.get("receipts")).isEmpty();
        assertThat(body.get("invoices")).isEmpty();
        assertThat(decimal(body.get("proposal"), "totalPaid")).isEqualByComparingTo("0.00");
    }

    @Test
    void softDeletedPreparationHidesPreparationExecutionAndClosure() throws Exception {
        DossierFixture fixture = createFullDossier();

        // Feature 30: a preparation with an active execution or closure can no
        // longer be soft-deleted, so release the operational chain first
        // (closure, then execution) before deleting the preparation.
        mockMvc.perform(delete("/api/closures/" + fixture.closureId())
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/executions/" + fixture.executionId())
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());
        mockMvc.perform(delete("/api/preparations/" + fixture.preparationId())
                        .header("Authorization", auth))
                .andExpect(status().isNoContent());

        JsonNode body = dossier(fixture.proposalId());

        assertNullSection(body, "preparation");
        assertNullSection(body, "execution");
        assertNullSection(body, "closure");
        // Payments and proposal data are untouched by the preparation deletion.
        assertThat(body.get("payments")).hasSize(1);
        assertThat(decimal(body.get("proposal"), "totalPaid")).isEqualByComparingTo("150000.00");
    }

    @Test
    void financialValuesMatchTheProposalEndpoint() throws Exception {
        DossierFixture fixture = createFullDossier();

        JsonNode dossierProposal = dossier(fixture.proposalId()).get("proposal");
        String proposalBody = mockMvc.perform(get("/api/proposals/" + fixture.proposalId())
                        .header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode proposal = objectMapper.readTree(proposalBody);

        for (String field : new String[]{"proposalTotal", "requiredDeposit", "totalPaid", "remainingAmount"}) {
            assertThat(decimal(dossierProposal, field))
                    .as(field)
                    .isEqualByComparingTo(decimal(proposal, field));
        }
        assertThat(dossierProposal.get("depositReached").asBoolean())
                .isEqualTo(proposal.get("depositReached").asBoolean());
        assertThat(dossierProposal.get("lines")).hasSameSizeAs(proposal.get("lines"));
    }

    @Test
    void unknownProposalReturns404() throws Exception {
        mockMvc.perform(get("/api/service-dossiers/" + UUID.randomUUID())
                        .header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    @Test
    void softDeletedProposalReturns404() throws Exception {
        String clientId = createClient("Alice Rakoto");
        String demandId = createDemand(clientId);
        JsonNode proposal = createProposal(clientId, demandId);
        String proposalId = proposal.get("id").asText();

        mockMvc.perform(delete("/api/proposals/" + proposalId).header("Authorization", auth))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/service-dossiers/" + proposalId).header("Authorization", auth))
                .andExpect(status().isNotFound());
    }

    @Test
    void consultationDoesNotModifyAnyData() throws Exception {
        DossierFixture fixture = createFullDossier();

        JsonNode before = dossier(fixture.proposalId());
        JsonNode after = dossier(fixture.proposalId());

        // The representation is stable across reads: nothing was written.
        assertThat(after.get("proposal").get("version").asLong())
                .isEqualTo(before.get("proposal").get("version").asLong());
        assertThat(after.get("proposal").get("updatedAt").asText())
                .isEqualTo(before.get("proposal").get("updatedAt").asText());
        assertThat(after.get("payments").get(0).get("version").asLong())
                .isEqualTo(before.get("payments").get(0).get("version").asLong());
        assertThat(after.get("preparation").get("version").asLong())
                .isEqualTo(before.get("preparation").get("version").asLong());
        assertThat(after.get("closure").get("version").asLong())
                .isEqualTo(before.get("closure").get("version").asLong());
        assertThat(after.get("execution").get("completedAt").asText())
                .isEqualTo(before.get("execution").get("completedAt").asText());
        // The proposal itself still reports the same values through its own API.
        mockMvc.perform(get("/api/proposals/" + fixture.proposalId()).header("Authorization", auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));
    }

    @Test
    void unauthenticatedRequestIsRejected() throws Exception {
        mockMvc.perform(get("/api/service-dossiers/" + UUID.randomUUID()))
                .andExpect(status().isUnauthorized());
    }

    private String receiptId(String paymentId) throws Exception {
        String body = mockMvc.perform(get("/api/payment-receipts").header("Authorization", auth)
                        .param("paymentId", paymentId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get(0).get("id").asText();
    }

    private String invoiceId(String paymentId) throws Exception {
        String body = mockMvc.perform(get("/api/invoices").header("Authorization", auth)
                        .param("paymentId", paymentId))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get(0).get("id").asText();
    }
}