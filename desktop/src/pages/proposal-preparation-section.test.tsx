import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildDemand,
  buildPreparation,
  buildProposal,
  CLIENT_ID,
  DEMAND_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler, MockReply } from "@/test/mock-api";
import type { Preparation, Proposal } from "@/types/api";

const PATH = `/propositions/${PROPOSAL_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;

function routes(
  proposal: Proposal,
  preparation: Preparation | null,
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: proposal }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
    [`GET /api/service-dossiers/${PROPOSAL_ID}`]: () => ({
      body: { payments: [], receipts: [], invoices: [] },
    }),
    [`GET /api/preparations?proposalId=${PROPOSAL_ID}`]: () =>
      preparation ? { body: preparation } : { status: 404 },
    ...extra,
  };
}

/** Routes required once the creation succeeds and the detail page is opened. */
const DETAIL_ROUTES: Record<string, MockHandler> = {
  [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
  [`GET /api/executions?preparationId=${PREPARATION_ID}`]: () => ({ body: [] }),
  [`GET /api/closures?preparationId=${PREPARATION_ID}`]: () => ({ body: [] }),
};

async function openProposal(): Promise<void> {
  await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
}

async function askForCreation(): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Créer la préparation" }));
  expect(await screen.findByText("Créer la préparation — confirmer ?")).toBeInTheDocument();
}

describe("ProposalDetailPage — préparation (F23)", () => {
  it("explains that a non-accepted proposal cannot be prepared", async () => {
    renderApp(PATH, routes(buildProposal({ status: "SENT", acceptedAt: null }), null));

    await openProposal();

    expect(await screen.findByText("Préparation non disponible")).toBeInTheDocument();
    expect(
      screen.getByText(/La préparation ne peut être créée que pour une proposition acceptée/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("shows the backend financial values when the deposit is not reached", async () => {
    renderApp(
      PATH,
      routes(
        buildProposal({
          status: "ACCEPTED",
          depositReached: false,
          requiredDeposit: 100000,
          totalPaid: 40000,
          remainingAmount: 460000,
        }),
        null,
      ),
    );

    await openProposal();

    expect(await screen.findByText("Dépôt requis non atteint")).toBeInTheDocument();
    expect(screen.getByText(/calculés par le backend/)).toBeInTheDocument();
    expect(screen.getAllByText(/100\s000\sAr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/40\s000\sAr/).length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: "Créer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("offers the creation once ACCEPTED and the deposit is reached", async () => {
    renderApp(PATH, routes(buildProposal(), null));

    await openProposal();

    expect(await screen.findByText("Aucune préparation active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la préparation" })).toBeEnabled();
    expect(
      screen.queryByRole("link", { name: /Ouvrir la préparation/ }),
    ).not.toBeInTheDocument();
  });

  it("links an existing active preparation and never offers a second creation", async () => {
    renderApp(PATH, routes(buildProposal(), buildPreparation()));

    await openProposal();

    const link = await screen.findByRole("link", { name: /Ouvrir la préparation/ });
    expect(link).toHaveAttribute("href", `/preparations/${PREPARATION_ID}`);
    expect(screen.getByText(/Une préparation active existe pour cette proposition/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Créer la préparation" }),
    ).not.toBeInTheDocument();
  });

  it("refreshes the preparation link on demand", async () => {
    const user = userEvent.setup();
    let preparationReads = 0;
    renderApp(
      PATH,
      routes(buildProposal(), null, {
        [`GET /api/preparations?proposalId=${PROPOSAL_ID}`]: () => {
          preparationReads += 1;
          return preparationReads === 1 ? { status: 404 } : { body: buildPreparation() };
        },
      }),
    );

    await openProposal();
    expect(await screen.findByText("Aucune préparation active")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Actualiser la préparation" }));

    expect(await screen.findByRole("link", { name: /Ouvrir la préparation/ })).toBeInTheDocument();
    expect(preparationReads).toBeGreaterThanOrEqual(2);
  });

  it("creates with only the proposalId, refreshes the proposal and opens the detail", async () => {
    const user = userEvent.setup();
    let proposalReads = 0;
    const { mock } = renderApp(
      PATH,
      routes(buildProposal(), null, {
        [`GET /api/proposals/${PROPOSAL_ID}`]: () => {
          proposalReads += 1;
          return { body: buildProposal() };
        },
        "POST /api/preparations": () => ({ status: 201, body: buildPreparation() }),
        ...DETAIL_ROUTES,
      }),
    );

    await openProposal();

    await user.click(screen.getByRole("button", { name: "Créer la préparation" }));
    expect(await screen.findByText("Créer la préparation — confirmer ?")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/preparations");
    expect(post?.body).toEqual({ proposalId: PROPOSAL_ID });

    // The proposal was re-read from the API before the redirect.
    await waitFor(() => expect(proposalReads).toBeGreaterThanOrEqual(2));

    expect(await screen.findByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
    expect(await screen.findByText("La préparation a été créée.")).toBeInTheDocument();
  });

  it("prevents a double submission and shows the creation loading state", async () => {
    const user = userEvent.setup();
    let resolvePost: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolvePost = resolve;
    });
    const { mock } = renderApp(
      PATH,
      routes(buildProposal(), null, {
        "POST /api/preparations": () => pending,
        ...DETAIL_ROUTES,
      }),
    );

    await openProposal();
    await user.click(screen.getByRole("button", { name: "Créer la préparation" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    const creating = await screen.findByRole("button", { name: /Création…/ });
    expect(creating).toBeDisabled();
    await user.click(creating);

    expect(mock.calls.filter((call) => call.method === "POST")).toHaveLength(1);

    resolvePost?.({ status: 201, body: buildPreparation() });
    expect(await screen.findByRole("heading", { level: 1, name: "Préparation" })).toBeInTheDocument();
  });

  it("reports a 400 without navigating", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), null, {
        "POST /api/preparations": () => ({ status: 400, body: { error: "invalid" } }),
      }),
    );

    await openProposal();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "La création est refusée : les informations envoyées sont invalides.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Mariage Rakoto" })).toBeInTheDocument();
  });

  it("explains that the proposal no longer exists on 404", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), null, {
        "POST /api/preparations": () => ({ status: 404, body: { detail: "proposal not found" } }),
      }),
    );

    await openProposal();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "Cette proposition n'existe plus : la préparation ne peut pas être créée.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a 409 and reloads the proposal on demand", async () => {
    const user = userEvent.setup();
    let proposalReads = 0;
    renderApp(
      PATH,
      routes(buildProposal(), null, {
        [`GET /api/proposals/${PROPOSAL_ID}`]: () => {
          proposalReads += 1;
          return { body: buildProposal() };
        },
        "POST /api/preparations": () => ({
          status: 409,
          body: { error: "a preparation already exists for this proposal" },
        }),
      }),
    );

    await openProposal();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(/une préparation active existe déjà/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Recharger la proposition" }));
    await waitFor(() => expect(proposalReads).toBeGreaterThanOrEqual(2));
  });

  it("ends the session and redirects to login on 401", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal(), null, {
        "POST /api/preparations": () => ({ status: 401 }),
      }),
    );

    await openProposal();
    await askForCreation();
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });

  it("keeps the preparation section available when the proposal is already prepared", async () => {
    // Soft-deleted preparations are invisible to F09, so the page behaves like
    // "no active preparation"; a new creation is still decided by the backend.
    renderApp(PATH, routes(buildProposal(), null));

    await openProposal();

    expect(await screen.findByText("Aucune préparation active")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la préparation" })).toBeInTheDocument();
  });
});
