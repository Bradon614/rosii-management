import { describe, expect, it } from "vitest";

import { ACTIVITY_LIMIT, buildRecentActivity } from "@/lib/dashboard-data";
import { normalizeSpaces } from "@/test/fixtures";
import type {
  DashboardActivityKind,
  DashboardActivityResponse,
} from "@/types/api";

const FIRST_ID = "11111111-1111-1111-1111-111111111111";
const SECOND_ID = "22222222-2222-2222-2222-222222222222";
const THIRD_ID = "33333333-3333-3333-3333-333333333333";

/** One `DashboardActivityResponse` as the backend sends it. */
function event(
  kind: DashboardActivityKind,
  date: string,
  overrides: Partial<DashboardActivityResponse> = {},
): DashboardActivityResponse {
  return {
    kind,
    id: FIRST_ID,
    date,
    clientName: null,
    proposalNumber: null,
    amount: null,
    scheduledDate: null,
    closureStatus: null,
    ...overrides,
  };
}

describe("buildRecentActivity — rendu des événements réels du backend", () => {
  it("renders each of the six kinds with its own title, reference and link", () => {
    const activities = buildRecentActivity([
      event("closure_closed", "2026-12-25T10:00:00Z", {
        id: FIRST_ID,
        closureStatus: "WITH_ISSUE",
      }),
      event("execution_completed", "2026-12-24T10:00:00Z", {
        id: SECOND_ID,
        scheduledDate: "2026-12-20",
      }),
      event("payment_recorded", "2026-12-23T10:00:00Z", {
        id: THIRD_ID,
        proposalNumber: "PROP-2026-0001",
        amount: 150000,
      }),
      event("proposal_accepted", "2026-12-22T10:00:00Z", {
        proposalNumber: "PROP-2026-0001",
      }),
      event("proposal_created", "2026-12-21T10:00:00Z", {
        proposalNumber: "PROP-2026-0001",
      }),
      event("demand_created", "2026-12-20T10:00:00Z", { clientName: "Alice Rakoto" }),
    ]);

    expect(activities.map((activity) => activity.title)).toEqual([
      "Service clôturé",
      "Exécution terminée",
      "Paiement enregistré",
      "Proposition acceptée",
      "Proposition créée",
      "Demande créée",
    ]);

    expect(activities[0].href).toBe(`/closures/${FIRST_ID}`);
    expect(activities[1].href).toBe(`/executions/${SECOND_ID}`);
    expect(activities[2].href).toBe(`/paiements/${THIRD_ID}`);
    expect(activities[5].href).toBe(`/demandes/${FIRST_ID}`);

    // Real references only: status label + short id, planned date, amount,
    // proposal number, client name.
    expect(activities[0].reference).toContain("Clôturée avec réserve");
    expect(activities[1].reference).toContain("Prestation du");
    expect(normalizeSpaces(activities[2].reference)).toContain("150 000 Ar");
    expect(activities[3].reference).toBe("PROP-2026-0001");
    expect(activities[4].reference).toBe("PROP-2026-0001");
    expect(activities[5].reference).toBe("Alice Rakoto");
  });

  it("falls back to the short id when a completed execution has no planned date", () => {
    const activities = buildRecentActivity([
      event("execution_completed", "2026-12-24T10:00:00Z", { scheduledDate: null }),
    ]);

    expect(activities[0].reference).toContain("11111111...");
  });

  it("sorts newest first, whatever order the backend used", () => {
    const activities = buildRecentActivity([
      event("demand_created", "2026-12-20T10:00:00Z", { clientName: "Ancienne" }),
      event("payment_recorded", "2026-12-24T10:00:00Z", { amount: 1000 }),
    ]);

    expect(activities.map((activity) => activity.kind)).toEqual([
      "payment_recorded",
      "demand_created",
    ]);
  });

  it("breaks identical dates by identifier, ascending", () => {
    const sameInstant = "2026-12-20T10:00:00Z";
    const activities = buildRecentActivity([
      event("demand_created", sameInstant, { id: THIRD_ID, clientName: "Troisième" }),
      event("demand_created", sameInstant, { id: FIRST_ID, clientName: "Première" }),
      event("demand_created", sameInstant, { id: SECOND_ID, clientName: "Deuxième" }),
    ]);

    expect(activities.map((activity) => activity.id)).toEqual([
      `demand-created-${FIRST_ID}`,
      `demand-created-${SECOND_ID}`,
      `demand-created-${THIRD_ID}`,
    ]);
  });

  it("never displays more events than the timeline limit", () => {
    const many = Array.from({ length: ACTIVITY_LIMIT + 4 }, (_, index) =>
      event("payment_recorded", `2026-12-${String(20 + index).padStart(2, "0")}T10:00:00Z`, {
        id: `${String(index).repeat(8)}-1111-1111-1111-111111111111`,
        amount: 1000,
      }),
    );

    const activities = buildRecentActivity(many);

    expect(activities).toHaveLength(ACTIVITY_LIMIT);
    // The most recent ones are kept.
    expect(activities[0].date).toBe("2026-12-31T10:00:00Z");
  });

  it("skips events whose date cannot be read", () => {
    const activities = buildRecentActivity([
      event("payment_recorded", "not-a-date", { amount: 1000 }),
      event("demand_created", "2026-12-20T10:00:00Z", { clientName: "Alice Rakoto" }),
    ]);

    expect(activities).toHaveLength(1);
    expect(activities[0].kind).toBe("demand_created");
  });

  it("renders nothing when the backend has no event to report", () => {
    expect(buildRecentActivity([])).toEqual([]);
  });

  it("never invents a preparation event", () => {
    const activities = buildRecentActivity([
      event("demand_created", "2026-12-20T10:00:00Z"),
      event("proposal_created", "2026-12-21T10:00:00Z"),
      event("proposal_accepted", "2026-12-22T10:00:00Z"),
      event("payment_recorded", "2026-12-23T10:00:00Z"),
      event("execution_completed", "2026-12-24T10:00:00Z"),
      event("closure_closed", "2026-12-25T10:00:00Z"),
    ]);

    expect(activities.some((activity) => activity.kind.includes("preparation"))).toBe(false);
  });
});
