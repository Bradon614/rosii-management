import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import {
  buildClient,
  buildPayment,
  buildProposal,
  PAYMENT_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";

const PAYMENT = buildPayment();

function routes(payments: unknown, extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    "GET /api/payments": () => ({ body: payments }),
    "GET /api/proposals": () => ({ body: [buildProposal()] }),
    "GET /api/clients": () => ({ body: [buildClient()] }),
    ...extra,
  };
}

describe("PaymentsPage — liste", () => {
  it("lists the payments with their proposal, client, amount, method and reference", async () => {
    renderApp("/paiements", routes([PAYMENT]));

    expect(await screen.findByRole("heading", { name: "Paiements" })).toBeInTheDocument();
    expect(await screen.findByText("5 oct. 2026")).toBeInTheDocument();
    expect(screen.getByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getAllByText(/150\s000\sAr/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Espèces").length).toBeGreaterThan(0);
    expect(screen.getByText("Caisse 1")).toBeInTheDocument();
    expect(screen.getByTestId("payment-count")).toHaveTextContent("1 paiement");
    expect(screen.getByRole("link", { name: /Voir le paiement de/ })).toHaveAttribute(
      "href",
      `/paiements/${PAYMENT_ID}`,
    );

    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Paiements" })).toHaveAttribute(
      "href",
      "/paiements",
    );
  });

  it("shows an explicit empty state", async () => {
    renderApp("/paiements", routes([]));

    expect(await screen.findByText("Aucun paiement")).toBeInTheDocument();
  });

  it("filters by payment method through the backend parameter", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      "/paiements",
      routes([PAYMENT], { "GET /api/payments?method=CASH": () => ({ body: [PAYMENT] }) }),
    );

    await screen.findByText("PROP-2026-0001");
    await user.selectOptions(screen.getByLabelText("Méthode"), "CASH");

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/payments?method=CASH")).toBe(true),
    );
  });

  it("restricts the list to one proposal and can remove the filter", async () => {
    const user = userEvent.setup();
    renderApp(`/paiements?proposalId=${PROPOSAL_ID}`, {
      "GET /api/payments": () => ({ body: [PAYMENT] }),
      "GET /api/proposals": () => ({ body: [buildProposal()] }),
      "GET /api/clients": () => ({ body: [buildClient()] }),
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
    });

    expect(await screen.findByText(/Paiements de la proposition PROP-2026-0001/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer le filtre" }));
    await waitFor(() =>
      expect(screen.queryByText(/Paiements de la proposition/)).not.toBeInTheDocument(),
    );
  });
});

describe("PaymentsPage — erreurs", () => {
  it("shows the API error and retries", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp("/paiements", {
      "GET /api/proposals": () => ({ body: [] }),
      "GET /api/clients": () => ({ body: [] }),
      "GET /api/payments": () => {
        attempts += 1;
        return attempts === 1 ? { status: 500, body: { error: "boom" } } : { body: [] };
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Aucun paiement")).toBeInTheDocument();
  });

  it("redirects to login on 401", async () => {
    renderApp("/paiements", routes([], { "GET /api/payments": () => ({ status: 401 }) }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("reports an unreachable API", async () => {
    renderApp("/paiements", {
      ...routes([]),
      "GET /api/payments": () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await screen.findByText(/Impossible de joindre le serveur/)).toBeInTheDocument();
  });
});
