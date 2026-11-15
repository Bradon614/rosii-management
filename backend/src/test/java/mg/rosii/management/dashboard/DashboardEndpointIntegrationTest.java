package mg.rosii.management.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.demand.BudgetType;
import mg.rosii.management.demand.Demand;
import mg.rosii.management.demand.DemandRepository;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.demand.DemandType;
import mg.rosii.management.execution.Execution;
import mg.rosii.management.execution.ExecutionRepository;
import mg.rosii.management.execution.ExecutionStatus;
import mg.rosii.management.payment.Payment;
import mg.rosii.management.payment.PaymentMethod;
import mg.rosii.management.payment.PaymentRepository;
import mg.rosii.management.preparation.Preparation;
import mg.rosii.management.preparation.PreparationRepository;
import mg.rosii.management.proposal.Proposal;
import mg.rosii.management.proposal.ProposalLine;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Feature 35 — business equivalence of the aggregated dashboard against a real
 * PostgreSQL (Testcontainers). Skipped automatically without Docker.
 *
 * <p>The first test is the important one: it recomputes every indicator from the
 * five list endpoints — exactly the way the dashboard used to — and asserts that
 * {@code GET /api/dashboard} returns the very same numbers. A regression of the
 * lazy proposal expiration (a stored {@code SENT} proposal past its validity must
 * count as {@code EXPIRED}) therefore fails here.
 */
@SpringBootTest(properties = "jwt.secret=integration-test-signing-secret-32-chars!")
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
class DashboardEndpointIntegrationTest extends IntegrationTestSupport {

    private static final String AUTH_EMAIL = "dashboard-tests@example.com";
    private static final LocalDate PAST = LocalDate.now().minusDays(30);
    private static final LocalDate FUTURE = LocalDate.now().plusDays(30);

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
    private ClientRepository clients;

    @Autowired
    private DemandRepository demands;

    @Autowired
    private ProposalRepository proposals;

    @Autowired
    private PaymentRepository payments;

    @Autowired
    private PreparationRepository preparations;

    @Autowired
    private ExecutionRepository executions;

    @Autowired
    private ServiceClosureRepository closures;

    @Autowired
    private JdbcTemplate jdbc;

    private String auth;
    private int numberSequence;

    @BeforeEach
    void resetAndAuthenticate() {
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        payments.deleteAll();
        proposals.deleteAll();
        demands.deleteAll();
        clients.deleteAll();
        numberSequence = 0;

        User patronne = users.findByEmailAndDeletedAtIsNull(AUTH_EMAIL)
                .orElseGet(() -> users.saveAndFlush(new User(
                        AUTH_EMAIL, passwordEncoder.encode("not-used-for-login"), Role.PATRONNE)));
        auth = "Bearer " + jwtService.generateToken(patronne.getId(), patronne.getEmail(), patronne.getRole());
    }

    // ----- the test that matters -----

    @Test
    void aggregatesExactlyWhatTheFiveListEndpointsReport() throws Exception {
        Client client = newClient("Alice Rakoto");
        Demand demand = newDemand(client, DemandType.EVENT, DemandStatus.ACCEPTED);

        // Five proposals stored SENT whose validity is already past: they must be
        // reported as EXPIRED without any write.
        for (int i = 0; i < 5; i++) {
            newProposal(client, demand, ProposalStatus.SENT, PAST, "1000.00", "500.00");
        }
        // One SENT still valid, one DRAFT, one soft-deleted DRAFT.
        newProposal(client, demand, ProposalStatus.SENT, FUTURE, "1000.00", "500.00");
        newProposal(client, demand, ProposalStatus.DRAFT, FUTURE, "1000.00", "500.00");
        softDeleteProposal(newProposal(client, demand, ProposalStatus.DRAFT, FUTURE, "1000.00", "500.00"));

        // Two accepted proposals: one has not reached its deposit, one has.
        Proposal unpaid = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "1000.55", "600.00");
        newPayment(unpaid, "400.25");
        Proposal paid = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "2000.00", "500.00");
        newPayment(paid, "500.00");
        softDeletePayment(newPayment(unpaid, "999.00"));

        // Four more accepted proposals with a settled deposit (remaining 0), each
        // hosting one execution and/or one closure.
        Proposal inProgress = settledProposal(client, demand);
        Proposal cancelled = settledProposal(client, demand);
        Proposal deletedExecution = settledProposal(client, demand);
        Proposal deletedClosure = settledProposal(client, demand);

        // Executions: one of each status, plus a soft-deleted one.
        newExecution(unpaid, ExecutionStatus.PLANNED, null);
        newExecution(paid, ExecutionStatus.COMPLETED, OffsetDateTime.now().minusHours(3));
        newExecution(inProgress, ExecutionStatus.IN_PROGRESS, null);
        newExecution(cancelled, ExecutionStatus.CANCELLED, null);
        softDeleteExecution(newExecution(deletedExecution, ExecutionStatus.PLANNED, null));

        // Closures: one of each status, plus a soft-deleted one.
        newClosure(unpaid, ClosureStatus.COMPLETED);
        newClosure(paid, ClosureStatus.WITH_ISSUE);
        softDeleteClosure(newClosure(deletedClosure, ClosureStatus.COMPLETED));

        // Soft-deleted demand, to prove the exclusion on the demand side too.
        softDeleteDemand(newDemand(client, DemandType.OTHER, DemandStatus.NEW));

        JsonNode dashboard = dashboard();

        // --- recompute everything from the five list endpoints
        JsonNode demandList = list("/api/demands");
        JsonNode proposalList = list("/api/proposals");
        JsonNode paymentList = list("/api/payments");
        JsonNode executionList = list("/api/executions");
        JsonNode closureList = list("/api/closures");

        assertThat(dashboard.get("demandsTotal").asLong()).isEqualTo(demandList.size());
        assertSameDistribution(dashboard.get("demandsByStatus"), countBy(demandList, "status"));
        assertSameDistribution(dashboard.get("proposalsByStatus"), countBy(proposalList, "status"));
        assertSameDistribution(dashboard.get("executionsByStatus"), countBy(executionList, "status"));
        assertSameDistribution(dashboard.get("closuresByStatus"), countBy(closureList, "status"));
        assertThat(typeDistribution(dashboard.get("demandsByType")))
                .containsExactlyEntriesOf(countDemandsByType(demandList));

        assertThat(dashboard.get("proposalsTotal").asLong()).isEqualTo(proposalList.size());
        assertThat(dashboard.get("acceptedProposals").asLong())
                .isEqualTo(countWhere(proposalList, "status", "ACCEPTED"));
        assertThat(dashboard.get("pendingProposals").asLong())
                .isEqualTo(countWhere(proposalList, "status", "SENT"));

        assertThat(dashboard.get("paymentsCount").asLong()).isEqualTo(paymentList.size());
        assertThat(dashboard.get("paymentsTotal").decimalValue())
                .isEqualByComparingTo(sumOf(paymentList, "amount"));

        assertThat(dashboard.get("executionsTotal").asLong()).isEqualTo(executionList.size());
        assertThat(dashboard.get("closuresTotal").asLong()).isEqualTo(closureList.size());

        BigDecimal expectedRemaining = BigDecimal.ZERO;
        long expectedWithoutDeposit = 0;
        for (JsonNode proposal : proposalList) {
            if ("ACCEPTED".equals(proposal.get("status").asText())) {
                expectedRemaining = expectedRemaining.add(proposal.get("remainingAmount").decimalValue());
                if (!proposal.get("depositReached").asBoolean()) {
                    expectedWithoutDeposit++;
                }
            }
        }
        assertThat(dashboard.get("acceptedRemaining").decimalValue())
                .isEqualByComparingTo(expectedRemaining);
        assertThat(dashboard.get("acceptedWithoutDeposit").asLong()).isEqualTo(expectedWithoutDeposit);

        // --- the lazy expiration rule, asserted explicitly
        assertThat(countWhere(proposalList, "status", "EXPIRED")).isEqualTo(5);
        assertThat(countWhere(proposalList, "status", "SENT")).isEqualTo(1);
        assertThat(dashboard.get("pendingProposals").asLong()).isEqualTo(1);
        // The six stored SENT rows are untouched: the rule only changes the report.
        assertThat(jdbc.queryForObject(
                "select count(*) from proposals where status = 'SENT' and deleted_at is null", Long.class))
                .isEqualTo(6);

        // --- soft-deleted rows are excluded everywhere
        assertThat(dashboard.get("demandsTotal").asLong()).isEqualTo(1);
        assertThat(dashboard.get("proposalsTotal").asLong()).isEqualTo(13);
        assertThat(dashboard.get("paymentsCount").asLong()).isEqualTo(6);
        assertThat(dashboard.get("executionsTotal").asLong()).isEqualTo(4);
        assertThat(dashboard.get("closuresTotal").asLong()).isEqualTo(2);

        // --- independent numeric checks (rounding and deposit flag)
        assertThat(dashboard.get("acceptedRemaining").decimalValue()).isEqualByComparingTo("2100.30");
        assertThat(dashboard.get("acceptedWithoutDeposit").asLong()).isEqualTo(1);
        assertThat(dashboard.get("paymentsTotal").decimalValue()).isEqualByComparingTo("1300.25");
        assertThat(dashboard.get("paymentsCount").asLong()).isEqualTo(6);
    }

    @Test
    void keepsTheActivityTimelineEquivalentToTheFiveLists() throws Exception {
        Client client = newClient("Alice Rakoto");
        Demand demand = newDemand(client, DemandType.EVENT, DemandStatus.ACCEPTED);
        Proposal accepted = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "1000.00", "500.00");
        newPayment(accepted, "500.00");
        newExecution(accepted, ExecutionStatus.COMPLETED, OffsetDateTime.now().minusHours(2));
        newClosure(accepted, ClosureStatus.COMPLETED);

        List<String> expected = expectedTimelineFromTheLists();

        List<String> actual = new ArrayList<>();
        for (JsonNode event : dashboard().get("recentActivity")) {
            actual.add(composedId(event));
        }

        assertThat(actual).isEqualTo(expected);
    }

    @Test
    void reportsTheSixRealEventKindsAndIgnoresUndatedEvents() throws Exception {
        Client client = newClient("Alice Rakoto");
        Demand demand = newDemand(client, DemandType.EVENT, DemandStatus.ACCEPTED);
        Proposal host = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "1000.00", "500.00");
        host.setAcceptedAt(OffsetDateTime.now().minusMinutes(20));
        proposals.saveAndFlush(host);
        newPayment(host, "500.00");
        newExecution(host, ExecutionStatus.COMPLETED, OffsetDateTime.now().minusMinutes(10));
        newClosure(host, ClosureStatus.COMPLETED);
        // A second proposal whose execution was never completed: no event for it.
        Proposal planned = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "100.00", "50.00");
        newExecution(planned, ExecutionStatus.PLANNED, null);

        JsonNode timeline = dashboard().get("recentActivity");

        List<String> kinds = new ArrayList<>();
        for (JsonNode event : timeline) {
            kinds.add(event.get("kind").asText());
        }
        assertThat(kinds).hasSizeLessThanOrEqualTo(8);
        assertThat(kinds).contains(
                "demand_created",
                "proposal_created",
                "proposal_accepted",
                "payment_recorded",
                "execution_completed",
                "closure_closed");
        assertThat(kinds.stream().filter("execution_completed"::equals).count()).isEqualTo(1);
    }

    @Test
    void breaksIdenticalInstantsByComposedIdentifier() throws Exception {
        Client client = newClient("Alice Rakoto");
        Demand demand = newDemand(client, DemandType.EVENT, DemandStatus.NEW);
        newProposal(client, demand, ProposalStatus.DRAFT, FUTURE, "100.00", "50.00");
        newProposal(client, demand, ProposalStatus.DRAFT, FUTURE, "100.00", "50.00");

        // Force every event onto the very same instant, so only the tie-break
        // can decide the order.
        jdbc.update("update demands set created_at = timestamp with time zone '2026-01-01 10:00:00+00'");
        jdbc.update("update proposals set created_at = timestamp with time zone '2026-01-01 10:00:00+00'");

        List<String> expectedComposedIds = new ArrayList<>();
        for (JsonNode demandRow : list("/api/demands")) {
            expectedComposedIds.add("demand-created-" + demandRow.get("id").asText());
        }
        for (JsonNode proposalRow : list("/api/proposals")) {
            expectedComposedIds.add("proposal-created-" + proposalRow.get("id").asText());
        }
        expectedComposedIds.sort(Comparator.naturalOrder());

        List<String> actual = new ArrayList<>();
        for (JsonNode event : dashboard().get("recentActivity")) {
            assertThat(event.get("date").asText()).startsWith("2026-01-01");
            actual.add(composedId(event));
        }

        assertThat(actual).isEqualTo(expectedComposedIds);
    }

    @Test
    void limitsTheTimelineToEightEvents() throws Exception {
        Client client = newClient("Alice Rakoto");
        Demand demand = newDemand(client, DemandType.EVENT, DemandStatus.NEW);
        for (int i = 0; i < 12; i++) {
            newProposal(client, demand, ProposalStatus.DRAFT, FUTURE, "100.00", "50.00");
        }

        JsonNode timeline = dashboard().get("recentActivity");

        assertThat(timeline).hasSize(8);
        OffsetDateTime previous = null;
        for (JsonNode event : timeline) {
            OffsetDateTime current = OffsetDateTime.parse(event.get("date").asText());
            if (previous != null) {
                assertThat(current).isBeforeOrEqualTo(previous);
            }
            previous = current;
        }
    }

    @Test
    void returnsZerosAndNoActivityOnAnEmptyDatabase() throws Exception {
        JsonNode dashboard = dashboard();

        assertThat(dashboard.get("demandsTotal").asLong()).isZero();
        assertThat(dashboard.get("proposalsTotal").asLong()).isZero();
        assertThat(dashboard.get("acceptedProposals").asLong()).isZero();
        assertThat(dashboard.get("pendingProposals").asLong()).isZero();
        assertThat(dashboard.get("paymentsCount").asLong()).isZero();
        assertThat(dashboard.get("paymentsTotal").decimalValue()).isEqualByComparingTo("0");
        assertThat(dashboard.get("acceptedRemaining").decimalValue()).isEqualByComparingTo("0");
        assertThat(dashboard.get("acceptedWithoutDeposit").asLong()).isZero();
        assertThat(dashboard.get("executionsTotal").asLong()).isZero();
        assertThat(dashboard.get("closuresTotal").asLong()).isZero();
        assertThat(dashboard.get("recentActivity")).isEmpty();

        // Every status is still listed, with a zero count: the dashboard always
        // renders the full distribution.
        assertThat(dashboard.get("demandsByStatus")).hasSize(DemandStatus.values().length);
        assertThat(dashboard.get("proposalsByStatus")).hasSize(ProposalStatus.values().length);
        assertThat(dashboard.get("executionsByStatus")).hasSize(ExecutionStatus.values().length);
        assertThat(dashboard.get("closuresByStatus")).hasSize(ClosureStatus.values().length);
        assertThat(dashboard.get("demandsByType")).isEmpty();
        for (JsonNode item : dashboard.get("demandsByStatus")) {
            assertThat(item.get("count").asLong()).isZero();
        }
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/dashboard")).andExpect(status().isUnauthorized());
    }

    // ----- HTTP helpers -----

    private JsonNode dashboard() throws Exception {
        return getJson("/api/dashboard");
    }

    private JsonNode list(String path) throws Exception {
        return getJson(path);
    }

    private JsonNode getJson(String path) throws Exception {
        String response = mockMvc.perform(get(path).header("Authorization", auth))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(response);
    }

    // ----- seeding -----

    private Client newClient(String name) {
        Client client = new Client();
        client.setName(name);
        client.setPhone1("+261 34 00 00 00");
        return clients.saveAndFlush(client);
    }

    private Demand newDemand(Client client, DemandType type, DemandStatus status) {
        Demand demand = new Demand();
        demand.setClient(client);
        demand.setType(type);
        demand.setStatus(status);
        demand.setBudgetType(BudgetType.NONE);
        return demands.saveAndFlush(demand);
    }

    private void softDeleteDemand(Demand demand) {
        demand.markDeleted();
        demands.saveAndFlush(demand);
    }

    private Proposal newProposal(Client client, Demand demand, ProposalStatus status,
            LocalDate validUntil, String lineAmount, String deposit) {
        Proposal proposal = new Proposal();
        proposal.setNumber("DASH-2026-%04d".formatted(++numberSequence));
        proposal.setClient(client);
        proposal.setDemand(demand);
        proposal.setStatus(status);
        proposal.setValidUntil(validUntil);
        ProposalLine line = new ProposalLine();
        line.setDescription("Prestation");
        line.setUnit("forfait");
        line.setQuantity(BigDecimal.ONE);
        line.setUnitPrice(new BigDecimal(lineAmount));
        proposal.replaceLines(List.of(line));
        proposal.changeRequiredDeposit(new BigDecimal(deposit));
        return proposals.saveAndFlush(proposal);
    }

    /** An accepted proposal whose deposit is fully paid: remaining amount is zero. */
    private Proposal settledProposal(Client client, Demand demand) {
        Proposal proposal = newProposal(client, demand, ProposalStatus.ACCEPTED, FUTURE, "100.00", "50.00");
        newPayment(proposal, "100.00");
        return proposal;
    }

    private void softDeleteProposal(Proposal proposal) {
        proposal.markDeleted();
        proposals.saveAndFlush(proposal);
    }

    private Payment newPayment(Proposal proposal, String amount) {
        Payment payment = new Payment();
        payment.setProposal(proposal);
        payment.setAmount(new BigDecimal(amount));
        payment.setMethod(PaymentMethod.CASH);
        payment.setPaymentDate(LocalDate.now());
        return payments.saveAndFlush(payment);
    }

    private void softDeletePayment(Payment payment) {
        payment.markDeleted();
        payments.saveAndFlush(payment);
    }

    /**
     * The single active preparation of a proposal.
     *
     * <p>A proposal has at most one active preparation (partial unique index), and
     * a preparation at most one active execution and one active closure, so every
     * seeded execution or closure of the same proposal shares this one.
     */
    private Preparation preparationFor(Proposal proposal) {
        return preparations.findByProposalIdAndDeletedAtIsNull(proposal.getId())
                .orElseGet(() -> {
                    Preparation preparation = new Preparation();
                    preparation.setProposal(proposal);
                    return preparations.saveAndFlush(preparation);
                });
    }

    private Execution newExecution(Proposal proposal, ExecutionStatus status, OffsetDateTime completedAt) {
        Execution execution = new Execution();
        execution.setPreparation(preparationFor(proposal));
        execution.setStatus(status);
        execution.setCompletedAt(completedAt);
        return executions.saveAndFlush(execution);
    }

    private void softDeleteExecution(Execution execution) {
        execution.markDeleted();
        executions.saveAndFlush(execution);
    }

    private ServiceClosure newClosure(Proposal proposal, ClosureStatus status) {
        ServiceClosure closure = new ServiceClosure();
        closure.setPreparation(preparationFor(proposal));
        closure.setStatus(status);
        closure.setClosedAt(OffsetDateTime.now().minusHours(4));
        return closures.saveAndFlush(closure);
    }

    private void softDeleteClosure(ServiceClosure closure) {
        closure.markDeleted();
        closures.saveAndFlush(closure);
    }

    // ----- recomputation helpers (the logic the dashboard used to run) -----

    private static Map<String, Long> countBy(JsonNode array, String field) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode item : array) {
            counts.merge(item.get(field).asText(), 1L, Long::sum);
        }
        return counts;
    }

    private static long countWhere(JsonNode array, String field, String value) {
        long count = 0;
        for (JsonNode item : array) {
            if (value.equals(item.get(field).asText())) {
                count++;
            }
        }
        return count;
    }

    private static BigDecimal sumOf(JsonNode array, String field) {
        BigDecimal total = BigDecimal.ZERO;
        for (JsonNode item : array) {
            total = total.add(item.get(field).decimalValue());
        }
        return total;
    }

    /** Demand types with at least one demand, decreasing count then declaration order. */
    private static Map<String, Long> countDemandsByType(JsonNode demandList) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode demand : demandList) {
            counts.merge(demand.get("type").asText(), 1L, Long::sum);
        }
        List<Map.Entry<String, Long>> ordered = new ArrayList<>(counts.entrySet());
        ordered.sort(Comparator
                .comparingLong((Map.Entry<String, Long> entry) -> entry.getValue()).reversed()
                .thenComparingInt(entry -> DemandType.valueOf(entry.getKey()).ordinal()));
        Map<String, Long> result = new LinkedHashMap<>();
        ordered.forEach(entry -> result.put(entry.getKey(), entry.getValue()));
        return result;
    }

    private static Map<String, Long> distribution(JsonNode array) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode item : array) {
            counts.put(item.get("status").asText(), item.get("count").asLong());
        }
        return counts;
    }

    /** The type distribution of the demands (a `type` key, not a `status` one). */
    private static Map<String, Long> typeDistribution(JsonNode array) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode item : array) {
            counts.put(item.get("type").asText(), item.get("count").asLong());
        }
        return counts;
    }

    /** The distribution must list every expected status, zero counts included. */
    private void assertSameDistribution(JsonNode actual, Map<String, Long> expectedNonZero) {
        List<String> statuses = new ArrayList<>();
        for (JsonNode item : actual) {
            statuses.add(item.get("status").asText());
        }
        for (String status : expectedNonZero.keySet()) {
            assertThat(statuses).contains(status);
        }
        for (JsonNode item : actual) {
            String status = item.get("status").asText();
            long expected = expectedNonZero.getOrDefault(status, 0L);
            assertThat(item.get("count").asLong())
                    .describedAs("count of %s", status)
                    .isEqualTo(expected);
        }
        long total = 0;
        for (JsonNode item : actual) {
            total += item.get("count").asLong();
        }
        long expectedTotal = expectedNonZero.values().stream().mapToLong(Long::longValue).sum();
        assertThat(total).isEqualTo(expectedTotal);
    }

    /**
     * The timeline the desktop application used to build: every real event of the
     * five lists, newest first, ties broken by the composed identifier, first 8.
     */
    private List<String> expectedTimelineFromTheLists() throws Exception {
        record Event(OffsetDateTime date, String composedId) {
        }
        List<Event> events = new ArrayList<>();

        for (JsonNode demand : list("/api/demands")) {
            events.add(new Event(OffsetDateTime.parse(demand.get("createdAt").asText()),
                    "demand-created-" + demand.get("id").asText()));
        }
        for (JsonNode proposal : list("/api/proposals")) {
            events.add(new Event(OffsetDateTime.parse(proposal.get("createdAt").asText()),
                    "proposal-created-" + proposal.get("id").asText()));
            if (!proposal.get("acceptedAt").isNull()) {
                events.add(new Event(OffsetDateTime.parse(proposal.get("acceptedAt").asText()),
                        "proposal-accepted-" + proposal.get("id").asText()));
            }
        }
        for (JsonNode payment : list("/api/payments")) {
            events.add(new Event(OffsetDateTime.parse(payment.get("createdAt").asText()),
                    "payment-recorded-" + payment.get("id").asText()));
        }
        for (JsonNode execution : list("/api/executions")) {
            if (!execution.get("completedAt").isNull()) {
                events.add(new Event(OffsetDateTime.parse(execution.get("completedAt").asText()),
                        "execution-completed-" + execution.get("id").asText()));
            }
        }
        for (JsonNode closure : list("/api/closures")) {
            if (!closure.get("closedAt").isNull()) {
                events.add(new Event(OffsetDateTime.parse(closure.get("closedAt").asText()),
                        "closure-closed-" + closure.get("id").asText()));
            }
        }

        return events.stream()
                .sorted(Comparator.comparing(Event::date).reversed()
                        .thenComparing(Event::composedId))
                .limit(8)
                .map(Event::composedId)
                .toList();
    }

    private static String composedId(JsonNode event) {
        String kind = event.get("kind").asText().replace('_', '-');
        UUID id = UUID.fromString(event.get("id").asText());
        return kind + "-" + id;
    }
}