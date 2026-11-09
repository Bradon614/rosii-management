import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatDateTime } from "@/lib/format";
import {
  buildClosure,
  buildExecution,
  buildPreparation,
  buildProposal,
  CLOSURE_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";
import type {
  Execution,
  Proposal,
  ServiceClosure,
} from "@/types/api";

const PATH = `/preparations/${PREPARATION_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const EXECUTIONS_PATH = `/api/executions?preparationId=${PREPARATION_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;
const PROPOSAL_PATH = `/api/proposals/${PROPOSAL_ID}`;
const CLOSURE_PATH = `/api/closures/${CLOSURE_ID}`;

interface Setup {
  proposal?: Proposal;
  executions?: Execution[];
  closures?: ServiceClosure[];
  extra?: Record<string, MockHandler>;
}

function routes(setup: Setup = {}): Record<string, MockHandler> {
  const {
    proposal = buildProposal(),
    executions = [buildExecution()],
    closures = [],
    extra = {},
  } = setup;
  return {
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${EXECUTIONS_PATH}`]: () => ({ body: executions }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: closures }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: proposal }),
    ...extra,
  };
}

/** Routes required when a successful creation redirects to the closure detail. */
const CLOSURE_DETAIL_ROUTES: Record<string, MockHandler> = {
  [`GET ${CLOSURE_PATH}`]: () => ({ body: buildClosure() }),
  [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
  [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [buildExecution()] }),
  [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
};

async function openPreparation(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Préparation" });
}

async function startClosure(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Clôturer le service" }));
  expect(await screen.findByText("Vérifier la clôture")).toBeInTheDocument();
}

async function confirmClosure(): Promise<void> {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Vérifier la clôture" }));
  expect(
    await screen.findByText("Clôturer le service — confirmer ?"),
  ).toBeInTheDocument();
}

describe("PreparationDetailPage — clôture (F25)", () => {
  it("does not offer a closure when there is no execution", async () => {
    renderApp(PATH, routes({ executions: [] }));

    await openPreparation();

    expect(await screen.findByText("Clôture non disponible")).toBeInTheDocument();
    expect(
      screen.getByText(/Aucune exécution n'est enregistrée pour cette préparation/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a closure while the execution is not COMPLETED", async () => {
    renderApp(PATH, routes({ executions: [buildExecution({ status: "IN_PROGRESS" })] }));

    await openPreparation();

    expect(await screen.findByText("Clôture non disponible")).toBeInTheDocument();
    expect(screen.getByText(/L'exécution est « En cours »/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("offers the closure once the execution is COMPLETED and the deposit reached", async () => {
    renderApp(PATH, routes());

    await openPreparation();

    expect(await screen.findByText("Aucune clôture")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clôturer le service" })).toBeEnabled();
  });

  it("does not offer a closure when the required deposit is not reached", async () => {
    renderApp(
      PATH,
      routes({
        proposal: buildProposal({
          depositReached: false,
          requiredDeposit: 100000,
          totalPaid: 40000,
        }),
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Dépôt requis non atteint")).toBeInTheDocument();
    expect(screen.getByText(/100\s000\sAr/)).toBeInTheDocument();
    expect(screen.getByText(/40\s000\sAr/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a closure when the proposal is not ACCEPTED", async () => {
    renderApp(
      PATH,
      routes({ proposal: buildProposal({ status: "SENT", acceptedAt: null }) }),
    );

    await openPreparation();

    expect(await screen.findByText("Clôture non disponible")).toBeInTheDocument();
    expect(screen.getByText(/Statut actuel : « Envoyée »/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("shows the active closure and never offers a second one", async () => {
    const closure = buildClosure();
    renderApp(PATH, routes({ closures: [closure] }));

    await openPreparation();

    expect(await screen.findByText(closure.finalNotes as string)).toBeInTheDocument();
    expect(screen.getAllByText("Clôturée").length).toBeGreaterThan(0);
    expect(screen.getByText(formatDateTime(closure.closedAt))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la clôture" })).toHaveAttribute(
      "href",
      `/closures/${CLOSURE_ID}`,
    );
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("creates a COMPLETED closure with no notes and opens its detail", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => ({ status: 201, body: buildClosure() }),
          ...CLOSURE_DETAIL_ROUTES,
        },
      }),
    );

    await openPreparation();
    await startClosure();

    expect(screen.getByLabelText(/Résultat de la clôture/)).toHaveValue("COMPLETED");
    expect(screen.getByLabelText("Notes finales (facultatif)")).toHaveValue("");
    await confirmClosure();

    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/closures");
    expect(post?.body).toEqual({
      preparationId: PREPARATION_ID,
      status: "COMPLETED",
      finalNotes: null,
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Clôture du service" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Le service a été clôturé.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.url === CLOSURE_PATH)).toBe(true);
  });

  it("creates a WITH_ISSUE closure with optional final notes", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () =>
            ({
              status: 201,
              body: buildClosure({ status: "WITH_ISSUE", finalNotes: "Matériel manquant." }),
            }),
          ...CLOSURE_DETAIL_ROUTES,
          [`GET ${CLOSURE_PATH}`]: () => ({
            body: buildClosure({ status: "WITH_ISSUE", finalNotes: "Matériel manquant." }),
          }),
        },
      }),
    );

    await openPreparation();
    await startClosure();

    await user.selectOptions(screen.getByLabelText(/Résultat de la clôture/), "WITH_ISSUE");
    await user.type(
      screen.getByLabelText("Notes finales (facultatif)"),
      "Matériel manquant.",
    );
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      preparationId: PREPARATION_ID,
      status: "WITH_ISSUE",
      finalNotes: "Matériel manquant.",
    });
    expect(await screen.findByText("Le service a été clôturé.")).toBeInTheDocument();
  });

  it("enforces the 2000-character limit before sending", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes());

    await openPreparation();
    await startClosure();

    fireEvent.change(screen.getByLabelText("Notes finales (facultatif)"), {
      target: { value: "x".repeat(2001) },
    });
    await user.click(screen.getByRole("button", { name: "Vérifier la clôture" }));

    expect(
      await screen.findByText(/ne peuvent pas dépasser 2 000 caractères/),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
    expect(
      screen.queryByText("Clôturer le service — confirmer ?"),
    ).not.toBeInTheDocument();
  });

  it("prevents a double submission and shows the creation loading state", async () => {
    const user = userEvent.setup();
    let resolvePost: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolvePost = resolve;
    });
    const { mock } = renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => pending,
          ...CLOSURE_DETAIL_ROUTES,
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    const submitting = await screen.findByRole("button", { name: /Clôture…/ });
    expect(submitting).toBeDisabled();
    await user.click(submitting);

    expect(mock.calls.filter((call) => call.method === "POST")).toHaveLength(1);

    resolvePost?.({ status: 201, body: buildClosure() });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Clôture du service" }),
    ).toBeInTheDocument();
  });

  it("reports a 400 without leaving the preparation", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => ({ status: 400, body: { error: "bad" } }),
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(
      await screen.findByText(/notes finales limitées à 2 000 caractères/),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
  });

  it("explains a 404", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => ({ status: 404, body: { error: "missing" } }),
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(
      await screen.findByText(
        "La préparation ou son exécution n'existe plus : la clôture ne peut pas être créée.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a 409 and offers to reload the conditions", async () => {
    const user = userEvent.setup();
    let executionsReads = 0;
    renderApp(
      PATH,
      routes({
        extra: {
          [`GET ${EXECUTIONS_PATH}`]: () => {
            executionsReads += 1;
            return { body: [buildExecution()] };
          },
          "POST /api/closures": () => ({ status: 409, body: { error: "conflict" } }),
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(
      await screen.findByText(/conditions \(proposition acceptée, dépôt atteint, exécution terminée\)/),
    ).toBeInTheDocument();
    const before = executionsReads;
    await user.click(screen.getByRole("button", { name: "Recharger la préparation" }));
    await waitFor(() => expect(executionsReads).toBeGreaterThan(before));
  });

  it("reports a 403", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => ({ status: 403, body: { error: "forbidden" } }),
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(await screen.findByText("Accès refusé.")).toBeInTheDocument();
  });

  it("ends the session on 401", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => ({ status: 401 }),
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });

  it("shows a readable message on a network failure", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        extra: {
          "POST /api/closures": () => {
            throw new Error("network down");
          },
        },
      }),
    );

    await openPreparation();
    await startClosure();
    await confirmClosure();
    await user.click(screen.getByRole("button", { name: "Confirmer la clôture" }));

    expect(await screen.findByText(/Impossible de joindre le serveur/)).toBeInTheDocument();
  });

  it("does not offer a closure when the execution check fails", async () => {
    renderApp(
      PATH,
      routes({
        extra: {
          [`GET ${EXECUTIONS_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
        },
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Clôture non vérifiable")).toBeInTheDocument();
    expect(screen.getByText(/L'état de l'exécution de cette préparation est indisponible/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a closure when the closure check fails", async () => {
    renderApp(
      PATH,
      routes({
        extra: {
          [`GET ${CLOSURES_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
        },
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Clôture non vérifiable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer a closure when the proposal check fails", async () => {
    renderApp(
      PATH,
      routes({
        extra: {
          [`GET ${PROPOSAL_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
        },
      }),
    );

    await openPreparation();

    expect(await screen.findByText("Clôture non vérifiable")).toBeInTheDocument();
    expect(screen.getByText(/Les conditions de la proposition sont indisponibles/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });

  it("respects the preparation 404 when it has been soft-deleted", async () => {
    renderApp(PATH, {
      [`GET ${PREPARATION_PATH}`]: () => ({ status: 404, body: { error: "missing" } }),
    });

    expect(await screen.findByText("Préparation introuvable")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Clôturer le service" }),
    ).not.toBeInTheDocument();
  });
});
