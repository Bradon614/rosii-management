import { describe, expect, it } from "vitest";

import {
  acceptedRemaining,
  acceptedWithoutDeposit,
  buildRecentActivity,
  paymentsTotal,
  summarizeDashboard,
  type DashboardSourceData,
} from "@/lib/dashboard-data";
import {
  buildClosure,
  buildDemand,
  buildExecution,
  buildPayment,
  buildProposal,
} from "@/test/fixtures";

const SECOND_ID = "11111111-1111-1111-1111-111111111112";
const THIRD_ID = "11111111-1111-1111-1111-111111111113";

function emptyData(): DashboardSourceData {
  return { demands: [], proposals: [], payments: [], executions: [], closures: [] };
}

describe("summarizeDashboard — valeurs exposées par l'API", () => {
  it("counts demands by status and by type without inventing categories", () => {
    const summary = summarizeDashboard({
      ...emptyData(),
      demands: [
        buildDemand(),
        buildDemand({ id: SECOND_ID, type: "CATERING", status: "NEW" }),
        buildDemand({ id: THIRD_ID, type: "EVENT", status: "NEW" }),
      ],
    });

    expect(summary.demandsTotal).toBe(3);
    expect(summary.demandsByStatus).toHaveLength(7);
    expect(summary.demandsByStatus.find((item) => item.status === "NEW")?.count).toBe(2);
    expect(summary.demandsByStatus.find((item) => item.status === "ACCEPTED")?.count).toBe(1);
    expect(summary.demandsByStatus.find((item) => item.status === "REFUSED")?.count).toBe(0);
    expect(summary.demandsByType).toEqual([
      { type: "EVENT", count: 2 },
      { type: "CATERING", count: 1 },
    ]);
  });

  it("counts proposals, accepted proposals and SENT-only pending proposals", () => {
    const summary = summarizeDashboard({
      ...emptyData(),
      proposals: [
        buildProposal(),
        buildProposal({
          id: SECOND_ID,
          status: "SENT",
          acceptedAt: null,
          remainingAmount: 100000,
          depositReached: false,
        }),
        buildProposal({
          id: THIRD_ID,
          status: "ACCEPTED",
          remainingAmount: 50000,
          depositReached: false,
        }),
      ],
    });

    expect(summary.proposalsTotal).toBe(3);
    expect(summary.proposalsByStatus.find((item) => item.status === "SENT")?.count).toBe(1);
    expect(summary.proposalsByStatus.find((item) => item.status === "ACCEPTED")?.count).toBe(2);
    expect(summary.acceptedProposals).toBe(2);
    expect(summary.pendingProposals).toBe(1);
  });

  it("sums the recorded payment amounts and counts the payments", () => {
    expect(
      paymentsTotal([buildPayment(), buildPayment({ id: SECOND_ID, amount: 50000 })]),
    ).toBe(200000);
    expect(paymentsTotal([])).toBe(0);
  });

  it("sums only the backend remainingAmount of ACCEPTED proposals", () => {
    expect(
      acceptedRemaining([
        buildProposal(),
        buildProposal({ id: SECOND_ID, status: "ACCEPTED", remainingAmount: 50000 }),
        buildProposal({ id: THIRD_ID, status: "SENT", remainingAmount: 100000 }),
      ]),
    ).toBe(400000);
  });

  it("counts only ACCEPTED proposals whose backend depositReached is false", () => {
    expect(
      acceptedWithoutDeposit([
        buildProposal(),
        buildProposal({ id: SECOND_ID, status: "ACCEPTED", depositReached: false }),
        buildProposal({ id: THIRD_ID, status: "SENT", depositReached: false }),
      ]),
    ).toBe(1);
  });

  it("counts executions and closures by their real statuses", () => {
    const summary = summarizeDashboard({
      ...emptyData(),
      executions: [
        buildExecution({ id: SECOND_ID, status: "PLANNED" }),
        buildExecution({ id: THIRD_ID, status: "IN_PROGRESS" }),
        buildExecution({ status: "COMPLETED" }),
        buildExecution({ id: "88888888-8888-8888-8888-888888888889", status: "CANCELLED" }),
      ],
      closures: [
        buildClosure(),
        buildClosure({ id: "99999999-9999-9999-9999-999999999998", status: "WITH_ISSUE" }),
      ],
    });

    expect(summary.executionsTotal).toBe(4);
    expect(summary.executionsByStatus).toEqual([
      { status: "PLANNED", count: 1 },
      { status: "IN_PROGRESS", count: 1 },
      { status: "COMPLETED", count: 1 },
      { status: "CANCELLED", count: 1 },
    ]);
    expect(summary.closuresTotal).toBe(2);
    expect(summary.closuresByStatus).toEqual([
      { status: "COMPLETED", count: 1 },
      { status: "WITH_ISSUE", count: 1 },
    ]);
  });

  it("returns zeros and empty activity when no data exists", () => {
    const summary = summarizeDashboard(emptyData());

    expect(summary.demandsTotal).toBe(0);
    expect(summary.proposalsTotal).toBe(0);
    expect(summary.paymentsTotal).toBe(0);
    expect(summary.paymentsCount).toBe(0);
    expect(summary.acceptedRemaining).toBe(0);
    expect(summary.acceptedWithoutDeposit).toBe(0);
    expect(summary.executionsTotal).toBe(0);
    expect(summary.closuresTotal).toBe(0);
    expect(buildRecentActivity(emptyData())).toEqual([]);
  });
});

describe("buildRecentActivity — chronologie réelle uniquement", () => {
  it("builds real events from the exposed timestamps and sorts them newest first", () => {
    const activities = buildRecentActivity({
      demands: [buildDemand()],
      proposals: [buildProposal()],
      payments: [buildPayment()],
      executions: [buildExecution()],
      closures: [buildClosure()],
    });

    expect(activities.map((activity) => activity.title)).toEqual([
      "Service clôturé",
      "Exécution terminée",
      "Paiement enregistré",
      "Proposition acceptée",
      "Proposition créée",
      "Demande créée",
    ]);
    expect(activities[0].href).toMatch(/^\/closures\//);
    expect(activities[1].href).toMatch(/^\/executions\//);
    expect(activities[2].href).toMatch(/^\/paiements\//);
    expect(activities[5].reference).toBe("Alice Rakoto");
  });

  it("honours the limit and keeps the most recent events", () => {
    const activities = buildRecentActivity(
      {
        demands: [buildDemand()],
        proposals: [buildProposal()],
        payments: [buildPayment()],
        executions: [buildExecution()],
        closures: [buildClosure()],
      },
      2,
    );

    expect(activities).toHaveLength(2);
    expect(activities[0].title).toBe("Service clôturé");
    expect(activities[1].title).toBe("Exécution terminée");
  });

  it("skips events whose real date is absent", () => {
    const activities = buildRecentActivity({
      demands: [],
      proposals: [],
      payments: [],
      executions: [buildExecution({ completedAt: null })],
      closures: [buildClosure({ closedAt: null })],
    });

    expect(activities).toEqual([]);
  });

  it("never invents a preparation event", () => {
    const activities = buildRecentActivity({
      demands: [],
      proposals: [],
      payments: [],
      executions: [],
      closures: [],
    });

    expect(activities.some((activity) => activity.kind.includes("preparation"))).toBe(false);
  });
});
