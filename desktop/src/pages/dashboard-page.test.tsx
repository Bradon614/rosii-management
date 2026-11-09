import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { normalizeSpaces } from "@/test/fixtures";
import {
  buildClosure,
  buildDemand,
  buildExecution,
  buildPayment,
  buildProposal,
  CLOSURE_ID,
  DEMAND_ID,
  EXECUTION_ID,
  PAYMENT_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";

const SECOND_DEMAND_ID = "33333333-3333-3333-3333-333333333332";
const THIRD_DEMAND_ID = "33333333-3333-3333-3333-333333333334";
const SECOND_PROPOSAL_ID = "11111111-1111-1111-1111-111111111112";
const THIRD_PROPOSAL_ID = "11111111-1111-1111-1111-111111111113";
const SECOND_PAYMENT_ID = "44444444-4444-4444-4444-444444444445";
const SECOND_EXECUTION_ID = "88888888-8888-8888-8888-888888888889";
const THIRD_EXECUTION_ID = "88888888-8888-8888-8888-888888888890";
const FOURTH_EXECUTION_ID = "88888888-8888-8888-8888-888888888891";
const SECOND_CLOSURE_ID = "99999999-9999-9999-9999-999999999998";

const DEMANDS = [
  buildDemand({
    id: DEMAND_ID,
    type: "EVENT",
    status: "ACCEPTED",
    createdAt: "2026-12-20T10:00:00Z",
  }),
  buildDemand({ id: SECOND_DEMAND_ID, type: "EVENT", status: "NEW" }),
  buildDemand({ id: THIRD_DEMAND_ID, type: "CATERING", status: "NEW" }),
];

const PROPOSALS = [
  buildProposal({
    createdAt: "2026-12-19T10:00:00Z",
    acceptedAt: "2026-12-18T10:00:00Z",
  }),
  buildProposal({
    id: SECOND_PROPOSAL_ID,
    number: "PROP-2026-0002",
    status: "SENT",
    acceptedAt: null,
    remainingAmount: 100000,
    depositReached: false,
    createdAt: "2026-12-12T10:00:00Z",
  }),
  buildProposal({
    id: THIRD_PROPOSAL_ID,
    number: "PROP-2026-0003",
    status: "ACCEPTED",
    remainingAmount: 50000,
    depositReached: false,
  }),
];

const PAYMENTS = [
  buildPayment({ createdAt: "2026-12-17T10:00:00Z" }),
  buildPayment({
    id: SECOND_PAYMENT_ID,
    proposalId: SECOND_PROPOSAL_ID,
    proposalNumber: "PROP-2026-0002",
    amount: 50000,
    createdAt: "2026-12-16T10:00:00Z",
  }),
];

const EXECUTIONS = [
  buildExecution({ id: EXECUTION_ID, status: "PLANNED", completedAt: null }),
  buildExecution({
    id: SECOND_EXECUTION_ID,
    status: "IN_PROGRESS",
    completedAt: null,
  }),
  buildExecution({
    id: THIRD_EXECUTION_ID,
    status: "COMPLETED",
    completedAt: "2026-12-15T10:00:00Z",
  }),
  buildExecution({
    id: FOURTH_EXECUTION_ID,
    status: "CANCELLED",
    completedAt: null,
  }),
];

const CLOSURES = [
  buildClosure({
    id: CLOSURE_ID,
    status: "COMPLETED",
    closedAt: "2026-12-14T10:00:00Z",
  }),
  buildClosure({
    id: SECOND_CLOSURE_ID,
    status: "WITH_ISSUE",
    closedAt: "2026-12-13T10:00:00Z",
  }),
];

function routes(overrides: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    "GET /api/demands": () => ({ body: DEMANDS }),
    "GET /api/proposals": () => ({ body: PROPOSALS }),
    "GET /api/payments": () => ({ body: PAYMENTS }),
    "GET /api/executions": () => ({ body: EXECUTIONS }),
    "GET /api/closures": () => ({ body: CLOSURES }),
    ...overrides,
  };
}

async function openDashboard(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Tableau de bord" });
}

function emptyRoutes(): Record<string, MockHandler> {
  return {
    "GET /api/demands": () => ({ body: [] }),
    "GET /api/proposals": () => ({ body: [] }),
    "GET /api/payments": () => ({ body: [] }),
    "GET /api/executions": () => ({ body: [] }),
    "GET /api/closures": () => ({ body: [] }),
  };
}

describe("DashboardPage — indicateurs (F26)", () => {
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

  it("renders the status and type distributions with the API counts", async () => {
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

  it("builds the recent activity only from the exposed dates", async () => {
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
  it("shows a loading skeleton while the indicators are being read", async () => {
    let resolveRead: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolveRead = resolve;
    });
    const pendingHandler = () => pending;

    renderApp(
      "/dashboard",
      routes({
        "GET /api/demands": pendingHandler,
        "GET /api/proposals": pendingHandler,
        "GET /api/payments": pendingHandler,
        "GET /api/executions": pendingHandler,
        "GET /api/closures": pendingHandler,
      }),
    );

    await openDashboard();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRead?.({ body: [] });
    expect(await screen.findByText("Aucune activité enregistrée")).toBeInTheDocument();
  });

  it("shows an explicit error without fake amounts and retries", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp(
      "/dashboard",
      routes({
        "GET /api/payments": () => {
          attempts += 1;
          return attempts === 1
            ? { status: 500, body: { error: "boom" } }
            : { body: PAYMENTS };
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
    renderApp("/dashboard", emptyRoutes());

    await openDashboard();

    expect(await screen.findByText("Aucune activité enregistrée")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-demands")).toHaveTextContent("0");
    expect(screen.getByTestId("kpi-payments")).toHaveTextContent("0 Ar");
    expect(screen.queryByText("Demandes par statut")).not.toBeInTheDocument();
    expect(screen.getByText("Accès rapides")).toBeInTheDocument();
  });

  it("refreshes every indicator on demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/dashboard", routes());

    await openDashboard();
    await screen.findByTestId("kpi-demands");
    const count = (path: string) => mock.calls.filter((call) => call.url === path).length;
    const before = count("/api/demands");

    await user.click(screen.getByRole("button", { name: "Actualiser" }));

    await waitFor(() => expect(count("/api/demands")).toBeGreaterThan(before));
    await waitFor(() =>
      expect(mock.calls.filter((call) => call.url === "/api/closures").length).toBeGreaterThan(1),
    );
  });

  it("ends the session on 401", async () => {
    renderApp("/dashboard", {
      "GET /api/demands": () => ({ status: 401 }),
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
