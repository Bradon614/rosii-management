package mg.rosii.management.dashboard;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import jakarta.persistence.EntityManagerFactory;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.dashboard.dto.DashboardResponse;
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

import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Feature 35 — measures the SQL cost of the aggregated dashboard against a real
 * PostgreSQL (Testcontainers), using Hibernate's own statistics.
 *
 * <p>The measured property is the one that matters: the number of prepared
 * statements must NOT grow with the number of rows. Each measurement discards a
 * warm-up call (so JVM/JDBC first-use noise is outside the measurement), resets
 * the counters, then reads the whole dashboard at 1, 10 and 50 complete
 * business chains.
 *
 * <p>The statements are counted honestly, the {@code ProposalService.list} call
 * that provides the two financial indicators included: it is a deliberate,
 * documented cost (reusing the existing derived rules rather than duplicating
 * them in SQL), not an oversight.
 */
@SpringBootTest(properties = {
        "jwt.secret=integration-test-signing-secret-32-chars!",
        "spring.jpa.properties.hibernate.generate_statistics=true" })
@Testcontainers(disabledWithoutDocker = true)
class DashboardQueryCountIntegrationTest extends IntegrationTestSupport {

    /** Throws instead of silently passing if the optimization is ever lost. */
    private static final long MAX_STATEMENTS = 8;

    @Autowired
    private DashboardService dashboardService;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

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

    private Statistics statistics;
    private Client client;
    private int chainNumber;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();

        // This class owns the whole dataset: reset children before parents.
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        payments.deleteAll();
        proposals.deleteAll();
        demands.deleteAll();
        clients.deleteAll();
        chainNumber = 0;

        client = new Client();
        client.setName("F35 Client");
        client.setPhone1("+261 34 00 00 00");
        client = clients.saveAndFlush(client);
    }

    // ----- seeding -----

    /** Creates {@code count} complete chains: demand, proposal, payment, execution, closure. */
    private void seedChains(int count) {
        for (int i = 0; i < count; i++) {
            int index = ++chainNumber;

            Demand demand = new Demand();
            demand.setClient(client);
            demand.setType(DemandType.EVENT);
            demand.setStatus(DemandStatus.ACCEPTED);
            demand.setBudgetType(BudgetType.NONE);
            demands.saveAndFlush(demand);

            Proposal proposal = new Proposal();
            proposal.setNumber("F35-2026-%04d".formatted(index));
            proposal.setClient(client);
            proposal.setDemand(demand);
            proposal.setStatus(ProposalStatus.ACCEPTED);
            proposal.setValidUntil(LocalDate.now().plusDays(30));
            ProposalLine line = new ProposalLine();
            line.setDescription("Prestation");
            line.setUnit("forfait");
            line.setQuantity(BigDecimal.ONE);
            line.setUnitPrice(new BigDecimal("1000.00"));
            proposal.replaceLines(List.of(line));
            proposal.changeRequiredDeposit(new BigDecimal("500.00"));
            proposals.saveAndFlush(proposal);

            Payment payment = new Payment();
            payment.setProposal(proposal);
            payment.setAmount(new BigDecimal("400.00"));
            payment.setMethod(PaymentMethod.CASH);
            payment.setPaymentDate(LocalDate.now());
            payments.saveAndFlush(payment);

            Preparation preparation = new Preparation();
            preparation.setProposal(proposal);
            preparations.saveAndFlush(preparation);

            Execution execution = new Execution();
            execution.setPreparation(preparation);
            execution.setStatus(ExecutionStatus.COMPLETED);
            execution.setScheduledDate(LocalDate.now().plusDays(i));
            execution.setCompletedAt(OffsetDateTime.now().minusHours(1));
            executions.saveAndFlush(execution);

            ServiceClosure closure = new ServiceClosure();
            closure.setPreparation(preparation);
            closure.setStatus(ClosureStatus.COMPLETED);
            closure.setClosedAt(OffsetDateTime.now().minusHours(2));
            closures.saveAndFlush(closure);
        }
    }

    // ----- measurement -----

    /** Statements prepared by ONE dashboard read over {@code expected} chains. */
    private long statementsFor(int expected) {
        dashboardService.summary();              // warm-up, discarded
        statistics.clear();
        DashboardResponse response = dashboardService.summary();
        long statements = statistics.getPrepareStatementCount();

        assertThat(response.executionsTotal()).isEqualTo(expected);
        assertThat(response.closuresTotal()).isEqualTo(expected);
        assertThat(response.demandsTotal()).isEqualTo(expected);
        assertThat(response.paymentsCount()).isEqualTo(expected);
        assertThat(response.acceptedProposals()).isEqualTo(expected);
        return statements;
    }

    @Test
    void theNumberofStatementsDoesNotGrowWithTheNumberOfRows() {
        seedChains(1);
        long one = statementsFor(1);

        seedChains(9);
        long ten = statementsFor(10);

        seedChains(40);
        long fifty = statementsFor(50);

        System.out.println("[F35] dashboard statements: 1 chain=" + one
                + ", 10 chains=" + ten + ", 50 chains=" + fifty);

        assertThat(one).isEqualTo(ten);
        assertThat(ten).isEqualTo(fifty);
        assertThat(fifty).isLessThanOrEqualTo(MAX_STATEMENTS);
    }

    @Test
    void theActivityTimelineStaysBoundedWhateverTheVolume() {
        seedChains(50);

        DashboardResponse response = dashboardService.summary();

        assertThat(response.recentActivity()).hasSize(DashboardService.ACTIVITY_LIMIT);
        System.out.println("[F35] dashboard activity rows for 50 chains: "
                + response.recentActivity().size());
    }
}