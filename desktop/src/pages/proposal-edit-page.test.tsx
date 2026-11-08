import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildDemand,
  buildProposal,
  CLIENT_ID,
  DEMAND_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const PATH = `/propositions/${PROPOSAL_ID}/edit`;

function routes(proposal: unknown, extra: Record<string, () => unknown> = {}) {
  return {
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: proposal }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    "GET /api/demands": () => ({ body: [buildDemand()] }),
    [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
    "GET /api/services": () => ({ body: [] }),
    ...extra,
  };
}

describe("ProposalEditPage — chargement", () => {
  it("prefills the form with the draft content", async () => {
    const proposal = buildProposal({
      status: "DRAFT",
      sentAt: null,
      acceptedAt: null,
      validUntil: "2026-12-31",
      notes: "Devis initial",
    });
    renderApp(PATH, routes(proposal));

    await waitFor(() => expect(screen.getByLabelText(/^Demande/)).toHaveValue(DEMAND_ID));
    expect(screen.getByLabelText("Titre")).toHaveValue("Mariage Rakoto");
    expect(screen.getByLabelText("Date de validité")).toHaveValue("2026-12-31");
    expect(screen.getByLabelText("Notes")).toHaveValue("Devis initial");
    expect(screen.getByLabelText(/^Dépôt demandé/)).toHaveValue("100000");
    expect(screen.getByLabelText(/^Description/)).toHaveValue("Traiteur mariage");
    expect(screen.getByLabelText(/^Quantité/)).toHaveValue("2");
    expect(screen.getByLabelText(/^Prix unitaire/)).toHaveValue("250000");
  });

  it("refuses to edit a proposal that is no longer a draft", async () => {
    renderApp(PATH, routes(buildProposal({ status: "SENT" })));

    expect(await screen.findByText("Modification impossible")).toBeInTheDocument();
    expect(screen.queryByLabelText("Titre")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la proposition" })).toHaveAttribute(
      "href",
      `/propositions/${PROPOSAL_ID}`,
    );
  });

  it("shows a dedicated message for an unknown proposal", async () => {
    renderApp(PATH, {
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Proposition introuvable")).toBeInTheDocument();
  });
});

describe("ProposalEditPage — enregistrement", () => {
  it("puts the full payload with the loaded version", async () => {
    const user = userEvent.setup();
    const draft = buildProposal({ status: "DRAFT", sentAt: null, acceptedAt: null });
    const updated = { ...draft, title: "Mariage Rakoto — v2", version: 4 };
    const { mock } = renderApp(PATH, routes(draft, {
      [`PUT /api/proposals/${PROPOSAL_ID}`]: () => ({ body: updated }),
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: draft }),
    }));

    const title = await screen.findByLabelText("Titre");
    await user.clear(title);
    await user.type(title, "Mariage Rakoto — v2");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/proposals/${PROPOSAL_ID}`);
    expect(put?.body).toMatchObject({
      version: 3,
      clientId: CLIENT_ID,
      demandId: DEMAND_ID,
      title: "Mariage Rakoto — v2",
      validUntil: "2999-12-31",
      requiredDeposit: 100000,
    });
    expect((put?.body as { lines: unknown[] }).lines).toHaveLength(1);

    expect(await screen.findByText(/Les modifications ont été enregistrées/)).toBeInTheDocument();
  });

  it("keeps the form and explains a version conflict (409)", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal({ status: "DRAFT", sentAt: null, acceptedAt: null }), {
        [`PUT /api/proposals/${PROPOSAL_ID}`]: () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    const title = await screen.findByLabelText("Titre");
    await user.clear(title);
    await user.type(title, "Écrasement");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText(
        "Cette proposition a été modifiée entre-temps. Rechargez-la avant de réessayer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger la proposition" })).toBeInTheDocument();
    expect(screen.getByLabelText("Titre")).toHaveValue("Écrasement");
  });

  it("still applies the client-side validation", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes(buildProposal({ status: "DRAFT", sentAt: null, acceptedAt: null })),
    );

    const title = await screen.findByLabelText("Titre");
    await user.clear(title);
    const deposit = screen.getByLabelText(/^Dépôt demandé/);
    await user.clear(deposit);
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(screen.getByText("Saisissez le dépôt demandé.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
