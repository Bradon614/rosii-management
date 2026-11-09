import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildClosure,
  buildDemand,
  buildExecution,
  buildPreparation,
  buildProposal,
  CLIENT_ID,
  DEMAND_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";

const PATH = `/preparations/${PREPARATION_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const EXECUTIONS_PATH = `/api/executions?preparationId=${PREPARATION_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;

function routes(extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [] }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
    ...extra,
  };
}

/** Routes needed once the deletion redirects to the proposal detail. */
const PROPOSAL_ROUTES: Record<string, MockHandler> = {
  [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
  [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
  [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
  [`GET /api/service-dossiers/${PROPOSAL_ID}`]: () => ({
    body: { payments: [], receipts: [], invoices: [] },
  }),
  [`GET /api/preparations?proposalId=${PROPOSAL_ID}`]: () => ({ status: 404 }),
};

async function openDetail(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Préparation" });
}

describe("PreparationDetailPage — consultation (F23)", () => {
  it("shows only the fields the F09 DTO exposes and links the proposal", async () => {
    renderApp(PATH, routes());

    await openDetail();

    expect(screen.getAllByText("PROP-2026-0001").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "PROP-2026-0001" })).toHaveAttribute(
      "href",
      `/propositions/${PROPOSAL_ID}`,
    );
    expect(
      screen.getByRole("link", { name: "Ouvrir la proposition" }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}`);
    expect(screen.getByText(PREPARATION_ID)).toBeInTheDocument();
    expect(screen.getByText(/Le contrat F09 n'expose ni statut, ni tâche, ni planning/)).toBeInTheDocument();
    // No invented status/planning field.
    expect(screen.queryByText("En cours")).not.toBeInTheDocument();
    expect(screen.queryByText("Planifiée")).not.toBeInTheDocument();
  });

  it("shows a dedicated message for an unknown or soft-deleted preparation", async () => {
    renderApp(PATH, {
      [`GET ${PREPARATION_PATH}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Préparation introuvable")).toBeInTheDocument();
    expect(
      screen.getByText("Cette préparation n'existe pas ou a été supprimée."),
    ).toBeInTheDocument();
  });

  it("shows the API error and retries the load", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp(
      PATH,
      routes({
        [`GET ${PREPARATION_PATH}`]: () => {
          attempts += 1;
          return attempts === 1
            ? { status: 500, body: { error: "boom" } }
            : { body: buildPreparation() };
        },
      }),
    );

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
  });

  it("ends the session and redirects to login on 401", async () => {
    renderApp(PATH, {
      [`GET ${PREPARATION_PATH}`]: () => ({ status: 401, body: { detail: "Token expired" } }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("PreparationDetailPage — suppression logique (F23)", () => {
  it("asks for confirmation, deletes only on confirm and returns to the proposal", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes({
        [`DELETE ${PREPARATION_PATH}`]: () => ({ status: 204 }),
        ...PROPOSAL_ROUTES,
      }),
    );

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Supprimer la préparation" }));

    expect(
      await screen.findByText("Supprimer la préparation de PROP-2026-0001 ?"),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "DELETE")).toBe(true));
    const deletion = mock.calls.find((call) => call.method === "DELETE");
    expect(deletion?.url).toBe(PREPARATION_PATH);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/suppression logique/)).toBeInTheDocument();
  });

  it("keeps the preparation when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes({ [`DELETE ${PREPARATION_PATH}`]: () => ({ status: 204 }) }));

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Supprimer la préparation" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(
      screen.queryByText("Supprimer la préparation de PROP-2026-0001 ?"),
    ).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("does not offer deletion when an execution is already linked", async () => {
    renderApp(
      PATH,
      routes({
        [`GET ${EXECUTIONS_PATH}`]: () => ({ body: [buildExecution()] }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Suppression non proposée")).toBeInTheDocument();
    expect(screen.getByText(/Une exécution ou une clôture est déjà liée/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer deletion when a closure is already linked", async () => {
    renderApp(
      PATH,
      routes({
        [`GET ${CLOSURES_PATH}`]: () => ({ body: [buildClosure()] }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Suppression non proposée")).toBeInTheDocument();
    expect(screen.getByText(/Une exécution ou une clôture est déjà liée/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer deletion when the execution check fails", async () => {
    renderApp(
      PATH,
      routes({
        [`GET ${EXECUTIONS_PATH}`]: () => ({ status: 500, body: { error: "boom" } }),
      }),
    );

    await openDetail();

    expect(await screen.findByText("Suppression non proposée")).toBeInTheDocument();
    expect(screen.getByText(/n'a pas pu être vérifié/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Supprimer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("shows a backend refusal (409) without leaving the page", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        [`DELETE ${PREPARATION_PATH}`]: () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Supprimer la préparation" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(
      await screen.findByText(
        "La suppression est refusée par le serveur : la préparation est encore liée à une exécution.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
  });

  it("reports a preparation that no longer exists (404) on deletion", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes({
        [`DELETE ${PREPARATION_PATH}`]: () => ({ status: 404, body: { error: "not found" } }),
      }),
    );

    await openDetail();
    await user.click(screen.getByRole("button", { name: "Supprimer la préparation" }));
    await user.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    expect(await screen.findByText("Cette préparation n'existe plus.")).toBeInTheDocument();
  });
});
