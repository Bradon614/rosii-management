import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { buildClient, buildDemand, buildProposal, CLIENT_ID, DEMAND_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

function routes(proposals: unknown, extra: Record<string, () => { body?: unknown; status?: number }> = {}) {
  return {
    "GET /api/proposals": () => ({ body: proposals }),
    "GET /api/clients": () => ({ body: [buildClient()] }),
    "GET /api/demands": () => ({ body: [buildDemand()] }),
    ...extra,
  };
}

describe("ProposalsPage — liste (F18 préservé, F21 étendu)", () => {
  it("lists the proposals with client, demand, status, validity and total", async () => {
    const proposal = buildProposal();
    renderApp("/propositions", routes([proposal]));

    expect(await screen.findByRole("heading", { name: "Propositions" })).toBeInTheDocument();
    expect(await screen.findByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Mariage Rakoto")).toBeInTheDocument();
    expect(screen.getByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByText(/Événement · 12 déc\. 2026/)).toBeInTheDocument();
    expect(screen.getAllByText("Acceptée").length).toBeGreaterThan(0);
    expect(screen.getByText("31 déc. 2999")).toBeInTheDocument();
    expect(screen.getAllByText(/500\s000\sAr/).length).toBeGreaterThan(0);
    expect(screen.getByTestId("proposal-count")).toHaveTextContent("1 proposition");

    // F18 behaviour preserved: both entries still lead to the right pages.
    expect(
      screen.getByRole("link", { name: `Ouvrir le dossier de ${proposal.number}` }),
    ).toHaveAttribute("href", `/propositions/${proposal.id}/dossier`);
    expect(
      screen.getByRole("link", { name: `Voir la proposition ${proposal.number}` }),
    ).toHaveAttribute("href", `/propositions/${proposal.id}`);
    expect(screen.getByRole("link", { name: "Nouvelle proposition" })).toHaveAttribute(
      "href",
      "/propositions/new",
    );
  });

  it("shows an explicit empty state with a creation shortcut", async () => {
    renderApp("/propositions", routes([]));

    expect(await screen.findByText("Aucune proposition")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Créer une proposition/ })).toHaveAttribute(
      "href",
      "/propositions/new",
    );
  });
});

describe("ProposalsPage — recherche et filtres", () => {
  it("searches through the backend search parameter", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions", routes([buildProposal()]));

    await screen.findByText("PROP-2026-0001");
    await user.type(screen.getByLabelText("Recherche"), "rakoto");

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/proposals?search=rakoto")).toBe(true),
    );
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions", routes([buildProposal()]));

    await screen.findByText("PROP-2026-0001");
    await user.selectOptions(screen.getByLabelText("Statut"), "DRAFT");

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/proposals?status=DRAFT")).toBe(true),
    );
  });

  it("restricts the list to one demand when opened from the demand record", async () => {
    const user = userEvent.setup();
    renderApp(`/propositions?demandId=${DEMAND_ID}`, {
      "GET /api/proposals": () => ({ body: [buildProposal()] }),
      "GET /api/clients": () => ({ body: [buildClient()] }),
      "GET /api/demands": () => ({ body: [buildDemand()] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: buildDemand() }),
    });

    expect(
      await screen.findByText(/Propositions de la demande — Alice Rakoto · Événement/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retirer le filtre" }));
    await waitFor(() =>
      expect(screen.queryByText(/Propositions de la demande/)).not.toBeInTheDocument(),
    );
  });

  it("reports no result and resets the filters", async () => {
    const user = userEvent.setup();
    renderApp("/propositions", {
      ...routes([buildProposal()]),
      "GET /api/proposals?status=EXPIRED": () => ({ body: [] }),
    });

    await screen.findByText("PROP-2026-0001");
    await user.selectOptions(screen.getByLabelText("Statut"), "EXPIRED");

    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Afficher toutes les propositions" }));
    expect(await screen.findByText("PROP-2026-0001")).toBeInTheDocument();
  });
});

describe("ProposalsPage — erreurs", () => {
  it("shows the API error and retries on demand", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp("/propositions", {
      "GET /api/clients": () => ({ body: [buildClient()] }),
      "GET /api/demands": () => ({ body: [buildDemand()] }),
      "GET /api/proposals": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: "base indisponible" } }
          : { body: [] };
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Aucune proposition")).toBeInTheDocument();
  });

  it("redirects to the login page when the session is missing", async () => {
    renderApp(
      "/propositions",
      { "GET /api/proposals": () => ({ body: [] }) },
      { authenticated: false },
    );

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("shows the client of the proposal through the demand when the client is missing", async () => {
    renderApp("/propositions", {
      "GET /api/proposals": () => ({ body: [buildProposal()] }),
      "GET /api/clients": () => ({ body: [] }),
      "GET /api/demands": () => ({ body: [buildDemand()] }),
    });

    await screen.findByText("PROP-2026-0001");
    const row = screen.getByText("PROP-2026-0001").closest("tr");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Alice Rakoto")).toBeInTheDocument();
    expect(CLIENT_ID).toBeTruthy();
  });
});
