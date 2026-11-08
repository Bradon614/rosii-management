import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildProposal } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

describe("ProposalsPage", () => {
  it("lists the proposals and offers a direct link to each service dossier", async () => {
    const proposal = buildProposal();
    renderApp("/propositions", {
      "GET /api/proposals": () => ({ body: [proposal] }),
    });

    expect(await screen.findByRole("heading", { name: "Propositions" })).toBeInTheDocument();
    expect(await screen.findByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Mariage Rakoto")).toBeInTheDocument();
    expect(screen.getByText("Acceptée")).toBeInTheDocument();

    const dossierLink = screen.getByRole("link", { name: /Dossier/ });
    expect(dossierLink).toHaveAttribute("href", `/propositions/${proposal.id}/dossier`);

    const detailsLink = screen.getByRole("link", { name: "Détails" });
    expect(detailsLink).toHaveAttribute("href", `/propositions/${proposal.id}`);
  });

  it("shows an explicit empty state when there is no proposal", async () => {
    renderApp("/propositions", {
      "GET /api/proposals": () => ({ body: [] }),
    });

    expect(await screen.findByText("Aucune proposition")).toBeInTheDocument();
  });

  it("shows the API error and retries on demand", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { mock } = renderApp("/propositions", {
      "GET /api/proposals": () => {
        attempts += 1;
        return attempts === 1
          ? { status: 500, body: { error: "base indisponible" } }
          : { body: [] };
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByText("base indisponible")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Aucune proposition")).toBeInTheDocument();
    await waitFor(() => {
      expect(mock.calls.filter((call) => call.url === "/api/proposals")).toHaveLength(2);
    });
  });

  it("redirects to the login page when the session is missing", async () => {
    renderApp(
      "/propositions",
      { "GET /api/proposals": () => ({ body: [] }) },
      { authenticated: false },
    );

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});
