import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  formatDate,
  formatDateTime,
  formatTime,
} from "@/lib/format";
import {
  buildClosure,
  buildExecution,
  buildPreparation,
  buildProposal,
  EXECUTION_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";
import type { Execution, ExecutionStatus } from "@/types/api";

const PATH = `/executions/${EXECUTION_ID}`;
const EXECUTION_PATH = `/api/executions/${EXECUTION_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const PROPOSAL_PATH = `/api/proposals/${PROPOSAL_ID}`;
const EXECUTIONS_PATH = `/api/executions?preparationId=${PREPARATION_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;
const STATUS_PATH = `${EXECUTION_PATH}/status`;

function detailRoutes(
  execution: Execution,
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    [`GET ${EXECUTION_PATH}`]: () => ({ body: execution }),
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
    ...extra,
  };
}

/** Routes required by the preparation detail after a successful deletion. */
const PREPARATION_AFTER_DELETE: Record<string, MockHandler> = {
  [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
  [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [] }),
  [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
  [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
};

async function openDetail(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: /Exécution/ });
}

describe("ExecutionDetailPage — consultation (F24)", () => {
  it("displays the F10 DTO fields and links the preparation and the proposal", async () => {
    const execution = buildExecution({
      status: "PLANNED",
      scheduledDate: "2026-12-12",
      startTime: "18:00:00",
      endTime: "23:30:00",
      location: "Salle des fêtes",
      notes: "Montage le matin",
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
      version: 2,
    });
    renderApp(PATH, detailRoutes(execution));

    await screen.findByRole("heading", {
      level: 1,
      name: `Exécution du ${formatDate("2026-12-12")}`,
    });

    expect(screen.getByText(EXECUTION_ID)).toBeInTheDocument();
    expect(screen.getAllByText("Planifiée").length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatDate("2026-12-12")).length).toBeGreaterThan(0);
    expect(screen.getByText(`${formatTime("18:00:00")} – ${formatTime("23:30:00")}`)).toBeInTheDocument();
    expect(screen.getByText("Salle des fêtes")).toBeInTheDocument();
    expect(screen.getByText("Montage le matin")).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Ouvrir la préparation" }),
    ).toHaveAttribute("href", `/preparations/${PREPARATION_ID}`);
    expect(
      await screen.findByRole("link", { name: /PROP-2026-0001/ }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}`);
    expect(screen.getAllByText(formatDateTime(execution.createdAt)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(formatDateTime(execution.updatedAt)).length).toBeGreaterThan(0);
    const version = screen.getByText("Version").parentElement;
    expect(version).not.toBeNull();
    expect(within(version as HTMLElement).getByText("2")).toBeInTheDocument();
  });

  it("hides absent optional fields and never invents a scheduled date", async () => {
    const execution = buildExecution({
      status: "PLANNED",
      scheduledDate: null,
      startTime: null,
      endTime: null,
      location: null,
      notes: null,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancellationReason: null,
    });
    renderApp(PATH, detailRoutes(execution));

    await screen.findByRole("heading", { level: 1, name: "Exécution" });

    expect(screen.getAllByText("Non renseignée").length).toBeGreaterThan(0);
    expect(screen.queryByText("Horaires")).not.toBeInTheDocument();
    expect(screen.queryByText("Lieu")).not.toBeInTheDocument();
    expect(screen.queryByText("Débutée le")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminée le")).not.toBeInTheDocument();
    expect(screen.queryByText("Annulée le")).not.toBeInTheDocument();
    expect(screen.queryByText("Motif d'annulation")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("reports an unknown or soft-deleted execution with a 404", async () => {
    renderApp(PATH, {
      [`GET ${EXECUTION_PATH}`]: () => ({ status: 404, body: { error: "not found" } }),
    });

    expect(await screen.findByText("Exécution introuvable")).toBeInTheDocument();
    expect(screen.getByText("Cette exécution n'existe pas ou a été supprimée.")).toBeInTheDocument();
  });

  it("ends the session and redirects to login on 401", async () => {
    renderApp(PATH, {
      [`GET ${EXECUTION_PATH}`]: () => ({ status: 401, body: { detail: "Token expired" } }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("ExecutionDetailPage — statuts (F24)", () => {
  it("only offers start and cancel while PLANNED", async () => {
    renderApp(PATH, detailRoutes(buildExecution({ status: "PLANNED" })));

    await openDetail();

    expect(screen.getByRole("button", { name: "Démarrer l'exécution" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler l'exécution" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Terminer l'exécution" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier l'exécution" })).toBeInTheDocument();
  });

  it("only offers complete and cancel while IN_PROGRESS", async () => {
    renderApp(PATH, detailRoutes(buildExecution({ status: "IN_PROGRESS" })));

    await openDetail();

    expect(screen.getByRole("button", { name: "Terminer l'exécution" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler l'exécution" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Démarrer l'exécution" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Modifier l'exécution" })).toBeInTheDocument();
  });

  it("offers no transition or modification once COMPLETED", async () => {
    renderApp(PATH, detailRoutes(buildExecution({ status: "COMPLETED" })));

    await openDetail();

    expect(await screen.findByText("Statut définitif")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Démarrer l'exécution|Terminer l'exécution|Annuler l'exécution/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier l'exécution" })).not.toBeInTheDocument();
  });

  it("offers no transition or modification once CANCELLED and shows the cancellation info", async () => {
    const execution = buildExecution({
      status: "CANCELLED",
      cancelledAt: "2026-12-10T09:00:00Z",
      cancellationReason: "Client indisponible",
    });
    renderApp(PATH, detailRoutes(execution));

    await openDetail();

    expect(await screen.findByText("Statut définitif")).toBeInTheDocument();
    expect(screen.getByText("Motif d'annulation")).toBeInTheDocument();
    expect(screen.getByText("Client indisponible")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Démarrer l'exécution|Terminer l'exécution|Annuler l'exécution/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifier l'exécution" })).not.toBeInTheDocument();
  });

  it("confirms the transition, sends only the target status and refreshes", async () => {
    const user = userEvent.setup();
    let current = buildExecution({ status: "PLANNED" });
    let reads = 0;
    const routes: Record<string, MockHandler> = {
      [`GET ${EXECUTION_PATH}`]: () => {
        reads += 1;
        return { body: current };
      },
      [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
      [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
      [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
      [`PATCH ${STATUS_PATH}`]: ({ init }) => {
        const body = JSON.parse(String(init.body)) as { status: ExecutionStatus };
        current = { ...current, status: body.status, version: current.version + 1 };
        return { body: current };
      },
    };
    const { mock } = renderApp(PATH, routes);

    await openDetail();
    const before = reads;
    await user.click(screen.getByRole("button", { name: "Démarrer l'exécution" }));

    expect(await screen.findByText("Démarrer l'exécution ?")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PATCH")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PATCH")).toBe(true));
    const patch = mock.calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toBe(STATUS_PATH);
    expect(patch?.body).toEqual({ status: "IN_PROGRESS" });

    expect(
      await screen.findByText("Le statut de l'exécution est maintenant « En cours »."),
    ).toBeInTheDocument();
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it("does not send a transition when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, detailRoutes(buildExecution({ status: "PLANNED" })));

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Annuler l'exécution" }));
    expect(await screen.findByText("Annuler l'exécution ?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Annuler l'exécution ?")).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("reports a 409 and offers to reload", async () => {
    const user = userEvent.setup();
    let reads = 0;
    renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "PLANNED" }), {
        [`GET ${EXECUTION_PATH}`]: () => {
          reads += 1;
          return { body: buildExecution({ status: "PLANNED" }) };
        },
        [`PATCH ${STATUS_PATH}`]: () => ({ status: 409, body: { error: "illegal" } }),
      }),
    );

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Démarrer l'exécution" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByText(/Cette transition n'est plus autorisée/)).toBeInTheDocument();
    const before = reads;
    await user.click(screen.getByRole("button", { name: "Recharger l'exécution" }));
    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await waitFor(() =>
      expect(screen.queryByText(/Cette transition n'est plus autorisée/)).not.toBeInTheDocument(),
    );
  });

  it("ends the session on 401 during a transition", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "PLANNED" }), {
        [`PATCH ${STATUS_PATH}`]: () => ({ status: 401 }),
      }),
    );

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Démarrer l'exécution" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("ExecutionDetailPage — suppression logique (F24)", () => {
  it("asks for confirmation, deletes only on confirm and returns to the preparation", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "PLANNED" }), {
        [`DELETE ${EXECUTION_PATH}`]: () => ({ status: 204 }),
        ...PREPARATION_AFTER_DELETE,
      }),
    );

    await openDetail();
    await user.click(
      await screen.findByRole("button", { name: "Supprimer l'exécution" }),
    );

    expect(
      await screen.findByText("Supprimer l'exécution de PROP-2026-0001 ?"),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "DELETE")).toBe(true));
    const deletion = mock.calls.find((call) => call.method === "DELETE");
    expect(deletion?.url).toBe(EXECUTION_PATH);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Préparation" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/suppression logique/)).toBeInTheDocument();
  });

  it("does not offer deletion when the execution is linked to a closure", async () => {
    renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "COMPLETED" }), {
        [`GET ${CLOSURES_PATH}`]: () => ({ body: [buildClosure()] }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Suppression non proposée")).toBeInTheDocument();
    expect(screen.getByText(/Une clôture est déjà enregistrée pour ce service/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer l'exécution" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer deletion when the closure check fails", async () => {
    renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "PLANNED" }), {
        [`GET ${CLOSURES_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Suppression non proposée")).toBeInTheDocument();
    expect(screen.getByText(/n'a pas pu être vérifié/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer l'exécution" }),
    ).not.toBeInTheDocument();
  });

  it("reports a 409 on deletion and stays on the page", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      detailRoutes(buildExecution({ status: "PLANNED" }), {
        [`DELETE ${EXECUTION_PATH}`]: () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    await openDetail();
    await user.click(
      await screen.findByRole("button", { name: "Supprimer l'exécution" }),
    );
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(await screen.findByText(/conflit de version/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Exécution/ })).toBeInTheDocument();
  });
});
