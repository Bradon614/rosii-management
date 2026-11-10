import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClosure,
  buildPreparation,
  buildProposal,
  CLOSURE_ID,
  EXECUTION_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";
import type { ServiceClosure } from "@/types/api";

const SECOND_CLOSURE_ID = "99999999-9999-9999-9999-999999999998";
const SECOND_PREPARATION_ID = "77777777-7777-7777-7777-777777777778";
const SECOND_EXECUTION_ID = "88888888-8888-8888-8888-888888888889";
const SECOND_PROPOSAL_ID = "11111111-1111-1111-1111-111111111112";

const COMPLETED = buildClosure({
  id: CLOSURE_ID,
  preparationId: PREPARATION_ID,
  proposalId: PROPOSAL_ID,
  proposalNumber: "PROP-2026-0001",
  status: "COMPLETED",
  closedAt: "2026-12-13T09:00:00Z",
  executionId: EXECUTION_ID,
  executionStatus: "COMPLETED",
});
const WITH_ISSUE = buildClosure({
  id: SECOND_CLOSURE_ID,
  preparationId: SECOND_PREPARATION_ID,
  proposalId: SECOND_PROPOSAL_ID,
  proposalNumber: "PROP-2026-0002",
  status: "WITH_ISSUE",
  closedAt: "2026-12-20T18:00:00Z",
  finalNotes: "Incident mineur.",
  executionId: SECOND_EXECUTION_ID,
  executionStatus: "COMPLETED",
});

function closureHandler(closures: ServiceClosure[]): MockHandler {
  return ({ url }) => {
    const params = new URL(url, "http://localhost").searchParams;
    let result = closures;
    const preparationId = params.get("preparationId");
    if (preparationId) {
      result = result.filter((closure) => closure.preparationId === preparationId);
    }
    const status = params.get("status");
    if (status) {
      result = result.filter((closure) => closure.status === status);
    }
    return { body: result };
  };
}

function routes(
  closures: ServiceClosure[] = [COMPLETED, WITH_ISSUE],
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    "GET /api/closures": closureHandler(closures),
    // Feature 34: the closure row now carries its proposal and its active
    // execution, so NO per-closure preparation/execution route is mocked here on
    // purpose: a remaining per-row read would fail loudly ("Unexpected API call").
    // The preparation/proposal routes below serve the preparationId FILTER banner
    // only (one call, independent of the number of rows).
    [`GET /api/preparations/${PREPARATION_ID}`]: () => ({ body: buildPreparation() }),
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
    ...extra,
  };
}

async function openList(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Clôtures" });
}

describe("ClosuresPage — liste globale (F25)", () => {
  it("lists the status, date, preparation, proposal and execution of each closure", async () => {
    const { mock } = renderApp("/closures", routes());

    await openList();

    expect(await screen.findByTestId("closure-count")).toHaveTextContent("2 clôtures");
    expect(screen.getAllByText("Clôturée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clôturée avec réserve").length).toBeGreaterThan(0);

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
      await screen.findByRole("link", { name: `Ouvrir l'exécution ${EXECUTION_ID}` }),
    ).toHaveAttribute("href", `/executions/${EXECUTION_ID}`);
    expect(
      await screen.findByRole("link", { name: `Ouvrir l'exécution ${SECOND_EXECUTION_ID}` }),
    ).toHaveAttribute("href", `/executions/${SECOND_EXECUTION_ID}`);
    expect(
      screen.getByRole("link", { name: `Voir la clôture ${CLOSURE_ID}` }),
    ).toHaveAttribute("href", `/closures/${CLOSURE_ID}`);
    expect(
      screen.getByRole("link", { name: `Voir la clôture ${SECOND_CLOSURE_ID}` }),
    ).toHaveAttribute("href", `/closures/${SECOND_CLOSURE_ID}`);

    // Feature 34: one list call and NOTHING per row — the preparation and the
    // execution context now travel with the closure itself.
    expect(mock.calls.filter((call) => call.url.startsWith("/api/closures"))).toHaveLength(1);
    expect(mock.calls.filter((call) => call.url.startsWith("/api/preparations"))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.url.startsWith("/api/executions"))).toHaveLength(0);
    expect(mock.calls.filter((call) => call.url.startsWith("/api/proposals"))).toHaveLength(0);
  });

  it("filters through the backend status parameter", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/closures", routes());

    await openList();
    await screen.findByTestId("closure-count");

    await user.selectOptions(screen.getByLabelText("Statut"), "WITH_ISSUE");

    await waitFor(() =>
      expect(
        mock.calls.some((call) => call.url === "/api/closures?status=WITH_ISSUE"),
      ).toBe(true),
    );
    expect(await screen.findByTestId("closure-count")).toHaveTextContent("1 clôture");
    expect(screen.queryByText("PROP-2026-0001")).not.toBeInTheDocument();
    expect(screen.getAllByText("PROP-2026-0002").length).toBeGreaterThan(0);
  });

  it("honours a preparationId deep link and clears it", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(`/closures?preparationId=${PREPARATION_ID}`, routes());

    await openList();

    expect(
      await screen.findByText(/Clôtures de la préparation — PROP-2026-0001/),
    ).toBeInTheDocument();
    expect(await screen.findByTestId("closure-count")).toHaveTextContent("1 clôture");
    expect(
      mock.calls.some(
        (call) => call.url === `/api/closures?preparationId=${PREPARATION_ID}`,
      ),
    ).toBe(true);

    await user.click(screen.getByRole("button", { name: "Retirer le filtre" }));
    await waitFor(() =>
      expect(
        screen.queryByText(/Clôtures de la préparation — PROP-2026-0001/),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByTestId("closure-count")).toHaveTextContent("2 clôtures");
  });

  it("shows the global empty state when there is no closure", async () => {
    renderApp("/closures", routes([]));

    await openList();

    expect(await screen.findByText("Aucune clôture")).toBeInTheDocument();
  });

  it("shows a filtered empty state and resets the filters", async () => {
    const user = userEvent.setup();
    renderApp("/closures", routes([]));

    await openList();
    await screen.findByText("Aucune clôture");

    await user.selectOptions(screen.getByLabelText("Statut"), "WITH_ISSUE");

    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Afficher toutes les clôtures" }));

    expect(await screen.findByText("Aucune clôture")).toBeInTheDocument();
  });

  it("reports a loading failure and retries", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp(
      "/closures",
      routes([COMPLETED, WITH_ISSUE], {
        "GET /api/closures": () => {
          attempts += 1;
          return attempts === 1
            ? { status: 500, body: { error: "boom" } }
            : { body: [COMPLETED, WITH_ISSUE] };
        },
      }),
    );

    await openList();

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByTestId("closure-count")).toHaveTextContent("2 clôtures");
  });

  it("refreshes the list on demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/closures", routes());

    await openList();
    await screen.findByTestId("closure-count");
    const reads = () => mock.calls.filter((call) => call.url === "/api/closures").length;
    const before = reads();

    await user.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it("shows a loading state while the list is being read", async () => {
    let resolveRead: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolveRead = resolve;
    });
    renderApp(
      "/closures",
      routes([], {
        "GET /api/closures": () => pending,
      }),
    );

    await openList();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRead?.({ body: [COMPLETED] });
    expect(await screen.findByTestId("closure-count")).toHaveTextContent("1 clôture");
  });

  it("ends the session on 401", async () => {
    renderApp("/closures", {
      "GET /api/closures": () => ({ status: 401 }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});
