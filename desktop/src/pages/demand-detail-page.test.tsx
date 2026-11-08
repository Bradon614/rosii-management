import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildDemand, CLIENT_ID, DEMAND_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const DEMAND = buildDemand({
  eventDetails: {
    eventType: "Mariage",
    hallNeeded: true,
    desiredHall: "Salle A",
    cateringRequested: true,
    decorationRequested: false,
    floristRequested: null,
    equipmentRentalRequested: null,
    transportRequested: null,
    theme: "Champêtre",
    notes: "Arrivée à 18h",
  },
});

const PATH = `/demandes/${DEMAND_ID}`;

describe("DemandDetailPage — consultation", () => {
  it("shows every recorded field, the client link and the event details", async () => {
    renderApp(PATH, { [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }) });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Acceptée").length).toBeGreaterThan(0);
    expect(screen.getByText("12 déc. 2026")).toBeInTheDocument();
    expect(screen.getByText("120 personnes")).toBeInTheDocument();
    expect(screen.getByText("Salle des fêtes, Antananarivo")).toBeInTheDocument();
    expect(screen.getByText("Prévoir un menu enfant.")).toBeInTheDocument();
    expect(screen.getByText("Fourchette de budget")).toBeInTheDocument();
    expect(screen.getByText(/400\s000\sAr/)).toBeInTheDocument();
    expect(screen.getByText(/600\s000\sAr/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Fiche client/ })).toHaveAttribute(
      "href",
      `/clients/${CLIENT_ID}`,
    );
    expect(screen.getByRole("link", { name: "Retour aux demandes" })).toHaveAttribute(
      "href",
      "/demandes",
    );

    expect(screen.getByText("Informations événementielles")).toBeInTheDocument();
    expect(screen.getByText("Mariage")).toBeInTheDocument();
    expect(screen.getByText("Salle A")).toBeInTheDocument();
    expect(screen.getByText("Champêtre")).toBeInTheDocument();
    expect(screen.getByText("Arrivée à 18h")).toBeInTheDocument();
    expect(screen.getAllByText("Souhaité").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Refusé").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Non précisé").length).toBeGreaterThan(0);
  });

  it("hides null optional fields and the event section", async () => {
    const minimal = buildDemand({
      requestedDate: null,
      estimatedPeople: null,
      budgetType: "NONE",
      budgetMin: null,
      budgetMax: null,
      location: null,
      notes: null,
      eventDetails: null,
    });
    renderApp(PATH, { [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: minimal }) });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });

    expect(screen.queryByText("Date souhaitée")).not.toBeInTheDocument();
    expect(screen.queryByText("Nombre de personnes")).not.toBeInTheDocument();
    expect(screen.queryByText("Localisation")).not.toBeInTheDocument();
    expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    expect(screen.queryByText("Informations événementielles")).not.toBeInTheDocument();
    expect(screen.getByText("Aucun budget communiqué par le client.")).toBeInTheDocument();
  });

  it("shows a dedicated message for an unknown demand", async () => {
    renderApp(PATH, { [`GET /api/demands/${DEMAND_ID}`]: () => ({ status: 404 }) });

    expect(await screen.findByText("Demande introuvable")).toBeInTheDocument();
    expect(screen.getByText("Cette demande n'existe pas ou a été supprimée.")).toBeInTheDocument();
  });
});

describe("DemandDetailPage — changement de statut", () => {
  it("asks for confirmation, then updates the status with the current version", async () => {
    const user = userEvent.setup();
    let updatedStatus = "ACCEPTED";
    const { mock } = renderApp(PATH, {
      [`GET /api/demands/${DEMAND_ID}`]: () => ({
        body: { ...DEMAND, status: updatedStatus, version: updatedStatus === "ACCEPTED" ? 1 : 2 },
      }),
      [`PUT /api/demands/${DEMAND_ID}`]: () => {
        updatedStatus = "REFUSED";
        return { body: { ...DEMAND, status: "REFUSED", version: 2 } };
      },
    });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });

    await user.selectOptions(screen.getByLabelText("Statut de la demande"), "REFUSED");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));

    expect(await screen.findByText("Confirmer le changement de statut ?")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/demands/${DEMAND_ID}`);
    expect(put?.body).toMatchObject({
      clientId: CLIENT_ID,
      type: "EVENT",
      status: "REFUSED",
      budgetType: "RANGE",
      budgetMin: 400000,
      budgetMax: 600000,
      version: 1,
    });
    expect(await screen.findByText(/Le statut est maintenant « Refusée »/)).toBeInTheDocument();
  });

  it("does nothing when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, {
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
    });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });
    await user.selectOptions(screen.getByLabelText("Statut de la demande"), "ABANDONED");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Confirmer le changement de statut ?")).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("reports a conflict and offers to reload", async () => {
    const user = userEvent.setup();
    renderApp(PATH, {
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
      [`PUT /api/demands/${DEMAND_ID}`]: () => ({
        status: 409,
        body: { error: "demand was modified concurrently; reload and retry" },
      }),
    });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });
    await user.selectOptions(screen.getByLabelText("Statut de la demande"), "REFUSED");
    await user.click(screen.getByRole("button", { name: "Appliquer" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(
      await screen.findByText(
        "Cette demande a été modifiée entre-temps. Rechargez-la avant de réessayer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger la demande" })).toBeInTheDocument();
  });
});

describe("DemandDetailPage — suppression", () => {
  it("names the demand in the confirmation, deletes on confirm and returns to the list", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, {
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
      [`DELETE /api/demands/${DEMAND_ID}`]: () => ({ status: 204 }),
      "GET /api/demands": () => ({ body: [] }),
    });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));

    expect(
      screen.getByRole("alertdialog", { name: "Supprimer la demande de Alice Rakoto" }),
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
    expect(await screen.findByRole("heading", { name: "Demandes" })).toBeInTheDocument();
  });

  it("keeps the demand when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, {
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
    });

    await screen.findByRole("heading", { level: 1, name: "Événement · Alice Rakoto" });
    await user.click(screen.getByRole("button", { name: "Supprimer" }));
    await user.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "DELETE")).toBe(false);
  });
});
