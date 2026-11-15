package mg.rosii.management.dashboard;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.dashboard.dto.DashboardActivityResponse;
import mg.rosii.management.dashboard.dto.DashboardResponse;
import mg.rosii.management.dashboard.dto.StatusCountResponse;
import mg.rosii.management.dashboard.dto.TypeCountResponse;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.demand.DemandType;
import mg.rosii.management.execution.ExecutionStatus;
import mg.rosii.management.proposal.ProposalExpiration;
import mg.rosii.management.proposal.ProposalService;
import mg.rosii.management.proposal.ProposalStatus;
import mg.rosii.management.proposal.dto.ProposalResponse;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the whole dashboard payload in one read-only transaction (Feature 35).
 *
 * <p>Before this feature the desktop application downloaded the five complete
 * lists and aggregated them itself. The aggregation now happens where the data
 * is, and it is deliberately split by the nature of each value:
 *
 * <ul>
 *   <li><strong>Raw counters</strong> (demands, payments, executions, closures)
 *       are single-pass SQL aggregates: their values are stored columns, so no
 *       business rule is involved.</li>
 *   <li><strong>Proposal statuses</strong> are counted per stored status and
 *       validity date, then the <em>real</em> expiration rule is applied to those
 *       stored values through {@link ProposalExpiration} — the very same
 *       predicate the proposal endpoints use. A stored {@code SENT} proposal
 *       past its validity is reported as {@code EXPIRED} and is never written to
 *       the database.</li>
 *   <li><strong>Financial indicators</strong> reuse
 *       {@link ProposalService#list} and its derived DTO values
 *       ({@code remainingAmount}, {@code depositReached}), because those are
 *       computed rules: rewriting them as SQL would create a second, silently
 *       divergent definition.</li>
 *   <li><strong>Recent activity</strong> is one bounded native union.</li>
 * </ul>
 *
 * <p>Every repository aggregate is called exactly once, so the number of
 * statements is fixed and never grows with the number of rows. Nothing is
 * recalculated on the client side afterwards: the desktop application only
 * formats what it receives here.
 */
@Service
public class DashboardService {

    /**
     * Number of events of the recent-activity timeline. It is the limit the
     * dashboard has always displayed, kept unchanged by Feature 35.
     */
    static final int ACTIVITY_LIMIT = 8;

    private final DashboardRepository dashboard;
    private final ProposalService proposals;

    public DashboardService(DashboardRepository dashboard, ProposalService proposals) {
        this.dashboard = dashboard;
        this.proposals = proposals;
    }

    /** The complete dashboard payload. */
    @Transactional(readOnly = true)
    public DashboardResponse summary() {
        LocalDate today = LocalDate.now();

        Demands demands = demands();
        Proposals proposalTotals = proposals(today);

        Object[] paymentRow = singleRow(dashboard.paymentAggregate());

        Map<ExecutionStatus, Long> executionCounts = statusCounts(dashboard.countExecutionsByStatus(),
                ExecutionStatus.class);
        Map<ClosureStatus, Long> closureCounts = statusCounts(dashboard.countClosuresByStatus(),
                ClosureStatus.class);

        return new DashboardResponse(
                demands.total(),
                demands.byStatus(),
                demands.byType(),
                proposalTotals.total(),
                proposalTotals.byStatus(),
                proposalTotals.accepted(),
                proposalTotals.pending(),
                toLong(paymentRow[0]),
                toBigDecimal(paymentRow[1]),
                proposalTotals.acceptedRemaining(),
                proposalTotals.acceptedWithoutDeposit(),
                totalOf(executionCounts),
                distribution(executionCounts, ExecutionStatus.values()),
                totalOf(closureCounts),
                distribution(closureCounts, ClosureStatus.values()),
                recentActivity());
    }

    // ----- demands -----

    private record Demands(long total,
            List<StatusCountResponse<DemandStatus>> byStatus,
            List<TypeCountResponse> byType) {
    }

    private Demands demands() {
        Map<DemandStatus, Long> byStatus = new EnumMap<>(DemandStatus.class);
        Map<DemandType, Long> byType = new EnumMap<>(DemandType.class);
        long total = 0;

        for (Object[] row : dashboard.countDemandsByStatusAndType()) {
            DemandStatus status = (DemandStatus) row[0];
            DemandType type = (DemandType) row[1];
            long count = toLong(row[2]);
            total += count;
            byStatus.merge(status, count, Long::sum);
            byType.merge(type, count, Long::sum);
        }

        // Only the types that really have a demand, decreasing count, then the
        // enum's declaration order on equal counts: the historical display order.
        List<TypeCountResponse> typeCounts = byType.entrySet().stream()
                .map(entry -> new TypeCountResponse(entry.getKey(), entry.getValue()))
                .sorted(Comparator.comparingLong(TypeCountResponse::count).reversed()
                        .thenComparingInt(item -> item.type().ordinal()))
                .toList();

        return new Demands(total, distribution(byStatus, DemandStatus.values()), typeCounts);
    }

    // ----- proposals -----

    private record Proposals(long total,
            List<StatusCountResponse<ProposalStatus>> byStatus,
            long accepted,
            long pending,
            BigDecimal acceptedRemaining,
            long acceptedWithoutDeposit) {
    }

    private Proposals proposals(LocalDate today) {
        Map<ProposalStatus, Long> byStatus = new EnumMap<>(ProposalStatus.class);
        long total = 0;

        for (Object[] row : dashboard.countProposalsByStatusAndValidity()) {
            ProposalStatus stored = (ProposalStatus) row[0];
            LocalDate validUntil = (LocalDate) row[1];
            long count = toLong(row[2]);
            // The stored row is never modified: only the reported status is.
            byStatus.merge(ProposalExpiration.effectiveStatus(stored, validUntil, today), count, Long::sum);
            total += count;
        }

        // Derived financial values come from the proposal service itself, so that
        // remainingAmount, its HALF_UP rounding and depositReached keep a single
        // definition in the codebase.
        List<ProposalResponse> accepted = proposals.list(null, null, null, ProposalStatus.ACCEPTED);
        BigDecimal remaining = BigDecimal.ZERO;
        long withoutDeposit = 0;
        for (ProposalResponse proposal : accepted) {
            remaining = remaining.add(proposal.remainingAmount());
            if (!proposal.depositReached()) {
                withoutDeposit++;
            }
        }

        return new Proposals(
                total,
                distribution(byStatus, ProposalStatus.values()),
                accepted.size(),
                byStatus.getOrDefault(ProposalStatus.SENT, 0L),
                remaining.setScale(2, RoundingMode.HALF_UP),
                withoutDeposit);
    }

    // ----- recent activity -----

    private List<DashboardActivityResponse> recentActivity() {
        List<DashboardActivityResponse> events = new ArrayList<>();
        for (Object[] row : dashboard.recentActivity(ACTIVITY_LIMIT)) {
            events.add(new DashboardActivityResponse(
                    DashboardActivityKind.valueOf((String) row[0]),
                    (UUID) row[1],
                    toOffsetDateTime(row[2]),
                    (String) row[3],
                    (String) row[4],
                    toNullableBigDecimal(row[5]),
                    toNullableLocalDate(row[6]),
                    row[7] == null ? null : ClosureStatus.valueOf((String) row[7])));
        }
        return events;
    }

    // ----- helpers -----

    /** The only row of a single-row aggregate. */
    private static Object[] singleRow(List<Object[]> rows) {
        return rows.isEmpty() ? new Object[] { 0L, BigDecimal.ZERO } : rows.get(0);
    }

    /** Groups a {@code [status, count]} result into a map. */
    private static <S extends Enum<S>> Map<S, Long> statusCounts(List<Object[]> rows, Class<S> type) {
        Map<S, Long> counts = new EnumMap<>(type);
        for (Object[] row : rows) {
            counts.merge(type.cast(row[0]), toLong(row[1]), Long::sum);
        }
        return counts;
    }

    /** Total of a status grouping. */
    private static long totalOf(Map<?, Long> counts) {
        return counts.values().stream().mapToLong(Long::longValue).sum();
    }

    /**
     * Every status of the enum, in its declaration order, zero counts included:
     * the dashboard always renders the full distribution.
     */
    private static <S extends Enum<S>> List<StatusCountResponse<S>> distribution(Map<S, Long> counts, S[] all) {
        List<StatusCountResponse<S>> result = new ArrayList<>(all.length);
        for (S status : all) {
            result.add(new StatusCountResponse<>(status, counts.getOrDefault(status, 0L)));
        }
        return result;
    }

    private static long toLong(Object value) {
        return value == null ? 0L : ((Number) value).longValue();
    }

    private static BigDecimal toBigDecimal(Object value) {
        return value == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : new BigDecimal(value.toString()).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal toNullableBigDecimal(Object value) {
        return value == null ? null : new BigDecimal(value.toString()).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Normalizes the instant of a native query row.
     *
     * <p>A native query is not mapped through the entity metamodel, so the JDBC
     * driver decides the Java type of a {@code timestamptz} column. Every accepted
     * form carries the same instant; converting them here keeps the JSON contract
     * stable whatever the driver returns.
     */
    private static OffsetDateTime toOffsetDateTime(Object value) {
        if (value instanceof OffsetDateTime offsetDateTime) {
            return offsetDateTime;
        }
        if (value instanceof Instant instant) {
            return instant.atOffset(ZoneOffset.UTC);
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant().atOffset(ZoneOffset.UTC);
        }
        throw new IllegalStateException("unexpected activity instant type: "
                + (value == null ? "null" : value.getClass().getName()));
    }

    /** Same normalization concern as {@link #toOffsetDateTime}, for a {@code date} column. */
    private static LocalDate toNullableLocalDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate localDate) {
            return localDate;
        }
        if (value instanceof java.sql.Date date) {
            return date.toLocalDate();
        }
        throw new IllegalStateException("unexpected activity date type: " + value.getClass().getName());
    }
}
