package mg.rosii.management.dashboard.dto;

import java.math.BigDecimal;
import java.util.List;

import mg.rosii.management.closure.ClosureStatus;
import mg.rosii.management.demand.DemandStatus;
import mg.rosii.management.execution.ExecutionStatus;
import mg.rosii.management.proposal.ProposalStatus;

/**
 * Everything the dashboard displays, aggregated by the backend in one request
 * (Feature 35).
 *
 * <p>Each value is exactly the one the desktop application used to derive from
 * the five complete lists. No rule is re-invented here:
 * <ul>
 *   <li>the proposal distribution reports the <em>effective</em> status, so a
 *       stored {@code SENT} proposal past its validity counts as
 *       {@code EXPIRED} ({@link mg.rosii.management.proposal.ProposalExpiration});</li>
 *   <li>{@code acceptedRemaining} and {@code acceptedWithoutDeposit} come from
 *       the proposal service's own derived DTO values, never from a second
 *       financial formula;</li>
 *   <li>soft-deleted rows of every table are excluded.</li>
 * </ul>
 *
 * <p>Status distributions always list every status of their enum, in the enum's
 * declaration order, including the zero counts. {@code demandsByType} only lists
 * the types that have at least one demand, ordered by decreasing count.
 *
 * @param demandsTotal           active demands
 * @param demandsByStatus        active demands per status, zero counts included
 * @param demandsByType          active demands per type, decreasing count
 * @param proposalsTotal         active proposals, whatever their status
 * @param proposalsByStatus      active proposals per effective status
 * @param acceptedProposals      active proposals in {@code ACCEPTED}
 * @param pendingProposals       active proposals still in {@code SENT} (past
 *                               validity ones are reported as {@code EXPIRED})
 * @param paymentsCount          active payments
 * @param paymentsTotal          sum of the active payment amounts
 * @param acceptedRemaining      sum of the derived remaining amount of the
 *                               accepted proposals
 * @param acceptedWithoutDeposit accepted proposals whose derived deposit flag is
 *                               false
 * @param executionsTotal        active executions
 * @param executionsByStatus     active executions per status, zero counts included
 * @param closuresTotal          active closures
 * @param closuresByStatus       active closures per status, zero counts included
 * @param recentActivity         the most recent real events, newest first,
 *                               bounded by the dashboard's own limit
 */
public record DashboardResponse(
        long demandsTotal,
        List<StatusCountResponse<DemandStatus>> demandsByStatus,
        List<TypeCountResponse> demandsByType,
        long proposalsTotal,
        List<StatusCountResponse<ProposalStatus>> proposalsByStatus,
        long acceptedProposals,
        long pendingProposals,
        long paymentsCount,
        BigDecimal paymentsTotal,
        BigDecimal acceptedRemaining,
        long acceptedWithoutDeposit,
        long executionsTotal,
        List<StatusCountResponse<ExecutionStatus>> executionsByStatus,
        long closuresTotal,
        List<StatusCountResponse<ClosureStatus>> closuresByStatus,
        List<DashboardActivityResponse> recentActivity) {
}
