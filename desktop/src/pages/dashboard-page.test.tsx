import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { normalizeSpaces } from "@/test/fixtures";
import {
  CLOSURE_ID,
  DEMAND_ID,
  EXECUTION_ID,
  PAYMENT_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";
import type { Dashboard, DashboardActivityResponse } from "@/types/api";

const SECOND_PAYMENT_ID = "44444444-4444-4444-4444-444444444445";
const SECOND_CLOSURE_ID = "99999999-9999-9999-9999-999999999998";
const PROPERTY_ID = "11111111-1111-1111-1111-111111111111";

/**
 * The eight events the backend returns, newest first, covering all the kinds the
 * dashboard displays.
 */
const ACTIVITY: DashboardActivityResponse[] = [
  {
    kind: "payment_recorded",
    id: PAYMENT_ID,
    date: "2026-12-20T10:00:00Z",
    clientName: null,
    proposalNumber: "PROP-2026-0001",
    amount: 150000,
    scheduledDate: null,
    closureStatus: null,
  },
  {
    kind: "proposal_accepted",
    id: PROPERTY_ID,
    date: "2026-12-19T10:00:00Z",
    clientName: null,
    proposalNumber: "PROP-2026-0001",
    amount: null,
    scheduledDate: null,
    closureStatus: null,
  },
  {
    kind: "closure_closed",
    id: CLOSURE_ID,
    date: "2026-12-18T10:00:00Z",
    clientName: null,
    proposalNumber: null,
    amount: null,
    scheduledDate: null,
    closureStatus: "COMPLETED",
  },
  {
    kind: "payment_recorded",
    id: SECOND_PAYMENT_ID,
    date: "2026-12-17T10:00:00Z",
    clientName: null,
    proposalNumber: "PROP-2026-0002",
    amount: 50000,
    scheduledDate: null,
    closureStatus: null,
  },
  {
    kind: "execution_completed",
    id: EXECUTION_ID,
    date: "2026-12-16T10:00:00Z",
    clientName: null,
    proposalNumber: null,
    amount: null,
    scheduledDate: "2026-12-20",
    closureStatus: null,
  },
  {
    kind: "closure_closed",
    id: SECOND_CLOSURE_ID,
    date: "2026-12-15T10:00:00Z",
    clientName: null,
    proposalNumber: null,
    amount: null,
    scheduledDate: null,
    closureStatus: "WITH_ISSUE",
  },
  {
    kind: "proposal_created",
    id: PROPERTY_ID,
    date: "2026-12-14T10:00:00Z",
    clientName: null,
    proposalNumber: "PROP-2026-0001",
    amount: null,
    scheduledDate: null,
    closureStatus: null,
  },
  {
    kind: "demand_created",
    id: DEMAND_ID,
    date: "2026-12-13T10:00:00Z",
    clientName: "Alice Rakoto",
    proposalNumber: null,
    amount: null,
    scheduledDate: null,
    closureStatus: null,
  },
];

/** The aggregated payload of `GET /api/dashboard`, with the five KPIs' values. */
const DASHBOARD: Dashboard = {
  demandsTotal: 3,
  demandsByStatus: [
    { status: "NEW", count: 2 },
    { status: "IN_ANALYSIS", count: 0 },
    { status: "PROPOSAL_IN_PREPARATION", count: 0 },
    { status: "QUOTE_SENT", count: 0 },
    { status: "ACCEPTED", count: 1 },
    { status: "REFUSED", count: 0 },
    { status: "ABANDONED", count: 0 },
  ],
  demandsByType: [
    { type: "EVENT", count: 2 },
    { type: "CATERING", count: 1 },
  ],
  proposalsTotal: 3,
  proposalsByStatus: [
    { status: "DRAFT", count: 0 },
    { status: "SENT", count: 1 },
    { status: "ACCEPTED", count: 2 },
    { status: "REFUSED", count: 0 },
    { status: "EXPIRED", count: 0 },
    { status: "CANCELLED", count: 0 },
  ],
  acceptedProposals: 2,
  pendingProposals: 1,
  paymentsCount: 2,
  paymentsTotal: 200000,
  acceptedRemaining: 400000,
  acceptedWithoutDeposit: 1,
  executionsTotal: 4,
  executionsByStatus: [
    { status: "PLANNED", count: 1 },
    { status: "IN_PROGRESS", count: 1 },
    { status: "COMPLETED", count: 1 },
    { status: "CANCELLED", count: 1 },
  ],
  closuresTotal: 2,
  closuresByStatus: [
    { status: "COMPLETED", count: 1 },
    { status: "WITH_ISSUE", count: 1 },
  ],
  recentActivity: ACTIVITY,
};

/** Every list endpoint the dashboard must not call any more. */
const LIST_PATHS = [
  "/api/demands",
  "/api/proposals",
  "/api/payments",
  "/api/executions",
  "/api/closures",
];

function routes(overrides: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    "GET /api/dashboard": () => ({ body: DASHBOARD }),
    ...overrides,
  };
}

async function openDashboard(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Tableau de bord" });
}

/** An empty dashboard: every counter at zero, no event. */
function emptyDashboard(): Dashboard {
  return {
    ...DASHBOARD,
    demandsTotal: 0,
    demandsByStatus: DASHBOARD.demandsByStatus.map((item) => ({ ...item, count: 0 })),
    demandsByType: [],
    proposalsTotal: 0,
    proposalsByStatus: DASHBOARD.proposalsByStatus.map((item) => ({ ...item, count: 0 })),
    acceptedProposals: 0,
    pendingProposals: 0,
    paymentsCount: 0,
    paymentsTotal: 0,
    acceptedRemaining: 0,
    acceptedWithoutDeposit: 0,
    executionsTotal: 0,
    executionsByStatus: DASHBOARD.executionsByStatus.map((item) => ({ ...item, count: 0 })),
    closuresTotal: 0,
    closuresByStatus: DASHBOARD.closuresByStatus.map((item) => ({ ...item, count: 0 })),
    recentActivity: [],
  };
}

describe("DashboardPage — un seul chargement agrégé (F35)", () => {
  it("reads GET /api/dashboard and none of the five list endpoints", async () => {
    const { mock } = renderApp("/dashboard", routes());

    await openDashboard();
    await screen.findByTestId("kpi-demands");

    expect(mock.calls.filter((call) => call.url === "/api/dashboard")).toHaveLength(1);
    expect(mock.calls.filter((call) => LIST_PATHS.includes(call.url))).toEqual([]);
  });

  it("displays the real totals and financial aggregates from the API", async () => {
    renderApp("/dashboard", routes());

    await openDashboard();

    expect(await screen.findByTestId("kpi-demands")).toHaveTextContent("3");
    expect(screen.getByTestId("kpi-proposals")).toHaveTextContent("3");
    expect(
      normalizeSpaces(screen.getByTestId("kpi-payments").textContent),
    ).toBe("200 000 Ar");
    expect(
      normalizeSpaces(screen.getByTestId("kpi-remaining").textContent),
    ).toBe("400 000 Ar");
    expect(screen.getByTestId("kpi-executions")).toHaveTextContent("4");
    expect(screen.getByTestId("kpi-closures")).toHaveTextContent("2");
    expect(screen.getByTestId("kpi-deposit")).toHaveTextContent("1");

    expect(screen.getByText(/2 acceptées · 1 en attente/)).toBeInTheDocument();
    expect(screen.getByText(/2 paiements enregistrés/)).toBeInTheDocument();
    expect(screen.getByText(/1 planifiée · 1 en cours · 1 terminée/)).toBeInTheDocument();
    expect(screen.getByText(/1 avec réserve/)).toBeInTheDocument();
  });

  it("renders the status and type distributions, zero counts included", async () => {
    renderApp("/dashboard", routes());

    await openDashboard();

    const demandStatuses = await screen.findByRole("list", { name: "Demandes par statut" });
    expect(demandStatuses).toHaveTextContent(/Nouvelle\s*2/);
    expect(demandStatuses).toHaveTextContent(/Acceptée\s*1/);
    expect(demandStatuses).toHaveTextContent(/Refusée\s*0/);

    const proposalStatuses = screen.getByRole("list", { name: "Propositions par statut" });
    expect(proposalStatuses).toHaveTextContent(/Acceptée\s*2/);
    expect(proposalStatuses).toHaveTextContent(/Envoyée\s*1/);

    const executionStatuses = screen.getByRole("list", { name: "Exécutions par statut" });
    expect(executionStatuses).toHaveTextContent(/Planifiée\s*1/);
    expect(executionStatuses).toHaveTextContent(/En cours\s*1/);
    expect(executionStatuses).toHaveTextContent(/Terminée\s*1/);

    const closureStatuses = screen.getByRole("list", { name: "Clôtures par statut" });
    expect(closureStatuses).toHaveTextContent(/Clôturée avec réserve\s*1/);

    const demandTypes = screen.getByRole("list", { name: "Demandes par type" });
    expect(demandTypes).toHaveTextContent(/Événement\s*2/);
    expect(demandTypes).toHaveTextContent(/Traiteur\s*1/);
  });

  it("builds the recent activity from the aggregated timeline", async () => {
    renderApp("/dashboard", routes());

    await openDashboard();

    expect(await screen.findAllByText("Paiement enregistré")).toHaveLength(2);
    expect(screen.getByText("Exécution terminée")).toBeInTheDocument();
    expect(screen.getAllByText("Service clôturé")).toHaveLength(2);
    expect(screen.getAllByText("Proposition acceptée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Demande créée")).toHaveLength(1);

    const paymentActivities = screen
      .getAllByText("Paiement enregistré")
      .map((element) => element.closest("a"))
      .filter((element): element is HTMLAnchorElement => element !== null);
    expect(
      paymentActivities.some(
        (activity) => activity.getAttribute("href") === `/paiements/${PAYMENT_ID}`,
      ),
    ).toBe(true);
  });

  it("keeps the timeline ordered newest first", async () => {
    renderApp("/dashboard", routes());

    await openDashboard();

    const timeline = await screen.findByRole("list", { name: "Activité récente" });
    const titles = within(timeline)
      .getAllByRole("link")
      .map((link) => link.textContent ?? "");

    expect(titles[0]).toContain("Paiement enregistré");
    expect(titles[titles.length - 1]).toContain("Demande créée");
  });

  it("links the KPI cards and quick access to the existing sections", async () => {
    renderApp("/dashboard", routes());

    await openDashboard();
    await screen.findByTestId("kpi-demands");

    expect(screen.getByTestId("kpi-demands").closest("a")).toHaveAttribute(
      "href",
      "/demandes",
    );
    expect(screen.getByTestId("kpi-proposals").closest("a")).toHaveAttribute(
      "href",
      "/propositions",
    );
    expect(screen.getByTestId("kpi-payments").closest("a")).toHaveAttribute(
      "href",
      "/paiements",
    );
    expect(screen.getByTestId("kpi-remaining").closest("a")).toHaveAttribute(
      "href",
      "/propositions",
    );
    expect(screen.getByTestId("kpi-executions").closest("a")).toHaveAttribute(
      "href",
      "/executions",
    );
    expect(screen.getByTestId("kpi-closures").closest("a")).toHaveAttribute(
      "href",
      "/closures",
    );

    const quickAccess = screen.getByText("Accès rapides").closest('[data-slot="card"]');
    expect(quickAccess).not.toBeNull();
    expect(
      within(quickAccess as HTMLElement).getByRole("link", { name: "Demandes" }),
    ).toHaveAttribute("href", "/demandes");
    expect(
      within(quickAccess as HTMLElement).getByRole("link", { name: "Clôtures" }),
    ).toHaveAttribute("href", "/closures");
  });
});

describe("DashboardPage — chargement, erreurs et vide", () => {
  it("shows a loading skeleton while the aggregate is being read", async () => {
    let resolveRead: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolveRead = resolve;
    });

    renderApp(
      "/dashboard",
      routes({ "GET /api/dashboard": () => pending }),
    );

    await openDashboard();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRead?.({ body: emptyDashboard() });
    expect(await screen.findByText("Aucune activité enregistrée")).toBeInTheDocument();
  });

  it("shows an explicit error without fake amounts and retries", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp(
      "/dashboard",
      routes({
        "GET /api/dashboard": () => {
          attempts += 1;
          return attempts === 1
            ? { status: 500, body: { error: "boom" } }
            : { body: DASHBOARD };
        },
      }),
    );

    await openDashboard();

    expect(await screen.findByText("Tableau de bord indisponible")).toBeInTheDocument();
    expect(screen.queryByTestId("kpi-payments")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByTestId("kpi-payments")).toHaveTextContent("200 000 Ar");
  });

  it("shows the empty state when every section is empty", async () => {
    renderApp("/dashboard", routes({ "GET /api/dashboard": () => ({ body: emptyDashboard() }) }));

    await openDashboard();

    expect(await screen.findByText("Aucune activité enregistrée")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-demands")).toHaveTextContent("0");
    expect(screen.getByTestId("kpi-payments")).toHaveTextContent("0 Ar");
    expect(screen.queryByText("Demandes par statut")).not.toBeInTheDocument();
    expect(screen.getByText("Accès rapides")).toBeInTheDocument();
  });

  it("reloads the aggregate on demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/dashboard", routes());

    await openDashboard();
    await screen.findByTestId("kpi-demands");
    const count = () => mock.calls.filter((call) => call.url === "/api/dashboard").length;
    const before = count();

    await user.click(screen.getByRole("button", { name: "Actualiser" }));

    await waitFor(() => expect(count()).toBeGreaterThan(before));
    expect(mock.calls.filter((call) => LIST_PATHS.includes(call.url))).toEqual([]);
  });

  it("ends the session on 401", async () => {
    renderApp("/dashboard", {
      "GET /api/dashboard": () => ({ status: 401 }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("DashboardPage — accueil", () => {
  it("is the default page after authentication", async () => {
    renderApp("/", routes());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tableau de bord" }),
    ).toBeInTheDocument();
  });
});
