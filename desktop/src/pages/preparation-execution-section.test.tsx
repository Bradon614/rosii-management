import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatDate } from "@/lib/format";
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
import type { Proposal } from "@/types/api";

const PATH = `/preparations/${PREPARATION_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const EXECUTIONS_PATH = `/api/executions?preparationId=${PREPARATION_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;
const PROPOSAL_PATH = `/api/proposals/${PROPOSAL_ID}`;
const EXECUTION_PATH = `/api/executions/${EXECUTION_ID}`;

function routes(
  proposal: Proposal = buildProposal(),
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [] }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: proposal }),
    ...extra,
  };
}

/** Routes required when a successful creation redirects to the execution detail. */
function detailRoutes(
  execution = buildExecution({ status: "PLANNED", scheduledDate: null }),
): Record<string, MockHandler> {
  return {
    [`GET ${EXECUTION_PATH}`]: () => ({ body: execution }),
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
  };
}

async function openPreparation(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Préparation" });
}

async function askForCreation(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Créer une exécution" }));
  expect(
    await screen.findByText(/Créer l'exécution de PROP-2026-0001 — confirmer \?/),
  ).toBeInTheDocument();
}

describe("PreparationDetailPage — exécution (F24)", () => {
  it("shows no execution and offers the creation when ACCEPTED and deposit reached", async () => {
    renderApp(PATH, routes());

    await openPreparation();

    expect(await screen.findByText("Aucune exécution")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer une exécution" })).toBeEnabled();
  });

  it("does not offer a creation for a non-accepted proposal", async () => {
    renderApp(
      PATH,
      routes(buildProposal({ status: "SENT", acceptedAt: null })),
    );

    await openPreparation();

    expect(await screen.findByText("Création non disponible")).toBeInTheDocument();
    expect(screen.getByText(/Une exécution ne peut être créée que pour une proposition acceptée/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer une exécution" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a creation when the required deposit is not reached", async () => {
    renderApp(
      PATH,
      routes(
        buildProposal({
          depositReached: false,
          requiredDeposit: 100000,
          totalPaid: 40000,
        }),
      ),
    );

    await openPreparation();

    expect(await screen.findByText("Dépôt requis non atteint")).toBeInTheDocument();
    expect(screen.getByText(/calculés par le backend/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer une exécution" }),
    ).not.toBeInTheDocument();
  });

  it("links an existing execution and never offers a second creation", async () => {
    const execution = buildExecution({
      status: "PLANNED",
      scheduledDate: "2026-12-12",
    });
    renderApp(
      PATH,
      routes(buildProposal(), {
        [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [execution] }),
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Planifiée")).toBeInTheDocument();
    expect(screen.getAllByText(formatDate("2026-12-12")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Ouvrir l'exécution" })).toHaveAttribute(
      "href",
      `/executions/${EXECUTION_ID}`,
    );
    expect(
      screen.queryByRole("button", { name: "Créer une exécution" }),
    ).not.toBeInTheDocument();
  });

  it("creates after confirmation with only the preparationId and opens the detail", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => ({
          status: 201,
          body: buildExecution({ status: "PLANNED", scheduledDate: null }),
        }),
        ...detailRoutes(),
      }),
    );

    await openPreparation();
    await askForCreation();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/executions");
    expect(post?.body).toEqual({ preparationId: PREPARATION_ID });

    expect(await screen.findByRole("heading", { level: 1, name: "Exécution" })).toBeInTheDocument();
    expect(await screen.findByText("L'exécution a été créée.")).toBeInTheDocument();
  });

  it("cancels the creation without sending any request", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes());

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(
      screen.queryByText(/Créer l'exécution de PROP-2026-0001 — confirmer \?/),
    ).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("prevents a double submission and shows the creation loading state", async () => {
    const user = userEvent.setup();
    let resolvePost: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolvePost = resolve;
    });
    const { mock } = renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => pending,
        ...detailRoutes(),
      }),
    );

    await openPreparation();
    await user.click(await screen.findByRole("button", { name: "Créer une exécution" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    const creating = await screen.findByRole("button", { name: /Création…/ });
    expect(creating).toBeDisabled();
    await user.click(creating);

    expect(mock.calls.filter((call) => call.method === "POST")).toHaveLength(1);

    resolvePost?.({
      status: 201,
      body: buildExecution({ status: "PLANNED", scheduledDate: null }),
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Exécution" })).toBeInTheDocument();
  });

  it("reports a 400 without navigating", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => ({ status: 400, body: { error: "invalid" } }),
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "La création est refusée : les informations envoyées sont invalides.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
  });

  it("explains that the preparation no longer exists on 404", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => ({ status: 404, body: { error: "missing" } }),
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "Cette préparation n'existe plus : l'exécution ne peut pas être créée.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a 409 and offers to reload the eligibility", async () => {
    const user = userEvent.setup();
    let executionReads = 0;
    renderApp(
      PATH,
      routes(buildProposal(), {
        [`GET ${EXECUTIONS_PATH}`]: () => {
          executionReads += 1;
          return { body: [] };
        },
        "POST /api/executions": () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByText(/conditions \(proposition acceptée, dépôt requis atteint\)/)).toBeInTheDocument();
    const before = executionReads;
    await user.click(screen.getByRole("button", { name: "Recharger" }));
    await waitFor(() => expect(executionReads).toBeGreaterThan(before));
  });

  it("reports a 403", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => ({ status: 403, body: { error: "forbidden" } }),
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByText("Accès refusé.")).toBeInTheDocument();
  });

  it("shows a readable message on a network failure", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => {
          throw new Error("network down");
        },
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(/Impossible de joindre le serveur/),
    ).toBeInTheDocument();
  });

  it("ends the session on 401", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), {
        "POST /api/executions": () => ({ status: 401 }),
      }),
    );

    await openPreparation();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });

  it("does not offer a creation when the execution check fails", async () => {
    renderApp(
      PATH,
      routes(buildProposal(), {
        [`GET ${EXECUTIONS_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Exécution non vérifiable")).toBeInTheDocument();
    expect(screen.getByText(/Par sécurité, aucune création n'est proposée/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer une exécution" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a creation when the proposal check fails", async () => {
    renderApp(
      PATH,
      routes(buildProposal(), {
        [`GET ${PROPOSAL_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Exécution non vérifiable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer une exécution" }),
    ).not.toBeInTheDocument();
  });
});
