import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildInvoice,
  buildPayment,
  buildProposal,
  buildReceipt,
  CLIENT_ID,
  INVOICE_ID,
  PAYMENT_ID,
  PROPOSAL_ID,
  RECEIPT_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";

const PAYMENT = buildPayment({ notes: "Encaissé en boutique", version: 0 });
const PATH = `/paiements/${PAYMENT_ID}`;

function routes(extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    [`GET /api/payments/${PAYMENT_ID}`]: () => ({ body: PAYMENT }),
    [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal({ status: "ACCEPTED" }) }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    [`GET /api/payment-receipts?paymentId=${PAYMENT_ID}`]: () => ({ body: [buildReceipt()] }),
    [`GET /api/invoices?paymentId=${PAYMENT_ID}`]: () => ({ body: [buildInvoice()] }),
    ...extra,
  };
}

describe("PaymentDetailPage — consultation", () => {
  it("shows the payment, its proposal and the issued documents", async () => {
    renderApp(PATH, routes());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Paiement du 5 oct. 2026" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Encaissé en boutique")).toBeInTheDocument();
    expect(screen.getAllByText("PROP-2026-0001").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/150\s000\sAr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Espèces").length).toBeGreaterThan(0);
    expect(screen.getByText("Caisse 1")).toBeInTheDocument();
    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ouvrir la proposition" })).toHaveAttribute(
      "href",
      `/propositions/${PROPOSAL_ID}`,
    );

    // Existing documents with their F14 PDF actions.
    expect(await screen.findByText("REC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("FAC-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "PDF de la facture FAC-2026-0001" }),
    ).toBeInTheDocument();
  });

  it("hides null values and reports missing documents", async () => {
    renderApp(
      PATH,
      routes({
        [`GET /api/payments/${PAYMENT_ID}`]: () => ({
          body: { ...PAYMENT, reference: null, notes: null },
        }),
        [`GET /api/payment-receipts?paymentId=${PAYMENT_ID}`]: () => ({ body: [] }),
        [`GET /api/invoices?paymentId=${PAYMENT_ID}`]: () => ({ body: [] }),
      }),
    );

    await screen.findByRole("heading", { level: 1, name: "Paiement du 5 oct. 2026" });

    expect(screen.queryByText("Référence")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(await screen.findByText("Aucun reçu émis")).toBeInTheDocument();
    expect(screen.getByText("Aucune facture émise")).toBeInTheDocument();
  });

  it("shows a dedicated message for an unknown payment", async () => {
    renderApp(PATH, { [`GET /api/payments/${PAYMENT_ID}`]: () => ({ status: 404 }) });

    expect(await screen.findByText("Paiement introuvable")).toBeInTheDocument();
    expect(screen.getByText("Ce paiement n'existe pas ou a été supprimé.")).toBeInTheDocument();
  });
});

describe("PaymentDetailPage — PDF", () => {
  it("downloads the receipt PDF through the authenticated endpoint", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes({
        [`GET /api/payment-receipts/${RECEIPT_ID}/pdf`]: () => ({
          blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        }),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await screen.findByText("REC-2026-0001");
    await user.click(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" }));

    await waitFor(() =>
      expect(
        mock.calls.some((call) => call.url === `/api/payment-receipts/${RECEIPT_ID}/pdf`),
      ).toBe(true),
    );
  });

  it("downloads the invoice PDF through the authenticated endpoint", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      routes({
        [`GET /api/invoices/${INVOICE_ID}/pdf`]: () => ({
          blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        }),
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await screen.findByText("FAC-2026-0001");
    await user.click(screen.getByRole("button", { name: "PDF de la facture FAC-2026-0001" }));

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === `/api/invoices/${INVOICE_ID}/pdf`)).toBe(true),
    );
  });
});
