import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";

import {
  buildDossier,
  buildInvoice,
  buildPayment,
  buildProposal,
  buildReceipt,
  CLIENT_ID,
  INVOICE_ID,
  normalizeSpaces,
  PREPARATION_ID,
  PROPOSAL_ID,
  RECEIPT_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const DOSSIER_PATH = `/api/service-dossiers/${PROPOSAL_ID}`;
const DOSSIER_ROUTE = `/propositions/${PROPOSAL_ID}/dossier`;

function dossierRoutes(body: unknown) {
  return { [`GET ${DOSSIER_PATH}`]: () => ({ body }) };
}

describe("ServiceDossierPage — dossier complet", () => {
  it("renders the header, the client and the proposal status", async () => {
    renderApp(DOSSIER_ROUTE, dossierRoutes(buildDossier()));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText(/Dossier de service · Alice Rakoto/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Retour aux propositions/ })).toHaveAttribute(
      "href",
      "/propositions",
    );
    expect(screen.getByRole("link", { name: /Voir la proposition/ })).toHaveAttribute(
      "href",
      `/propositions/${PROPOSAL_ID}`,
    );
    // Feature 19 added the client screens, so the dossier links to the record.
    expect(screen.getByRole("link", { name: /Fiche client/ })).toHaveAttribute(
      "href",
      `/clients/${CLIENT_ID}`,
    );
  });

  it("shows the financial summary exactly as the API returns it", async () => {
    // `remainingAmount` deliberately does not equal total − paid: the page must
    // display the API value, never recompute it.
    const dossier = buildDossier({
      proposal: buildProposal({ totalPaid: 150000, remainingAmount: 424242 }),
    });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(normalizeSpaces(screen.getByTestId("kpi-total").textContent)).toBe("500 000 Ar");
    expect(normalizeSpaces(screen.getByTestId("kpi-deposit").textContent)).toBe("100 000 Ar");
    expect(normalizeSpaces(screen.getByTestId("kpi-paid").textContent)).toBe("150 000 Ar");
    expect(normalizeSpaces(screen.getByTestId("kpi-remaining").textContent)).toBe("424 242 Ar");
    expect(screen.getByText("Dépôt atteint")).toBeInTheDocument();
  });

  it("renders the proposal lines with their snapshot prices and total", async () => {
    renderApp(DOSSIER_ROUTE, dossierRoutes(buildDossier()));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByText("Traiteur mariage")).toBeInTheDocument();
    expect(screen.getByText("personne")).toBeInTheDocument();
    expect(normalizeSpaces(screen.getByTestId("lines-total").textContent)).toBe("500 000 Ar");
  });

  it("renders payments, receipts, invoices, preparation, execution and closure", async () => {
    renderApp(DOSSIER_ROUTE, dossierRoutes(buildDossier()));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    // Payment and its receipt.
    expect(screen.getByText("Espèces")).toBeInTheDocument();
    expect(screen.getByText("Caisse 1")).toBeInTheDocument();
    expect(screen.getByText("REC-2026-0001")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" })).toBeInTheDocument();

    // Invoice with its PDF action.
    expect(screen.getByText("FAC-2026-0001")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "PDF de la facture FAC-2026-0001" }),
    ).toBeInTheDocument();

    // Preparation, execution and closure.
    expect(screen.getByText("Préparation ouverte le")).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.getByText("18:00 – 23:30")).toBeInTheDocument();
    expect(screen.getByText("Clôturée")).toBeInTheDocument();
    expect(screen.getByText("Prestation terminée sans incident")).toBeInTheDocument();
  });

  it("calls the dossier endpoint once and only reloads on demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(DOSSIER_ROUTE, dossierRoutes(buildDossier()));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    const dossierCalls = () => mock.calls.filter((call) => call.url === DOSSIER_PATH);
    expect(dossierCalls()).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: /Actualiser/ }));
    await waitFor(() => expect(dossierCalls()).toHaveLength(2));
  });

  it("links the preparation section to its F23 detail page", async () => {
    renderApp(DOSSIER_ROUTE, dossierRoutes(buildDossier()));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByRole("link", { name: /Ouvrir la préparation/ })).toHaveAttribute(
      "href",
      `/preparations/${PREPARATION_ID}`,
    );
  });
});

describe("ServiceDossierPage — sections manquantes", () => {
  it("reports zero paid and explicit empty sections when there is no payment", async () => {
    const dossier = buildDossier({
      payments: [],
      receipts: [],
      invoices: [],
      proposal: buildProposal({ totalPaid: 0, remainingAmount: 500000, depositReached: false }),
      preparation: null,
      execution: null,
      closure: null,
    });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(normalizeSpaces(screen.getByTestId("kpi-paid").textContent)).toBe("0 Ar");
    expect(screen.getByText("Dépôt non atteint")).toBeInTheDocument();
    expect(screen.getByText("Aucun paiement")).toBeInTheDocument();
    expect(screen.getByText("Aucune facture")).toBeInTheDocument();
    expect(screen.getByText("Aucune préparation")).toBeInTheDocument();
    expect(screen.getByText("Aucune exécution")).toBeInTheDocument();
    expect(screen.getByText("Aucune clôture enregistrée")).toBeInTheDocument();
  });

  it("keeps the empty states independent: an execution without closure is not a closure", async () => {
    const dossier = buildDossier({ closure: null });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    // The execution is COMPLETED...
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    // ...but the closure stays absent and says so.
    expect(screen.getByText("Aucune clôture enregistrée")).toBeInTheDocument();
    expect(screen.queryByText("Clôturée")).not.toBeInTheDocument();
  });

  it("hides the preparation, execution and closure sections when they do not exist", async () => {
    const dossier = buildDossier({ preparation: null, execution: null, closure: null });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByText("Aucune préparation")).toBeInTheDocument();
    expect(screen.getByText("Aucune exécution")).toBeInTheDocument();
    expect(screen.getByText("Aucune clôture enregistrée")).toBeInTheDocument();
  });
});

describe("ServiceDossierPage — plusieurs documents", () => {
  it("groups several payments and their receipts, and lists every invoice", async () => {
    const secondPaymentId = "44444444-4444-4444-4444-444444444445";
    const secondReceiptId = "55555555-5555-5555-5555-555555555556";
    const secondInvoiceId = "66666666-6666-6666-6666-666666666667";

    const dossier = buildDossier({
      payments: [
        buildPayment(),
        buildPayment({
          id: secondPaymentId,
          amount: 200000,
          method: "MOBILE_MONEY",
          paymentDate: "2026-11-02",
          reference: "Mvola 42",
        }),
      ],
      receipts: [
        buildReceipt(),
        buildReceipt({
          id: secondReceiptId,
          paymentId: secondPaymentId,
          receiptNumber: "REC-2026-0002",
          amount: 200000,
          paymentMethod: "MOBILE_MONEY",
          paymentDate: "2026-11-02",
        }),
      ],
      invoices: [
        buildInvoice(),
        buildInvoice({
          id: secondInvoiceId,
          paymentId: secondPaymentId,
          invoiceNumber: "FAC-2026-0002",
          amount: 200000,
          paymentDate: "2026-11-02",
        }),
      ],
    });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByText("2 paiements enregistrés")).toBeInTheDocument();
    expect(screen.getByText("2 factures émises")).toBeInTheDocument();
    expect(screen.getByText("REC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("REC-2026-0002")).toBeInTheDocument();
    expect(screen.getByText("FAC-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("FAC-2026-0002")).toBeInTheDocument();
    expect(screen.getByText("Mobile Money")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "PDF du reçu REC-2026-0002" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "PDF de la facture FAC-2026-0002" }),
    ).toBeInTheDocument();
  });

  it("says a payment has no receipt instead of inventing one", async () => {
    const dossier = buildDossier({ receipts: [] });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.getByText("Aucun reçu émis pour ce paiement.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PDF du reçu/ })).not.toBeInTheDocument();
  });
});

describe("ServiceDossierPage — valeurs nulles", () => {
  it("omits absent optional fields instead of showing empty rows", async () => {
    const dossier = buildDossier({
      client: {
        ...buildDossier().client,
        phone2: null,
        email: null,
      },
      demand: {
        ...buildDossier().demand,
        requestedDate: null,
        estimatedPeople: null,
        location: null,
        notes: null,
      },
      execution: {
        ...buildDossier().execution!,
        startTime: null,
        endTime: null,
        location: null,
        notes: null,
      },
    });
    renderApp(DOSSIER_ROUTE, dossierRoutes(dossier));

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });

    expect(screen.queryByText("Téléphone secondaire")).not.toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("Date demandée")).not.toBeInTheDocument();
    expect(screen.queryByText("Nombre de personnes")).not.toBeInTheDocument();
    expect(screen.queryByText("Localisation")).not.toBeInTheDocument();
    expect(screen.queryByText("Horaires")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    // The values that do exist are still displayed.
    expect(screen.getByText("Téléphone principal")).toBeInTheDocument();
  });
});

describe("ServiceDossierPage — erreurs", () => {
  it("shows a dedicated message for a 404", async () => {
    renderApp(DOSSIER_ROUTE, {
      [`GET ${DOSSIER_PATH}`]: () => ({ status: 404, body: { detail: "proposal not found" } }),
    });

    expect(await screen.findByText("Dossier introuvable")).toBeInTheDocument();
    expect(
      screen.getByText(/Cette proposition n'existe pas ou a été supprimée/),
    ).toBeInTheDocument();
  });

  it("ends the session and redirects to login on 401", async () => {
    renderApp(DOSSIER_ROUTE, {
      [`GET ${DOSSIER_PATH}`]: () => ({ status: 401, body: { detail: "Token expired" } }),
    });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("ServiceDossierPage — téléchargement des PDF", () => {
  it("downloads the receipt PDF with the bearer token", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(DOSSIER_ROUTE, {
      ...dossierRoutes(buildDossier()),
      [`GET /api/payment-receipts/${RECEIPT_ID}/pdf`]: () => ({
        blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        headers: { "Content-Disposition": 'attachment; filename="REC-2026-0001.pdf"' },
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" }));

    await waitFor(() => {
      expect(
        mock.calls.some((call) => call.url === `/api/payment-receipts/${RECEIPT_ID}/pdf`),
      ).toBe(true);
    });
    const pdfCall = mock.calls.find(
      (call) => call.url === `/api/payment-receipts/${RECEIPT_ID}/pdf`,
    );
    expect(pdfCall?.headers.get("Authorization")).toBe("Bearer test-jwt-token");
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("downloads the invoice PDF", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(DOSSIER_ROUTE, {
      ...dossierRoutes(buildDossier()),
      [`GET /api/invoices/${INVOICE_ID}/pdf`]: () => ({
        blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      }),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "PDF de la facture FAC-2026-0001" }));

    await waitFor(() => {
      expect(mock.calls.some((call) => call.url === `/api/invoices/${INVOICE_ID}/pdf`)).toBe(
        true,
      );
    });
  });

  it("shows a readable error when a document is gone", async () => {
    const user = userEvent.setup();
    renderApp(DOSSIER_ROUTE, {
      ...dossierRoutes(buildDossier()),
      [`GET /api/payment-receipts/${RECEIPT_ID}/pdf`]: () => ({ status: 404 }),
    });

    await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" });
    await user.click(screen.getByRole("button", { name: "PDF du reçu REC-2026-0001" }));

    expect(await screen.findByText("Ce document n'existe plus.")).toBeInTheDocument();
  });
});
