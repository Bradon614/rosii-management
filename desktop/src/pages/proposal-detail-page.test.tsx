import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildDossier,
  buildInvoice,
  buildPayment,
  buildReceipt,
  buildDemand,
  buildProposal,
  CLIENT_ID,
  DEMAND_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";
import type { ProposalStatus } from "@/types/api";

const PATH = `/propositions/${PROPOSAL_ID}`;

function routes(proposal: unknown, extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: proposal }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
    // Feature 22 adds the payments card and the deposit editor to this page.
    [`GET /api/service-dossiers/${PROPOSAL_ID}`]: () => ({
      body: { payments: [], receipts: [], invoices: [] },
    }),
    [`GET /api/preparations?proposalId=${PROPOSAL_ID}`]: () => ({ status: 404 }),
    ...extra,
  };
}

describe("ProposalDetailPage — consultation", () => {
  it("shows the proposal, its demand, its client and its lines", async () => {
    const proposal = buildProposal({
      status: "DRAFT",
      sentAt: null,
      acceptedAt: null,
      validUntil: "2026-12-31",
      notes: "Devis initial",
    });
    renderApp(PATH, routes(proposal));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Brouillon")).toBeInTheDocument();
    expect(screen.getByText(/Valide jusqu'au 31 déc\. 2026/)).toBeInTheDocument();
    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fiche client/ })).toHaveAttribute(
      "href",
      `/clients/${CLIENT_ID}`,
    );
    expect(screen.getByRole("link", { name: /Voir la demande/ })).toHaveAttribute(
      "href",
      `/demandes/${DEMAND_ID}`,
    );
    expect(screen.getByText("Événement")).toBeInTheDocument();
    expect(screen.getByText("Traiteur mariage")).toBeInTheDocument();
    expect(screen.getByTestId("lines-total").textContent).toMatch(/500\s000\sAr/);
    expect(screen.getByText("Devis initial")).toBeInTheDocument();

    // F18 behaviour preserved: the dossier access is still there.
    expect(
      screen.getByRole("link", { name: /Ouvrir le dossier de service/ }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}/dossier`);
  });

  it("handles null values (no notes, no validity date)", async () => {
    const proposal = buildProposal({
      status: "DRAFT",
      sentAt: null,
      acceptedAt: null,
      validUntil: null,
      notes: null,
    });
    renderApp(PATH, routes(proposal));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByText(/Validité non renseignée/)).toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
  });

  it("shows a dedicated message for an unknown proposal", async () => {
    renderApp(PATH, {
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Proposition introuvable")).toBeInTheDocument();
    expect(screen.getByText("Cette proposition n'existe pas ou a été supprimée.")).toBeInTheDocument();
  });
});

describe("ProposalDetailPage — actions autorisées par statut", () => {
  it("offers edition and sending on a DRAFT, but no decision", async () => {
    const proposal = buildProposal({ status: "DRAFT", sentAt: null, acceptedAt: null });
    renderApp(PATH, routes(proposal));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByRole("link", { name: /Modifier/ })).toHaveAttribute(
      "href",
      `/propositions/${PROPOSAL_ID}/edit`,
    );
    expect(screen.getByRole("button", { name: "Envoyer la proposition" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annuler la proposition" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
  });

  it("offers decisions on a SENT proposal, but no sending", async () => {
    const proposal = buildProposal({ status: "SENT", acceptedAt: null });
    renderApp(PATH, routes(proposal));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByRole("button", { name: "Accepter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refuser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repasser en brouillon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marquer expirée" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer la proposition" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Modifier/ })).not.toBeInTheDocument();
  });

  it("offers no transition on a terminal proposal", async () => {
    const proposal = buildProposal({ status: "ACCEPTED" });
    renderApp(PATH, routes(proposal));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(
      screen.getByText(/Cette proposition est dans un état définitif/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accepter" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Envoyer la proposition" })).not.toBeInTheDocument();
  });
});

describe("ProposalDetailPage — transitions", () => {
  it("refuses to send without a validity date, without calling the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes(buildProposal({ status: "DRAFT", sentAt: null, validUntil: null })),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "Envoyer la proposition" }));

    expect(
      screen.getByText(/Renseignez une date de validité .* avant d'envoyer la proposition/),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("asks for confirmation, then sends with the current version", async () => {
    const user = userEvent.setup();
    let status: ProposalStatus = "DRAFT";
    const { mock } = renderApp(PATH, {
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({
        body: buildProposal({ status, sentAt: status === "DRAFT" ? null : "2026-11-08T10:00:00Z" }),
      }),
      [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
      [`PATCH /api/proposals/${PROPOSAL_ID}/status`]: () => {
        status = "SENT";
        return { body: buildProposal({ status: "SENT", acceptedAt: null }) };
      },
    });

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "Envoyer la proposition" }));

    expect(await screen.findByText("Envoyer la proposition — confirmer ?")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PATCH")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PATCH")).toBe(true));
    const patch = mock.calls.find((call) => call.method === "PATCH");
    expect(patch?.url).toBe(`/api/proposals/${PROPOSAL_ID}/status`);
    expect(patch?.body).toEqual({ status: "SENT", version: 3 });
    expect(await screen.findByText(/Le statut est maintenant « Envoyée »/)).toBeInTheDocument();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(buildProposal({ status: "DRAFT", sentAt: null })));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "Envoyer la proposition" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Envoyer la proposition — confirmer ?")).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PATCH")).toBe(false);
  });

  it("explains a conflict and offers to reload", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(buildProposal({ status: "DRAFT", sentAt: null }), {
        [`PATCH /api/proposals/${PROPOSAL_ID}/status`]: () => ({
          status: 409,
          body: { error: "cannot transition proposal" },
        }),
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "Envoyer la proposition" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "Cette proposition a été modifiée entre-temps. Rechargez-la avant de réessayer.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recharger la proposition" }),
    ).toBeInTheDocument();
  });
});

describe("ProposalDetailPage — paiements et dépôt (F22)", () => {
  it("shows the deposit and updates it with the current version", async () => {
    const user = userEvent.setup();
    const draft = buildProposal({ status: "DRAFT", sentAt: null, requiredDeposit: 100000 });
    const { mock } = renderApp(
      PATH,
      routes(draft, {
        [`PATCH /api/proposals/${PROPOSAL_ID}/deposit`]: () => ({
          body: { ...draft, requiredDeposit: 120000, version: 4 },
        }),
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    expect(screen.getByTestId("deposit-value").textContent).toMatch(/100\s000\sAr/);

    await user.click(screen.getByRole("button", { name: "Modifier le dépôt" }));
    const input = screen.getByLabelText("Nouveau dépôt demandé (Ar)");
    await user.clear(input);
    await user.type(input, "120000");
    await user.click(screen.getByRole("button", { name: "Enregistrer le dépôt" }));

    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) =>
            call.method === "PATCH" && call.url === `/api/proposals/${PROPOSAL_ID}/deposit`,
        ),
      ).toBe(true),
    );
    expect(mock.calls.find((call) => call.url.endsWith("/deposit"))?.body).toEqual({
      requiredDeposit: 120000,
      version: 3,
    });
    expect(await screen.findByText("Le dépôt demandé a été mis à jour.")).toBeInTheDocument();
  });

  it("refuses a deposit above the proposal total without calling the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(buildProposal({ status: "DRAFT", sentAt: null })));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "Modifier le dépôt" }));
    const input = screen.getByLabelText("Nouveau dépôt demandé (Ar)");
    await user.clear(input);
    await user.type(input, "600000");
    await user.click(screen.getByRole("button", { name: "Enregistrer le dépôt" }));

    expect(screen.getByText(/ne peut pas dépasser le total de la proposition/)).toBeInTheDocument();
    expect(mock.calls.some((call) => call.url.endsWith("/deposit"))).toBe(false);
  });

  it("locks the deposit once the preparation has started", async () => {
    renderApp(
      PATH,
      routes(buildProposal({ status: "ACCEPTED", acceptedAt: "2026-11-08T10:00:00Z" }), {
        [`GET /api/preparations?proposalId=${PROPOSAL_ID}`]: () => ({
          body: {
            id: "prep-1",
            proposalId: PROPOSAL_ID,
            proposalNumber: "PROP-2026-0001",
            createdAt: "2026-11-08T10:00:00Z",
            updatedAt: "2026-11-08T10:00:00Z",
            version: 0,
          },
        }),
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await screen.findByText(/Le dépôt n'est plus modifiable/);

    expect(screen.queryByRole("button", { name: "Modifier le dépôt" })).not.toBeInTheDocument();
    expect(screen.getByText(/Le dépôt n'est plus modifiable/)).toBeInTheDocument();
  });

  it("lists the payments of the proposal with their documents", async () => {
    const dossier = buildDossier({
      payments: [buildPayment()],
      receipts: [buildReceipt()],
      invoices: [buildInvoice()],
    });
    renderApp(
      PATH,
      routes(buildProposal({ status: "ACCEPTED", acceptedAt: "2026-11-08T10:00:00Z" }), {
        [`GET /api/service-dossiers/${PROPOSAL_ID}`]: () => ({ body: dossier }),
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(await screen.findByText("REC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("FAC-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "PDF de la facture FAC-2026-0001" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/150\s000\sAr/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("link", { name: /Enregistrer un paiement/ }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}/paiements/new`);
    expect(screen.getByRole("link", { name: /Voir le paiement de/ })).toBeInTheDocument();
  });

  it("shows no payment action on a non-accepted proposal", async () => {
    renderApp(PATH, routes(buildProposal({ status: "DRAFT", sentAt: null })));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(await screen.findByText("Aucun paiement")).toBeInTheDocument();
    expect(screen.getByText(/Seule une proposition acceptée peut recevoir des paiements/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Enregistrer un paiement/ })).not.toBeInTheDocument();
  });

  it("hides the payment action when the proposal is fully paid", async () => {
    renderApp(
      PATH,
      routes(buildProposal({ status: "ACCEPTED", totalPaid: 500000, remainingAmount: 0 })),
    );

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.queryByRole("link", { name: /Enregistrer un paiement/ })).not.toBeInTheDocument();
  });
});
