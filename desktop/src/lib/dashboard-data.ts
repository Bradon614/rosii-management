/**
 * Dashboard aggregation (Feature 26).
 *
 * Everything here is a pure aggregation of values already returned by the
 * existing APIs. No business rule is reimplemented: `depositReached`,
 * `remainingAmount` and every amount come from the backend DTOs; the dashboard
 * only counts and sums those values for display.
 *
 * Known backend limitation: there is no global preparation list endpoint, so
 * the number of active preparations cannot be obtained without one request per
 * proposal. It is deliberately not approximated here.
 */

import { round2 } from "@/lib/decimal";
import { formatAriary, formatDate } from "@/lib/format";
import { closureStatusLabels } from "@/lib/labels";
import type {
  ClosureStatus,
  Demand,
  DemandStatus,
  DemandType,
  Execution,
  ExecutionStatus,
  Payment,
  Proposal,
  ProposalStatus,
  ServiceClosure,
} from "@/types/api";

/** List endpoints used by the dashboard (one global request each). */
export const DASHBOARD_PATHS = {
  demands: "/api/demands",
  proposals: "/api/proposals",
  payments: "/api/payments",
  executions: "/api/executions",
  closures: "/api/closures",
} as const;

export const DEMAND_STATUS_ORDER: readonly DemandStatus[] = [
  "NEW",
  "IN_ANALYSIS",
  "PROPOSAL_IN_PREPARATION",
  "QUOTE_SENT",
  "ACCEPTED",
  "REFUSED",
  "ABANDONED",
];

export const PROPOSAL_STATUS_ORDER: readonly ProposalStatus[] = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REFUSED",
  "EXPIRED",
  "CANCELLED",
];

export const EXECUTION_STATUS_ORDER: readonly ExecutionStatus[] = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];

export const CLOSURE_STATUS_ORDER: readonly ClosureStatus[] = ["COMPLETED", "WITH_ISSUE"];

/** Demand types in the backend enum order (used only for tie-breaking). */
export const DEMAND_TYPE_ORDER: readonly DemandType[] = [
  "EVENT",
  "CATERING",
  "DECORATION",
  "FLORIST",
  "EQUIPMENT_RENTAL",
  "TRANSPORT",
  "CAR_RENTAL",
  "CONSTRUCTION",
  "REAL_ESTATE",
  "OTHER",
];

export interface StatusCount<S extends string> {
  status: S;
  count: number;
}

export interface TypeCount {
  type: DemandType;
  count: number;
}

export interface DashboardSourceData {
  demands: Demand[];
  proposals: Proposal[];
  payments: Payment[];
  executions: Execution[];
  closures: ServiceClosure[];
}

export interface DashboardSummary {
  demandsTotal: number;
  demandsByStatus: StatusCount<DemandStatus>[];
  demandsByType: TypeCount[];
  proposalsTotal: number;
  proposalsByStatus: StatusCount<ProposalStatus>[];
  acceptedProposals: number;
  pendingProposals: number;
  paymentsTotal: number;
  paymentsCount: number;
  acceptedRemaining: number;
  acceptedWithoutDeposit: number;
  executionsTotal: number;
  executionsByStatus: StatusCount<ExecutionStatus>[];
  closuresTotal: number;
  closuresByStatus: StatusCount<ClosureStatus>[];
}

export type DashboardActivityKind =
  | "demand_created"
  | "proposal_created"
  | "proposal_accepted"
  | "payment_recorded"
  | "execution_completed"
  | "closure_closed";

export interface DashboardActivity {
  id: string;
  kind: DashboardActivityKind;
  title: string;
  /** Real reference: client name, proposal number, amount, date or status. */
  reference: string | null;
  /** ISO instant of the real event. */
  date: string;
  href: string;
}

function countStatuses<S extends string>(
  items: readonly { status: S }[],
  order: readonly S[],
): StatusCount<S>[] {
  const counts = new Map<S, number>();
  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }
  return order.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

function countDemandTypes(demands: readonly Demand[]): TypeCount[] {
  const counts = new Map<DemandType, number>();
  for (const demand of demands) {
    counts.set(demand.type, (counts.get(demand.type) ?? 0) + 1);
  }
  const typeIndex = new Map(DEMAND_TYPE_ORDER.map((type, index) => [type, index]));
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort(
      (a, b) =>
        b.count - a.count ||
        (typeIndex.get(a.type) ?? 0) - (typeIndex.get(b.type) ?? 0),
    );
}

/** Simple sum of the payment amounts returned by the API, rounded for display. */
export function paymentsTotal(payments: readonly Payment[]): number {
  return round2(payments.reduce((total, payment) => total + payment.amount, 0));
}

/** Sum of the backend-derived remaining amounts, restricted to ACCEPTED proposals. */
export function acceptedRemaining(proposals: readonly Proposal[]): number {
  return round2(
    proposals
      .filter((proposal) => proposal.status === "ACCEPTED")
      .reduce((total, proposal) => total + proposal.remainingAmount, 0),
  );
}

/** ACCEPTED proposals for which the backend's derived deposit flag is false. */
export function acceptedWithoutDeposit(proposals: readonly Proposal[]): number {
  return proposals.filter(
    (proposal) => proposal.status === "ACCEPTED" && !proposal.depositReached,
  ).length;
}

export function summarizeDashboard(data: DashboardSourceData): DashboardSummary {
  return {
    demandsTotal: data.demands.length,
    demandsByStatus: countStatuses(data.demands, DEMAND_STATUS_ORDER),
    demandsByType: countDemandTypes(data.demands),
    proposalsTotal: data.proposals.length,
    proposalsByStatus: countStatuses(data.proposals, PROPOSAL_STATUS_ORDER),
    acceptedProposals: data.proposals.filter((proposal) => proposal.status === "ACCEPTED")
      .length,
    // "Pending response" is exactly the existing SENT status: no other status is
    // merged into it and no new business definition is introduced.
    pendingProposals: data.proposals.filter((proposal) => proposal.status === "SENT").length,
    paymentsTotal: paymentsTotal(data.payments),
    paymentsCount: data.payments.length,
    acceptedRemaining: acceptedRemaining(data.proposals),
    acceptedWithoutDeposit: acceptedWithoutDeposit(data.proposals),
    executionsTotal: data.executions.length,
    executionsByStatus: countStatuses(data.executions, EXECUTION_STATUS_ORDER),
    closuresTotal: data.closures.length,
    closuresByStatus: countStatuses(data.closures, CLOSURE_STATUS_ORDER),
  };
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

/**
 * Chronology built only from real timestamps exposed by the APIs. Events whose
 * date is absent are skipped; nothing is inferred from another field.
 */
export function buildRecentActivity(
  data: DashboardSourceData,
  limit = 8,
): DashboardActivity[] {
  const events: DashboardActivity[] = [];

  for (const demand of data.demands) {
    events.push({
      id: `demand-created-${demand.id}`,
      kind: "demand_created",
      title: "Demande créée",
      reference: demand.clientName,
      date: demand.createdAt,
      href: `/demandes/${demand.id}`,
    });
  }

  for (const proposal of data.proposals) {
    events.push({
      id: `proposal-created-${proposal.id}`,
      kind: "proposal_created",
      title: "Proposition créée",
      reference: proposal.number,
      date: proposal.createdAt,
      href: `/propositions/${proposal.id}`,
    });
    if (proposal.acceptedAt) {
      events.push({
        id: `proposal-accepted-${proposal.id}`,
        kind: "proposal_accepted",
        title: "Proposition acceptée",
        reference: proposal.number,
        date: proposal.acceptedAt,
        href: `/propositions/${proposal.id}`,
      });
    }
  }

  for (const payment of data.payments) {
    events.push({
      id: `payment-recorded-${payment.id}`,
      kind: "payment_recorded",
      title: "Paiement enregistré",
      reference: `${payment.proposalNumber} · ${formatAriary(payment.amount)}`,
      date: payment.createdAt,
      href: `/paiements/${payment.id}`,
    });
  }

  for (const execution of data.executions) {
    if (execution.completedAt) {
      events.push({
        id: `execution-completed-${execution.id}`,
        kind: "execution_completed",
        title: "Exécution terminée",
        reference: execution.scheduledDate
          ? `Prestation du ${formatDate(execution.scheduledDate)}`
          : `Exécution ${shortId(execution.id)}`,
        date: execution.completedAt,
        href: `/executions/${execution.id}`,
      });
    }
  }

  for (const closure of data.closures) {
    if (closure.closedAt) {
      events.push({
        id: `closure-closed-${closure.id}`,
        kind: "closure_closed",
        title: "Service clôturé",
        reference: `${closureStatusLabels[closure.status]} · ${shortId(closure.id)}`,
        date: closure.closedAt,
        href: `/closures/${closure.id}`,
      });
    }
  }

  return events
    .filter((event) => !Number.isNaN(Date.parse(event.date)))
    .sort((a, b) => {
      const byDate = Date.parse(b.date) - Date.parse(a.date);
      return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}
