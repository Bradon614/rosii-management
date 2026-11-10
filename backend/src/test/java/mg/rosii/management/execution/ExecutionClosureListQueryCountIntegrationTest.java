package mg.rosii.management.execution;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

import mg.rosii.management.IntegrationTestSupport;
import mg.rosii.management.client.Client;
import mg.rosii.management.client.ClientRepository;
import mg.rosii.management.closure.ClosureService;
import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.closure.ServiceClosure;
import mg.rosii.management.closure.ServiceClosureRepository;
import mg.rosii.management.closure.dto.ClosureResponse;
import mg.rosii.management.demand.Demand;
import mg.rosii.management.demand.DemandRepository;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.demand.DemandType;
import mg.rosii.management.demand.BudgetType;
import mg.rosii.management.execution.dto.ExecutionResponse;
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
 * Feature 34 — measures the SQL cost of the execution and closure list queries
 * against a real PostgreSQL (Testcontainers), using Hibernate's own statistics.
 *
 * <p>The measured property is the one that matters for an N+1: the number of
 * prepared statements must NOT grow with the number of rows. Each measurement
 * resets the counters, discards a warm-up call (so JVM/JDBC first-use noise is
 * outside the measurement) and compares the same list at 1, 10 and 50 rows.
 *
 * <p>The "before" figures come from reading the same rows WITHOUT the joined
 * fetch and mapping the response through the lazy associations, i.e. exactly the
 * statement pattern the Feature 34 optimization replaces.
 */
@SpringBootTest(properties = {
        "jwt.secret=integration-test-signing-secret-32-chars!",
        "spring.jpa.properties.hibernate.generate_statistics=true" })
@Testcontainers(disabledWithoutDocker = true)
class ExecutionClosureListQueryCountIntegrationTest extends IntegrationTestSupport {

    @Autowired
    private ExecutionService executionService;

    @Autowired
    private ClosureService closureService;

    @Autowired
    private EntityManagerFactory entityManagerFactory;

    @Autowired
    private ClientRepository clients;

    @Autowired
    private DemandRepository demands;

    @Autowired
    private ProposalRepository proposals;

    @Autowired
    private PreparationRepository preparations;

    @Autowired
    private ExecutionRepository executions;

    @Autowired
    private ServiceClosureRepository closures;

    private Statistics statistics;
    private Client client;
    private Demand demand;
    private int numberSequence;

    @BeforeEach
    void setUp() {
        statistics = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();

        // This class owns the operational chain: reset children before parents.
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        proposals.deleteAll();
        demands.deleteAll();
        clients.deleteAll();
        numberSequence = 0;

        client = new Client();
        client.setName("F34 Client");
        client.setPhone1("+261 34 00 00 00");
        client = clients.saveAndFlush(client);

        demand = new Demand();
        demand.setClient(client);
        demand.setType(DemandType.EVENT);
        demand.setStatus(DemandStatus.ACCEPTED);
        demand.setBudgetType(BudgetType.NONE);
        demand = demands.saveAndFlush(demand);
    }

    // ----- seeding -----

    /** Creates {@code count} complete chains (proposal -> preparation -> execution -> closure). */
    private void seedChains(int count) {
        for (int i = 0; i < count; i++) {
            Proposal proposal = new Proposal();
            proposal.setNumber("PERF-2026-%04d".formatted(++numberSequence));
            proposal.setClient(client);
            proposal.setDemand(demand);
            proposal.setStatus(ProposalStatus.ACCEPTED);
            ProposalLine line = new ProposalLine();
            line.setDescription("Prestation");
            line.setUnit("forfait");
            line.setQuantity(BigDecimal.ONE);
            line.setUnitPrice(new BigDecimal("4000000"));
            proposal.replaceLines(List.of(line));
            proposal.changeRequiredDeposit(new BigDecimal("2000000"));
            proposal = proposals.saveAndFlush(proposal);

            Preparation preparation = new Preparation();
            preparation.setProposal(proposal);
            preparation = preparations.saveAndFlush(preparation);

            Execution execution = new Execution();
            execution.setPreparation(preparation);
            execution.setScheduledDate(LocalDate.of(2999, 1, 1).plusDays(i));
            executions.saveAndFlush(execution);

            ServiceClosure closure = new ServiceClosure();
            closure.setPreparation(preparation);
            closure.setStatus(ClosureStatus.COMPLETED);
            closure.setClosedAt(OffsetDateTime.now());
            closures.saveAndFlush(closure);
        }
    }

    /** Removes the chains seeded so far so the next round starts from a known size. */
    private void resetChains() {
        closures.deleteAll();
        executions.deleteAll();
        preparations.deleteAll();
        proposals.deleteAll();
    }

    // ----- measurement helpers -----

    /** Statements prepared by ONE {@code ExecutionService.list} call over {@code expected} rows. */
    private long executionListStatements(int expected) {
        executionService.list(null, null, null);           // warm-up, discarded
        statistics.clear();
        List<ExecutionResponse> rows = executionService.list(null, null, null);
        long statements = statistics.getPrepareStatementCount();
        assertThat(rows).hasSize(expected);
        return statements;
    }

    /** Statements prepared by ONE {@code ClosureService.list} call over {@code expected} rows. */
    private long closureListStatements(int expected) {
        closureService.list(null, null);                   // warm-up, discarded
        statistics.clear();
        List<ClosureResponse> rows = closureService.list(null, null);
        long statements = statistics.getPrepareStatementCount();
        assertThat(rows).hasSize(expected);
        return statements;
    }

    /**
     * "Before" pattern for the execution list: load the rows without fetching the
     * associations, then map every row through the lazy preparation/proposal.
     */
    private long naiveExecutionListStatements() {
        try (EntityManager em = entityManagerFactory.createEntityManager()) {
            readWithoutFetch(em);                          // warm-up, discarded
            statistics.clear();
            List<Execution> rows = readWithoutFetch(em);
            rows.forEach(ExecutionResponse::from);
            return statistics.getPrepareStatementCount();
        }
    }

    private static List<Execution> readWithoutFetch(EntityManager em) {
        return em.createQuery("select e from Execution e where e.deletedAt is null", Execution.class)
                .getResultList();
    }

    /**
     * "Before" pattern for the closure list: load the rows without fetching, then
     * resolve the proposal and the active execution of each row separately.
     */
    private long naiveClosureListStatements() {
        try (EntityManager em = entityManagerFactory.createEntityManager()) {
            readClosuresWithoutFetch(em);                  // warm-up, discarded
            statistics.clear();
            List<ServiceClosure> rows = readClosuresWithoutFetch(em);
            for (ServiceClosure closure : rows) {
                UUID preparationId = closure.getPreparation().getId();
                ClosureResponse.from(closure,
                        executions.findByPreparationIdAndDeletedAtIsNull(preparationId).orElse(null));
            }
            return statistics.getPrepareStatementCount();
        }
    }

    private static List<ServiceClosure> readClosuresWithoutFetch(EntityManager em) {
        return em.createQuery("select c from ServiceClosure c where c.deletedAt is null",
                ServiceClosure.class).getResultList();
    }

    // ----- execution list -----

    /** The execution list costs the same whatever the number of rows. */
    @Test
    void executionListUsesAConstantNumberOfStatements() {
        seedChains(1);
        long one = executionListStatements(1);

        resetChains();
        seedChains(10);
        long ten = executionListStatements(10);

        resetChains();
        seedChains(50);
        long fifty = executionListStatements(50);

        System.out.printf("[F34] executions list statements: 1 row=%d, 10 rows=%d, 50 rows=%d%n",
                one, ten, fifty);

        assertThat(ten).isEqualTo(one);
        assertThat(fifty).isEqualTo(one);
        // One joined query for the whole list (no per-row statement).
        assertThat(one).isEqualTo(1);
    }

    /** The replaced pattern really grew with the number of rows (the N+1 that F34 removes). */
    @Test
    void naiveExecutionListGrowsWithTheNumberOfRows() {
        seedChains(1);
        long one = naiveExecutionListStatements();

        resetChains();
        seedChains(10);
        long ten = naiveExecutionListStatements();

        System.out.printf("[F34] naive executions mapping statements: 1 row=%d, 10 rows=%d%n",
                one, ten);

        assertThat(ten).isGreaterThan(one);
        // At least the preparation and proposal lazy loads of every row on top of
        // the list query (measured: 1 statement + 2 per row).
        assertThat(ten).isGreaterThanOrEqualTo(1L + 2 * 10);
    }

    // ----- closure list -----

    /** The closure list costs the same whatever the number of rows. */
    @Test
    void closureListUsesAConstantNumberOfStatements() {
        seedChains(1);
        long one = closureListStatements(1);

        resetChains();
        seedChains(10);
        long ten = closureListStatements(10);

        resetChains();
        seedChains(50);
        long fifty = closureListStatements(50);

        System.out.printf("[F34] closures list statements: 1 row=%d, 10 rows=%d, 50 rows=%d%n",
                one, ten, fifty);

        assertThat(ten).isEqualTo(one);
        assertThat(fifty).isEqualTo(one);
        // One joined query for the closures/proposals + one batched query for the
        // active executions of every listed preparation.
        assertThat(one).isEqualTo(2);
    }

    /** The replaced pattern really grew with the number of rows (the N+1 that F34 removes). */
    @Test
    void naiveClosureListGrowsWithTheNumberOfRows() {
        seedChains(1);
        long one = naiveClosureListStatements();

        resetChains();
        seedChains(10);
        long ten = naiveClosureListStatements();

        System.out.printf("[F34] naive closures mapping statements: 1 row=%d, 10 rows=%d%n",
                one, ten);

        assertThat(ten).isGreaterThan(one);
        // Measured: the list query plus 3 statements per row (preparation init,
        // proposal init and the active-execution lookup). The exact split is a
        // Hibernate detail, so only the growth is asserted here.
        assertThat(ten).isGreaterThanOrEqualTo(1L + 3 * 10);
    }
}