import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildClient } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const CLIENT = buildClient({
  phone2: "+261 33 98 76 54 32",
  email: "alice.rakoto@example.mg",
  notes: "Préfère être contactée le matin.",
});

describe("ClientDetailPage — consultation", () => {
  it("shows every recorded field and the audit dates", async () => {
    renderApp(`/clients/${CLIENT.id}`, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
    });

    expect(
      await screen.findByRole("heading", { name: /Alice Rakoto/, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("+261 34 12 34 56 78")).toBeInTheDocument();
    expect(screen.getByText("+261 33 98 76 54 32")).toBeInTheDocument();
    expect(screen.getByText("alice.rakoto@example.mg")).toBeInTheDocument();
    expect(screen.getByText("Préfère être contactée le matin.")).toBeInTheDocument();
    expect(screen.getByText("Créé le")).toBeInTheDocument();
    expect(screen.getByText("Dernière modification")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Modifier/ })).toHaveAttribute(
      "href",
      `/clients/${CLIENT.id}/edit`,
    );
    expect(screen.getByRole("link", { name: "Retour aux clients" })).toHaveAttribute(
      "href",
      "/clients",
    );
  });

  it("hides the optional fields that are not recorded", async () => {
    const minimal = buildClient({ phone2: null, email: null, notes: null });
    renderApp(`/clients/${minimal.id}`, {
      [`GET /api/clients/${minimal.id}`]: () => ({ body: minimal }),
    });

    await screen.findByRole("heading", { name: /Alice Rakoto/, level: 1 });

    expect(screen.queryByText("Téléphone secondaire")).not.toBeInTheDocument();
    expect(screen.queryByText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.getByText("Téléphone principal")).toBeInTheDocument();
  });

  it("shows a dedicated message for an unknown client", async () => {
    renderApp(`/clients/${CLIENT.id}`, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Client introuvable")).toBeInTheDocument();
    expect(screen.getByText("Ce client n'existe pas ou a été supprimé.")).toBeInTheDocument();
  });
});

describe("ClientDetailPage — suppression", () => {
  it("names the client in the confirmation, deletes only on confirm and returns to the list", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(`/clients/${CLIENT.id}`, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
      [`DELETE /api/clients/${CLIENT.id}`]: () => ({ status: 204 }),
      "GET /api/clients": () => ({ body: [] }),
    });

    await screen.findByRole("heading", { name: /Alice Rakoto/, level: 1 });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(screen.getByRole("alertdialog", { name: "Supprimer Alice Rakoto" })).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: /Confirmer la suppression/ }));

    await waitFor(() =>
      expect(
        mock.calls.some(
          (call) => call.method === "DELETE" && call.url === `/api/clients/${CLIENT.id}`,
        ),
      ).toBe(true),
    );
    expect(await screen.findByText(/Le client « Alice Rakoto » a été supprimé/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Clients" })).toBeInTheDocument();
  });

  it("keeps the client when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(`/clients/${CLIENT.id}`, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
    });

    await screen.findByRole("heading", { name: /Alice Rakoto/, level: 1 });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Alice Rakoto/, level: 1 })).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);
  });

  it("shows the API error without navigating when the deletion fails", async () => {
    const user = userEvent.setup();
    renderApp(`/clients/${CLIENT.id}`, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
      [`DELETE /api/clients/${CLIENT.id}`]: () => ({ status: 500, body: { error: "boom" } }),
    });

    await screen.findByRole("heading", { name: /Alice Rakoto/, level: 1 });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: /Confirmer la suppression/ }));

    expect(await screen.findByText("boom")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Alice Rakoto/, level: 1 })).toBeInTheDocument();
  });
});
