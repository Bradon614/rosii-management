package mg.rosii.management.payment;

import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.JsonNode;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 22 regression — {@code GET /api/payments?paymentDate=YYYY-MM-DD}
 * against a real PostgreSQL (Flyway V1→V13 run on context startup). Skipped
 * automatically without Docker.
 *
 * <p>The filter once answered HTTP 500 with the PostgreSQL error
 * {@code could not determine data type of parameter $5}. These tests exercise
 * the real HTTP endpoint and a real database: a mock or an in-memory database
 * could not prove the SQL parameter is typed correctly.
 *
 * <p>Also covers the non-regression of the Feature 08 list endpoint: no filter,
 * {@code method} alone, {@code proposalId} alone, and every combination.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class PaymentFilterIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "payment-filter-tests@example.com";
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
    private String createAcceptedProposal(String name, String phone, String requiredDeposit) throws Exception {
        String clientId = createClient(name, phone);
        String demandId = createDemand(clientId);
        String id = createProposal(clientId, demandId, requiredDeposit);
        transition(id, "SENT", 0);
        transition(id, "ACCEPTED", 1);
        return id;
    }

    private void transition(String proposalId, String target, long version) throws Exception {
        mockMvc.perform(patch("/api/proposals/" + proposalId + "/status").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\": \"%s\", \"version\": %d}".formatted(target, version)))
                .andExpect(status().isOk());
    }

    private String pay(String proposalId, String amount, String method, String paymentDate) throws Exception {
        String body = mockMvc.perform(post("/api/payments").header("Authorization", auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"proposalId": "%s", "amount": %s, "method": "%s", "paymentDate": "%s"}
                                """.formatted(proposalId, amount, method, paymentDate)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** Calls the real endpoint with the given query pairs and returns the JSON array. */
    private JsonNode listPayments(String... pairs) throws Exception {
        MockHttpServletRequestBuilder request = get("/api/payments");
        for (int i = 0; i < pairs.length; i += 2) {
            request = request.param(pairs[i], pairs[i + 1]);
        }
        String body = mockMvc.perform(request.header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body);
    }

    private static Set<String> ids(JsonNode array) {
        return StreamSupport.stream(array.spliterator(), false)
                .map(node -> node.get("id").asText())
                .collect(Collectors.toSet());
    }

    // ----- test fixture -----

    private record Fixture(String proposalA, String proposalB,
            String aCashToday, String aMobileToday, String aCashTomorrow, String bCashToday) {
    }

    /**
     * Proposal A: 2026-09-20 CASH, 2026-09-20 MOBILE_MONEY, 2026-09-21 CASH.
     * Proposal B: 2026-09-20 CASH. Four payments in total, three on 2026-09-20.
     */
    private Fixture fixture() throws Exception {
        String proposalA = createAcceptedProposal("Alice Rakoto", "+261 34 12 34 56 78", "2000000");
        String proposalB = createAcceptedProposal("Bob Example", "+261 33 00 11 22 33", "2000000");
        String aCashToday = pay(proposalA, "100000", "CASH", "2026-09-20");
        String aMobileToday = pay(proposalA, "200000", "MOBILE_MONEY", "2026-09-20");
        String aCashTomorrow = pay(proposalA, "300000", "CASH", "2026-09-21");
        String bCashToday = pay(proposalB, "400000", "CASH", "2026-09-20");
        return new Fixture(proposalA, proposalB, aCashToday, aMobileToday, aCashTomorrow, bCashToday);
    }

    // ----- tests -----

    /** Non-regression: the list keeps working with no parameter at all. */
    @Test
    void listsAllPaymentsWithoutFilter() throws Exception {
        fixture();

        JsonNode body = listPayments();

        assertThat(body).hasSize(4);
    }

    /** The paymentDate filter keeps meaning "exactly this local date". */
    @Test
    void filtersByExactPaymentDate() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20");

        assertThat(body).hasSize(3);
        assertThat(ids(body)).containsExactlyInAnyOrder(
                data.aCashToday(), data.aMobileToday(), data.bCashToday());
        body.forEach(payment -> assertThat(payment.get("paymentDate").asText()).isEqualTo("2026-09-20"));
    }

    /** A valid date with no payment is an empty list, never an error. */
    @Test
    void returnsEmptyListForDateWithoutResult() throws Exception {
        fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-22");

        assertThat(body).isEmpty();
    }

    @Test
    void combinesPaymentDateAndMethod() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20", "method", "CASH");

        assertThat(ids(body)).containsExactlyInAnyOrder(data.aCashToday(), data.bCashToday());
        body.forEach(payment -> {
            assertThat(payment.get("paymentDate").asText()).isEqualTo("2026-09-20");
            assertThat(payment.get("method").asText()).isEqualTo("CASH");
        });
    }

    @Test
    void combinesPaymentDateAndProposal() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20", "proposalId", data.proposalA());

        assertThat(ids(body)).containsExactlyInAnyOrder(data.aCashToday(), data.aMobileToday());
        body.forEach(payment -> assertThat(payment.get("proposalId").asText()).isEqualTo(data.proposalA()));
    }

    @Test
    void combinesAllThreeFilters() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20", "method", "CASH",
                "proposalId", data.proposalA());

        assertThat(body).hasSize(1);
        assertThat(body.get(0).get("id").asText()).isEqualTo(data.aCashToday());
        assertThat(body.get(0).get("amount").decimalValue()).isEqualByComparingTo("100000.00");
    }

    /** Non-regression: method alone still works. */
    @Test
    void filtersByMethodAlone() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("method", "CASH");

        assertThat(ids(body)).containsExactlyInAnyOrder(
                data.aCashToday(), data.aCashTomorrow(), data.bCashToday());
    }

    /** Non-regression: proposalId alone still works. */
    @Test
    void filtersByProposalAlone() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("proposalId", data.proposalB());

        assertThat(body).hasSize(1);
        assertThat(body.get(0).get("id").asText()).isEqualTo(data.bCashToday());
    }

    @Test
    void invalidDateIsRejectedWith400() throws Exception {
        fixture();

        for (String invalid : new String[] {"2026-13-45", "not-a-date", "20/09/2026"}) {
            mockMvc.perform(get("/api/payments").param("paymentDate", invalid)
                            .header("Authorization", auth))
                    .andExpect(status().isBadRequest());
        }
    }

    /** Several payments recorded the same day are all returned. */
    @Test
    void severalPaymentsOnTheSameDayAreAllReturned() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20");

        assertThat(body).hasSize(3);
        assertThat(ids(body)).contains(data.aCashToday(), data.aMobileToday(), data.bCashToday());
        assertThat(ids(body)).doesNotContain(data.aCashTomorrow());
    }

    /**
     * The exact regression: the date filter must not raise the PostgreSQL
     * parameter-type error. A 200 with a JSON array is the observable proof.
     */
    @Test
    void dateFilterDoesNotTriggerPostgresParameterTypeError() throws Exception {
        fixture();

        mockMvc.perform(get("/api/payments").param("paymentDate", "2026-09-20")
                        .header("Authorization", auth))
                .andExpect(status().isOk());
    }

    /** The public response contract is unchanged by the fix. */
    @Test
    void paymentRepresentationIsUnchanged() throws Exception {
        Fixture data = fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20", "proposalId", data.proposalB());

        assertThat(body).hasSize(1);
        JsonNode payment = body.get(0);
        assertThat(payment.get("proposalId").asText()).isEqualTo(data.proposalB());
        assertThat(payment.get("proposalNumber").asText()).startsWith("PROP-");
        assertThat(payment.get("amount").decimalValue()).isEqualByComparingTo("400000.00");
        assertThat(payment.get("method").asText()).isEqualTo("CASH");
        assertThat(payment.get("paymentDate").asText()).isEqualTo("2026-09-20");
        assertThat(payment.has("createdAt")).isTrue();
        assertThat(payment.has("updatedAt")).isTrue();
        assertThat(payment.has("version")).isTrue();
    }

    /** Unknown proposalId with a date filter stays an empty list (no invented 404). */
    @Test
    void unknownProposalWithDateFilterReturnsEmptyList() throws Exception {
        fixture();

        JsonNode body = listPayments("paymentDate", "2026-09-20",
                "proposalId", UUID.randomUUID().toString());

        assertThat(body).isEmpty();
    }
}
