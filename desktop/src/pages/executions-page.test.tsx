import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildExecution,
  buildPreparation,
  buildProposal,
  EXECUTION_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";
import type { Execution } from "@/types/api";

const SECOND_EXECUTION_ID = "88888888-8888-8888-8888-888888888889";
const SECOND_PREPARATION_ID = "77777777-7777-7777-7777-777777777778";
const SECOND_PROPOSAL_ID = "11111111-1111-1111-1111-111111111112";

const PLANNED = buildExecution({
  id: EXECUTION_ID,
  status: "PLANNED",
  scheduledDate: "2026-12-12",
  location: "Salle A",
  preparationId: PREPARATION_ID,
});
const IN_PROGRESS = buildExecution({
  id: SECOND_EXECUTION_ID,
  status: "IN_PROGRESS",
  scheduledDate: "2026-12-20",
  location: "Salle B",
  preparationId: SECOND_PREPARATION_ID,
  proposalId: SECOND_PROPOSAL_ID,
  proposalNumber: "PROP-2026-0002",
});

function executionHandler(executions: Execution[]): MockHandler {
  return ({ url }) => {
    const params = new URL(url, "http://localhost").searchParams;
    let result = executions;
    const preparationId = params.get("preparationId");
    if (preparationId) {
      result = result.filter((execution) => execution.preparationId === preparationId);
    }
    const status = params.get("status");
    if (status) {
      result = result.filter((execution) => execution.status === status);
    }
    const scheduledDate = params.get("scheduledDate");
    if (scheduledDate) {
      result = result.filter((execution) => execution.scheduledDate === scheduledDate);
    }
    return { body: result };
  };
}

function routes(
  executions: Execution[] = [PLANNED, IN_PROGRESS],
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    "GET /api/executions": executionHandler(executions),
    // Feature 34: the row context (proposal number/id) comes from the list
    // response, so NO per-preparation route is mocked for the ROWS on purpose: an
    // extra read would make the mock fail loudly with "Unexpected API call".
    // The route below only serves the preparationId FILTER banner (one call,
    // independent of the number of rows).
    [`GET /api/preparations/${PREPARATION_ID}`]: () => ({ body: buildPreparation() }),
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
    ...extra,
  };
}

async function openList(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Exécutions" });
}

describe("ExecutionsPage — liste globale (F24)", () => {
  it("lists the status, date, location, preparation and proposal of each execution", async () => {
    const { mock } = renderApp("/executions", routes());

    await openList();

    expect(await screen.findByTestId("execution-count")).toHaveTextContent("2 exécutions");
    expect(screen.getAllByText("Planifiée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("En cours").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Salle A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Salle B").length).toBeGreaterThan(0);

    expect(
      await screen.findByRole("link", { name: `Ouvrir la préparation ${PREPARATION_ID}` }),
    ).toHaveAttribute("href", `/preparations/${PREPARATION_ID}`);
    expect(
      await screen.findByRole("link", { name: "Ouvrir la proposition PROP-2026-0001" }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}`);
    expect(
      await screen.findByRole("link", { name: "Ouvrir la proposition PROP-2026-0002" }),
    ).toHaveAttribute("href", `/propositions/${SECOND_PROPOSAL_ID}`);
    expect(
      screen.getByRole("link", { name: `Voir l'exécution ${EXECUTION_ID}` }),
    ).toHaveAttribute("href", `/executions/${EXECUTION_ID}`);
    expect(
      screen.getByRole("link", { name: `Voir l'exécution ${SECOND_EXECUTION_ID}` }),
    ).toHaveAttribute("href", `/executions/${SECOND_EXECUTION_ID}`);

    // Feature 34: one list call, and NO read per row to resolve the preparation
    // or the proposal (that cascade is what the optimization removed).
    expect(mock.calls.filter((call) => call.url.startsWith("/api/preparations"))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.url.startsWith("/api/proposals"))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.url.startsWith("/api/executions?"))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.url === "/api/executions")).toHaveLength(1);
  });

  it("filters through the backend status parameter", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/executions", routes());

    await openList();
    await screen.findByTestId("execution-count");

    await user.selectOptions(screen.getByLabelText("Statut"), "PLANNED");

    await waitFor(() =>
      expect(
        mock.calls.some((call) => call.url === "/api/executions?status=PLANNED"),
      ).toBe(true),
    );
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("1 exécution");
    expect(screen.getAllByText("Planifiée").length).toBeGreaterThan(0);
    expect(screen.queryByText("Salle B")).not.toBeInTheDocument();
  });

  it("filters through the backend scheduledDate parameter", async () => {
    const { mock } = renderApp("/executions", routes());

    await openList();
    await screen.findByTestId("execution-count");

    fireEvent.change(screen.getByLabelText("Date programmée"), {
      target: { value: "2026-12-20" },
    });

    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) => call.url === "/api/executions?scheduledDate=2026-12-20",
        ),
      ).toBe(true),
    );
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("1 exécution");
    expect(screen.queryByText("Salle A")).not.toBeInTheDocument();
    expect(screen.getAllByText("Salle B").length).toBeGreaterThan(0);
  });

  it("shows the global empty state when there is no execution", async () => {
    renderApp("/executions", routes([]));

    await openList();

    expect(await screen.findByText("Aucune exécution")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Ouvrir la préparation/ }),
    ).not.toBeInTheDocument();
  });

  it("shows a filtered empty state and resets the filters", async () => {
    const user = userEvent.setup();
    renderApp("/executions", routes([]));

    await openList();
    await screen.findByText("Aucune exécution");

    await user.selectOptions(screen.getByLabelText("Statut"), "COMPLETED");

    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Afficher toutes les exécutions" }));

    expect(await screen.findByText("Aucune exécution")).toBeInTheDocument();
  });

  it("reports a loading failure and retries", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp(
      "/executions",
      routes([PLANNED, IN_PROGRESS], {
        "GET /api/executions": () => {
          attempts += 1;
          return attempts === 1
            ? { status: 500, body: { error: "boom" } }
            : { body: [PLANNED, IN_PROGRESS] };
        },
      }),
    );

    await openList();

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("2 exécutions");
  });

  it("refreshes the list on demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/executions", routes());

    await openList();
    await screen.findByTestId("execution-count");
    const reads = () => mock.calls.filter((call) => call.url === "/api/executions").length;
    const before = reads();

    await user.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it("honours a preparationId deep link and clears it", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(`/executions?preparationId=${PREPARATION_ID}`, routes());

    await openList();

    expect(
      await screen.findByText(/Exécutions de la préparation — PROP-2026-0001/),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("1 exécution");
    expect(
      mock.calls.some(
        (call) => call.url === `/api/executions?preparationId=${PREPARATION_ID}`,
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Retirer le filtre" }));

    await waitFor(() =>
      expect(
        screen.queryByText(/Exécutions de la préparation — PROP-2026-0001/),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("2 exécutions");
  });

  it("shows a loading state while the list is being read", async () => {
    let resolveRead: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolveRead = resolve;
    });
    renderApp(
      "/executions",
      routes([], {
        "GET /api/executions": () => pending,
      }),
    );

    await openList();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRead?.({ body: [PLANNED] });
    expect(await screen.findByTestId("execution-count")).toHaveTextContent("1 exécution");
  });

  it("ends the session on 401", async () => {
    renderApp("/executions", {
      "GET /api/executions": () => ({ status: 401 }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});
