import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatDateTime } from "@/lib/format";
import {
  buildClosure,
  buildExecution,
  buildPreparation,
  buildProposal,
  CLOSURE_ID,
  EXECUTION_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";
import type { ServiceClosure } from "@/types/api";

const PATH = `/closures/${CLOSURE_ID}`;
const CLOSURE_PATH = `/api/closures/${CLOSURE_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const EXECUTIONS_PATH = `/api/executions?preparationId=${PREPARATION_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;
const PROPOSAL_PATH = `/api/proposals/${PROPOSAL_ID}`;

function detailRoutes(
  closure: ServiceClosure = buildClosure(),
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    [`GET ${CLOSURE_PATH}`]: () => ({ body: closure }),
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [buildExecution()] }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
    ...extra,
  };
}

/** Routes required by the preparation detail after a successful deletion. */
const PREPARATION_AFTER_DELETE: Record<string, MockHandler> = {
  [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
  [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [buildExecution()] }),
  [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
  [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
};

async function openDetail(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Clôture du service" });
}

describe("ClosureDetailPage — consultation (F25)", () => {
  it("displays every F11 field and links the preparation, execution and proposal", async () => {
    const closure = buildClosure({
      status: "WITH_ISSUE",
      closedAt: "2026-12-13T09:00:00Z",
      finalNotes: "Matériel manquant.",
      createdAt: "2026-12-13T09:00:00Z",
      updatedAt: "2026-12-13T09:05:00Z",
      version: 2,
    });
    renderApp(PATH, detailRoutes(closure));

    await openDetail();

    expect(screen.getByText(CLOSURE_ID)).toBeInTheDocument();
    expect(screen.getAllByText("Clôturée avec réserve").length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatDateTime(closure.closedAt as string)).length).toBeGreaterThan(0);
    expect(screen.getByText("Matériel manquant.")).toBeInTheDocument();
    expect(screen.getAllByText(formatDateTime(closure.createdAt)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatDateTime(closure.updatedAt)).length).toBeGreaterThan(0);
    expect(screen.getByText("Version")).toBeInTheDocument();

    expect(
      await screen.findByRole("link", { name: "Ouvrir la préparation" }),
    ).toHaveAttribute("href", `/preparations/${PREPARATION_ID}`);
    expect(
      await screen.findByRole("link", { name: "Ouvrir l'exécution" }),
    ).toHaveAttribute("href", `/executions/${EXECUTION_ID}`);
    expect(
      await screen.findByRole("link", { name: /PROP-2026-0001/ }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}`);
  });

  it("hides absent optional fields instead of inventing values", async () => {
    const closure = buildClosure({
      finalNotes: null,
      closedAt: null,
    });
    renderApp(PATH, detailRoutes(closure));

    await openDetail();

    expect(screen.getByText("Non renseignée")).toBeInTheDocument();
    expect(screen.queryByText("Notes finales")).not.toBeInTheDocument();
  });

  it("never exposes a modification form for a definitive closure", async () => {
    renderApp(PATH, detailRoutes());

    await openDetail();

    expect(screen.getByText("Clôture définitive")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Modifier/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enregistrer les modifications/ }),
    ).not.toBeInTheDocument();
  });

  it("reports an unknown or soft-deleted closure with a 404", async () => {
    renderApp(PATH, {
      [`GET ${CLOSURE_PATH}`]: () => ({ status: 404, body: { error: "not found" } }),
    });

    expect(await screen.findByText("Clôture introuvable")).toBeInTheDocument();
    expect(screen.getByText("Cette clôture n'existe pas ou a été supprimée.")).toBeInTheDocument();
  });

  it("ends the session on 401", async () => {
    renderApp(PATH, {
      [`GET ${CLOSURE_PATH}`]: () => ({ status: 401, body: { detail: "Token expired" } }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("ClosureDetailPage — suppression logique (F25)", () => {
  it("asks for confirmation, deletes only on confirm and returns to the preparation", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`DELETE ${CLOSURE_PATH}`]: () => ({ status: 204 }),
        ...PREPARATION_AFTER_DELETE,
      }),
    );

    await openDetail();
    await user.click(await screen.findByRole("button", { name: "Supprimer la clôture" }));

    expect(
      await screen.findByText("Supprimer la clôture de PROP-2026-0001 ?"),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "DELETE")).toBe(true));
    const deletion = mock.calls.find((call) => call.method === "DELETE");
    expect(deletion?.url).toBe(CLOSURE_PATH);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Préparation" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/suppression logique/)).toBeInTheDocument();
    expect(await screen.findByText("Aucune clôture")).toBeInTheDocument();
  });

  it("returns to the closure list when the preparation is gone", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`GET ${PREPARATION_PATH}`]: () => ({ status: 404, body: { error: "missing" } }),
        [`DELETE ${CLOSURE_PATH}`]: () => ({ status: 204 }),
        "GET /api/closures": () => ({ body: [] }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Préparation supprimée")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Supprimer la clôture" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "DELETE")).toBe(true));
    expect(await screen.findByRole("heading", { level: 1, name: "Clôtures" })).toBeInTheDocument();
    expect(await screen.findByText(/suppression logique/)).toBeInTheDocument();
  });

  it("reports a 409 on deletion and stays on the page", async () => {
    const user = userEvent.setup();
    let reads = 0;
    renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`GET ${CLOSURE_PATH}`]: () => {
          reads += 1;
          return { body: buildClosure() };
        },
        [`DELETE ${CLOSURE_PATH}`]: () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    await openDetail();
    await user.click(await screen.findByRole("button", { name: "Supprimer la clôture" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(await screen.findByText(/conflit/)).toBeInTheDocument();
    const before = reads;
    await user.click(screen.getByRole("button", { name: "Recharger" }));
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    expect(screen.getByRole("heading", { level: 1, name: "Clôture du service" })).toBeInTheDocument();
  });

  it("reports a 404 on deletion", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`DELETE ${CLOSURE_PATH}`]: () => ({ status: 404, body: { error: "missing" } }),
      }),
    );

    await openDetail();
    await user.click(await screen.findByRole("button", { name: "Supprimer la clôture" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(await screen.findByText("Cette clôture n'existe plus.")).toBeInTheDocument();
  });
});

describe("ClosureDetailPage — contexte indisponible (F25)", () => {
  it("shows that the associated execution is unavailable when there is none", async () => {
    renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [] }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Exécution")).toBeInTheDocument();
    expect(await screen.findByText("Indisponible")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ouvrir l'exécution" }),
    ).not.toBeInTheDocument();
  });

  it("warns when the preparation context cannot be loaded", async () => {
    renderApp(
      PATH,
      detailRoutes(buildClosure(), {
        [`GET ${PREPARATION_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Contexte non vérifiable")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Ouvrir la préparation" }),
    ).not.toBeInTheDocument();
  });
});
