import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { buildClient, buildDemand, CLIENT_ID, DEMAND_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const ALICE_DEMAND = buildDemand();

const BOB_DEMAND = buildDemand({
  id: "33333333-3333-3333-3333-33333333333b",
  clientId: "22222222-2222-2222-2222-22222222222b",
  clientName: "Bob Example",
  type: "CATERING",
  status: "NEW",
  requestedDate: null,
  estimatedPeople: null,
  budgetType: "NONE",
  budgetMin: null,
  budgetMax: null,
});

describe("DemandsPage — liste", () => {
  it("lists the demands with client, type, status, date, people and budget", async () => {
    renderApp("/demandes", { "GET /api/demands": () => ({ body: [ALICE_DEMAND, BOB_DEMAND] }) });

    expect(await screen.findByRole("heading", { name: "Demandes" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByText("Bob Example")).toBeInTheDocument();
    expect(screen.getAllByText("Événement").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Traiteur").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Acceptée").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Nouvelle").length).toBeGreaterThan(0);
    expect(screen.getByText("12 déc. 2026")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/400\s000\sAr\s–\s600\s000\sAr/)).toBeInTheDocument();
    expect(screen.getByTestId("demand-count")).toHaveTextContent("2 demandes");

    expect(screen.getByRole("link", { name: "Voir la demande de Alice Rakoto" })).toHaveAttribute(
      "href",
      `/demandes/${DEMAND_ID}`,
    );
    expect(
      screen.getByRole("link", { name: "Modifier la demande de Alice Rakoto" }),
    ).toHaveAttribute("href", `/demandes/${DEMAND_ID}/edit`);
    expect(screen.getByRole("link", { name: "Nouvelle demande" })).toHaveAttribute(
      "href",
      "/demandes/new",
    );
  });

  it("offers a Demandes entry in the main navigation", async () => {
    renderApp("/demandes", { "GET /api/demands": () => ({ body: [] }) });

    await screen.findByRole("heading", { name: "Demandes" });
    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Demandes" })).toHaveAttribute(
      "href",
      "/demandes",
    );
  });

  it("shows an explicit empty state with a creation shortcut", async () => {
    renderApp("/demandes", { "GET /api/demands": () => ({ body: [] }) });

    expect(await screen.findByText("Aucune demande")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Créer une demande/ })).toHaveAttribute(
      "href",
      "/demandes/new",
    );
  });
});

describe("DemandsPage — filtres", () => {
  it("searches through the backend search parameter", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes", {
      "GET /api/demands": () => ({ body: [ALICE_DEMAND] }),
      "GET /api/demands?search=rakoto": () => ({ body: [ALICE_DEMAND] }),
    });

    await screen.findByText("Alice Rakoto");
    await user.type(screen.getByLabelText("Recherche"), "rakoto");

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/demands?search=rakoto")).toBe(true),
    );
  });

  it("filters by type and by status", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes", {
      "GET /api/demands": () => ({ body: [ALICE_DEMAND, BOB_DEMAND] }),
      "GET /api/demands?type=CATERING": () => ({ body: [BOB_DEMAND] }),
      "GET /api/demands?status=ACCEPTED": () => ({ body: [ALICE_DEMAND] }),
    });

    await screen.findByText("Bob Example");

    await user.selectOptions(screen.getByLabelText("Type"), "CATERING");
    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/demands?type=CATERING")).toBe(true),
    );

    await user.selectOptions(screen.getByLabelText("Statut"), "ACCEPTED");
    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) => call.url === "/api/demands?type=CATERING&status=ACCEPTED",
        ),
      ).toBe(true),
    );
  });

  it("reports no result and resets the filters", async () => {
    const user = userEvent.setup();
    renderApp("/demandes", {
      "GET /api/demands": () => ({ body: [ALICE_DEMAND] }),
      "GET /api/demands?type=FLORIST": () => ({ body: [] }),
    });

    await screen.findByText("Alice Rakoto");
    await user.selectOptions(screen.getByLabelText("Type"), "FLORIST");

    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réinitialiser les filtres" }));

    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
  });

  it("restricts the list to one client when opened from the client record", async () => {
    const user = userEvent.setup();
    renderApp(`/demandes?clientId=${CLIENT_ID}`, {
      [`GET /api/demands?clientId=${CLIENT_ID}`]: () => ({ body: [ALICE_DEMAND] }),
      [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    });

    expect(await screen.findByText(/Demandes du client « Alice Rakoto »/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer le filtre" }));

    await waitFor(() =>
      expect(screen.queryByText(/Demandes du client/)).not.toBeInTheDocument(),
    );
  });
});

describe("DemandsPage — erreurs", () => {
  it("shows the API error and retries on demand", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp("/demandes", {
      "GET /api/demands": () => {
        attempts += 1;
        return attempts === 1 ? { status: 500, body: { error: "base indisponible" } } : { body: [] };
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByText("base indisponible")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("Aucune demande")).toBeInTheDocument();
  });

  it("reports an unreachable API", async () => {
    renderApp("/demandes", {
      "GET /api/demands": () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByText(/Impossible de joindre le serveur/)).toBeInTheDocument();
  });

  it("redirects to the login page when the session has expired", async () => {
    renderApp("/demandes", { "GET /api/demands": () => ({ status: 401 }) });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("DemandsPage — suppression", () => {
  it("asks for confirmation, deletes only on confirm and refreshes the list", async () => {
    const user = userEvent.setup();
    let deleted = false;
    const { mock } = renderApp("/demandes", {
      "GET /api/demands": () => ({ body: deleted ? [] : [ALICE_DEMAND] }),
      [`DELETE /api/demands/${DEMAND_ID}`]: () => {
        deleted = true;
        return { status: 204 };
      },
    });

    await screen.findByText("Alice Rakoto");
    await user.click(
      screen.getByRole("button", { name: "Supprimer la demande de Alice Rakoto" }),
    );

    expect(
      screen.getByRole("alertdialog", { name: "Supprimer la demande de Alice Rakoto" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Supprimer la demande de « Alice Rakoto » \?/),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: /Confirmer la suppression/ }));

    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) => call.method === "DELETE" && call.url === `/api/demands/${DEMAND_ID}`,
        ),
      ).toBe(true),
    );
    expect(
      await screen.findByText(/La demande de « Alice Rakoto » a été supprimée/),
    ).toBeInTheDocument();
    expect(await screen.findByText("Aucune demande")).toBeInTheDocument();
  });

  it("does nothing when the deletion is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes", {
      "GET /api/demands": () => ({ body: [ALICE_DEMAND] }),
    });

    await screen.findByText("Alice Rakoto");
    await user.click(
      screen.getByRole("button", { name: "Supprimer la demande de Alice Rakoto" }),
    );
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
