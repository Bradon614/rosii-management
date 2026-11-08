import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { buildClient } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const ALICE = buildClient();

const BOB = buildClient({
  id: "22222222-2222-2222-2222-22222222222b",
  name: "Bob Example",
  phone1: "+261 33 00 00 00 00",
  phone2: "+261 32 11 11 11 11",
  email: "bob@example.mg",
  createdAt: "2026-10-15T08:00:00Z",
});

describe("ClientsPage — liste", () => {
  it("lists the clients with their contact details and actions", async () => {
    renderApp("/clients", {
      "GET /api/clients": () => ({ body: [ALICE, BOB] }),
    });

    expect(await screen.findByRole("heading", { name: "Clients" })).toBeInTheDocument();
    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByText("Bob Example")).toBeInTheDocument();
    expect(screen.getByText("bob@example.mg")).toBeInTheDocument();
    expect(screen.getByTestId("client-count")).toHaveTextContent("2 clients");

    expect(screen.getByRole("link", { name: "Voir le client Alice Rakoto" })).toHaveAttribute(
      "href",
      `/clients/${ALICE.id}`,
    );
    expect(screen.getByRole("link", { name: "Modifier le client Alice Rakoto" })).toHaveAttribute(
      "href",
      `/clients/${ALICE.id}/edit`,
    );
    expect(
      screen.getByRole("button", { name: "Supprimer le client Alice Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nouveau client" })).toHaveAttribute(
      "href",
      "/clients/new",
    );
  });

  it("offers a Clients entry in the main navigation", async () => {
    renderApp("/clients", { "GET /api/clients": () => ({ body: [] }) });

    // The navigation only renders once the stored session has been verified.
    await screen.findByRole("heading", { name: "Clients" });

    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    expect(within(nav).getByRole("link", { name: "Clients" })).toHaveAttribute("href", "/clients");
    expect(within(nav).getByRole("link", { name: "Propositions" })).toHaveAttribute(
      "href",
      "/propositions",
    );
  });

  it("shows an explicit empty state with a creation shortcut", async () => {
    renderApp("/clients", { "GET /api/clients": () => ({ body: [] }) });

    expect(await screen.findByText("Aucun client")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Créer un client/ })).toHaveAttribute(
      "href",
      "/clients/new",
    );
  });
});

describe("ClientsPage — recherche", () => {
  it("queries the backend search parameter and narrows the list", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/clients", {
      "GET /api/clients": () => ({ body: [ALICE, BOB] }),
      "GET /api/clients?search=rak": () => ({ body: [ALICE] }),
    });

    await screen.findByText("Bob Example");
    await user.type(screen.getByLabelText("Rechercher un client"), "rak");

    await waitFor(() =>
      expect(mock.calls.some((call) => call.url === "/api/clients?search=rak")).toBe(true),
    );
    expect(await screen.findByTestId("client-count")).toHaveTextContent("1 client pour « rak »");
    expect(screen.queryByText("Bob Example")).not.toBeInTheDocument();
  });

  it("reports no result and can clear the search", async () => {
    const user = userEvent.setup();
    renderApp("/clients", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "GET /api/clients?search=zzz": () => ({ body: [] }),
    });

    await screen.findByText("Alice Rakoto");
    await user.type(screen.getByLabelText("Rechercher un client"), "zzz");

    expect(await screen.findByText("Aucun résultat")).toBeInTheDocument();
    expect(screen.getByText(/Aucun client ne correspond à « zzz »/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Afficher tous les clients" }));

    expect(await screen.findByText("Alice Rakoto")).toBeInTheDocument();
  });
});

describe("ClientsPage — erreurs", () => {
  it("shows the API error and retries on demand", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    renderApp("/clients", {
      "GET /api/clients": () => {
        attempts += 1;
        return attempts === 1 ? { status: 500, body: { error: "base indisponible" } } : { body: [] };
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByText("base indisponible")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Aucun client")).toBeInTheDocument();
  });

  it("reports an unreachable API without crashing", async () => {
    renderApp("/clients", {
      "GET /api/clients": () => {
        throw new TypeError("Failed to fetch");
      },
    });

    expect(await screen.findByText("Chargement impossible")).toBeInTheDocument();
    expect(screen.getByText(/Impossible de joindre le serveur/)).toBeInTheDocument();
  });

  it("redirects to the login page when the session has expired", async () => {
    renderApp("/clients", { "GET /api/clients": () => ({ status: 401 }) });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});

describe("ClientsPage — suppression", () => {
  it("asks for confirmation, deletes only after confirmation and refreshes the list", async () => {
    const user = userEvent.setup();
    let deleted = false;
    const { mock } = renderApp("/clients", {
      "GET /api/clients": () => ({ body: deleted ? [] : [ALICE] }),
      [`DELETE /api/clients/${ALICE.id}`]: () => {
        deleted = true;
        return { status: 204 };
      },
    });

    await screen.findByText("Alice Rakoto");
    await user.click(screen.getByRole("button", { name: "Supprimer le client Alice Rakoto" }));

    expect(
      screen.getByRole("alertdialog", { name: "Supprimer Alice Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Supprimer « Alice Rakoto »/)).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: /Confirmer la suppression/ }));

    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) => call.method === "DELETE" && call.url === `/api/clients/${ALICE.id}`,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/Le client « Alice Rakoto » a été supprimé/)).toBeInTheDocument();
    expect(await screen.findByText("Aucun client")).toBeInTheDocument();
  });

  it("does nothing when the deletion is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/clients", {
      "GET /api/clients": () => ({ body: [ALICE] }),
    });

    await screen.findByText("Alice Rakoto");
    await user.click(screen.getByRole("button", { name: "Supprimer le client Alice Rakoto" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(
      screen.queryByRole("alertdialog", { name: "Supprimer Alice Rakoto" }),
    ).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
