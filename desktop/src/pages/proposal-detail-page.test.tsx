import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { buildProposal, PROPOSAL_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

describe("ProposalDetailPage", () => {
  it("shows the proposal and links to its service dossier", async () => {
    renderApp(`/propositions/${PROPOSAL_ID}`, {
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ body: buildProposal() }),
    });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getByText("PROP-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Traiteur mariage")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: /Ouvrir le dossier de service/ }),
    ).toHaveAttribute("href", `/propositions/${PROPOSAL_ID}/dossier`);
  });

  it("shows a dedicated message for a proposal that does not exist", async () => {
    renderApp(`/propositions/${PROPOSAL_ID}`, {
      [`GET /api/proposals/${PROPOSAL_ID}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Proposition introuvable")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retour aux propositions" })).toHaveAttribute(
      "href",
      "/propositions",
    );
  });
});
