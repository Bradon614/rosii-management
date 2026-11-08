import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildPayment,
  buildProposal,
  CLIENT_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";

const ACCEPTED = buildProposal({
  status: "ACCEPTED",
  requiredDeposit: 100000,
  totalPaid: 150000,
  remainingAmount: 350000,
  depositReached: true,
});

const CREATED = buildPayment({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  proposalId: PROPOSAL_ID,
  amount: 200000,
});

const PATH = `/propositions/${PROPOSAL_ID}/paiements/new`;

function routes(proposal: unknown, extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: proposal }),
    "POST /api/payments": () => ({ status: 201, body: CREATED }),
    [`GET /api/payments/${CREATED.id}`]: () => ({ body: CREATED }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    [`GET /api/payment-receipts?paymentId=${CREATED.id}`]: () => ({ body: [] }),
    [`GET /api/invoices?paymentId=${CREATED.id}`]: () => ({ body: [] }),
    ...extra,
  };
}

async function fill(user: ReturnType<typeof userEvent.setup>, amount = "200000") {
  await user.type(await screen.findByLabelText(/^Montant/), amount);
  await user.selectOptions(screen.getByLabelText(/^Méthode de paiement/), "MOBILE_MONEY");
}

describe("PaymentCreatePage — garde-fous", () => {
  it("shows a dedicated message for an unknown proposal", async () => {
    renderApp(PATH, { [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ status: 404 }) });

    expect(await screen.findByText("Proposition introuvable")).toBeInTheDocument();
  });

  it("refuses a proposal that is not accepted", async () => {
    renderApp(PATH, routes(buildProposal({ status: "DRAFT", sentAt: null })));

    expect(await screen.findByText("Paiement impossible")).toBeInTheDocument();
    expect(screen.getByText(/Seule une proposition acceptée/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Montant/)).not.toBeInTheDocument();
  });

  it("refuses an already fully paid proposal", async () => {
    renderApp(
      PATH,
      routes(
        buildProposal({ status: "ACCEPTED", totalPaid: 500000, remainingAmount: 0 }),
      ),
    );

    expect(await screen.findByText("Proposition entièrement payée")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Montant/)).not.toBeInTheDocument();
  });
});

describe("PaymentCreatePage — validation", () => {
  it("requires a strictly positive amount and a method", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(ACCEPTED));

    await user.click(await screen.findByRole("button", { name: "Enregistrer le paiement" }));

    expect(screen.getByText("Saisissez le montant du paiement.")).toBeInTheDocument();
    expect(screen.getByText("Sélectionnez la méthode de paiement.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("rejects a zero amount before the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(ACCEPTED));

    await fill(user, "0");
    await user.click(screen.getByRole("button", { name: "Enregistrer le paiement" }));

    expect(screen.getByText("Le montant doit être supérieur à zéro.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("rejects an amount above the remaining", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(ACCEPTED));

    await fill(user, "400000");
    await user.click(screen.getByRole("button", { name: "Enregistrer le paiement" }));

    expect(screen.getByText(/ne peut pas dépasser le reste à payer \(350/)).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });
});

describe("PaymentCreatePage — création", () => {
  it("posts the payment and opens its detail page", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(ACCEPTED));

    await fill(user, "200000");
    await user.type(screen.getByLabelText("Référence"), "Mvola 99");
    await user.click(screen.getByRole("button", { name: "Enregistrer le paiement" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/payments");
    expect(post?.body).toMatchObject({
      proposalId: PROPOSAL_ID,
      amount: 200000,
      method: "MOBILE_MONEY",
      reference: "Mvola 99",
    });
    expect((post?.body as { paymentDate: string }).paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(await screen.findByText(/Le paiement de 200\s000\sAr a été enregistré/)).toBeInTheDocument();
  });

  it("sends a bank transfer payment", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, routes(ACCEPTED));

    await user.type(await screen.findByLabelText(/^Montant/), "50000");
    await user.selectOptions(screen.getByLabelText(/^Méthode de paiement/), "BANK_TRANSFER");
    await user.click(screen.getByRole("button", { name: "Enregistrer le paiement" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    expect(
      (mock.calls.find((call) => call.method === "POST")?.body as { method: string }).method,
    ).toBe("BANK_TRANSFER");
  });

  it("shows the backend refusal and stays on the form", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      routes(ACCEPTED, {
        "POST /api/payments": () => ({ status: 409, body: { error: "conflict" } }),
      }),
    );

    await fill(user, "100000");
    await user.click(screen.getByRole("button", { name: "Enregistrer le paiement" }));

    expect(
      await screen.findByText(/Le paiement a été refusé : la proposition n'est pas acceptée/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger la proposition" })).toBeInTheDocument();
  });
});
