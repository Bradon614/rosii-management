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
    cateringRequested: null,
    decorationRequested: null,
    floristRequested: null,
    equipmentRentalRequested: null,
    transportRequested: null,
    theme: "Champêtre",
    notes: null,
  },
});

const PATH = `/demandes/${DEMAND_ID}/edit`;

describe("DemandEditPage — chargement", () => {
  it("prefills the form with the recorded values", async () => {
    renderApp(PATH, {
      "GET /api/clients": () => ({ body: [] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
    });

    await waitFor(() =>
      expect(screen.getByLabelText(/^Client/)).toHaveValue(CLIENT_ID),
    );
    expect(screen.getByLabelText(/^Type de demande/)).toHaveValue("EVENT");
    expect(screen.getByLabelText("Statut")).toHaveValue("ACCEPTED");
    expect(screen.getByLabelText("Nombre de personnes")).toHaveValue("120");
    expect(screen.getByLabelText("Localisation")).toHaveValue("Salle des fêtes, Antananarivo");
    expect(screen.getByLabelText("Budget minimum (Ar)")).toHaveValue("400000");
    expect(screen.getByLabelText("Budget maximum (Ar)")).toHaveValue("600000");
    expect(screen.getByLabelText("Type d'événement")).toHaveValue("Mariage");
  });

  it("shows a dedicated message for an unknown demand", async () => {
    renderApp(PATH, {
      "GET /api/clients": () => ({ body: [] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Demande introuvable")).toBeInTheDocument();
  });
});

describe("DemandEditPage — enregistrement", () => {
  it("sends the full payload with the loaded version and returns to the demand", async () => {
    const user = userEvent.setup();
    const updated = { ...DEMAND, location: "Nouvelle salle", version: 2 };
    const { mock } = renderApp(PATH, {
      "GET /api/clients": () => ({ body: [] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
      [`PUT /api/demands/${DEMAND_ID}`]: () => ({ body: updated }),
    });

    const location = await screen.findByLabelText("Localisation");
    await user.clear(location);
    await user.type(location, "Nouvelle salle");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/demands/${DEMAND_ID}`);
    expect(put?.body).toMatchObject({
      clientId: CLIENT_ID,
      type: "EVENT",
      status: "ACCEPTED",
      location: "Nouvelle salle",
      budgetType: "RANGE",
      budgetMin: 400000,
      budgetMax: 600000,
      version: 1,
    });
    expect((put?.body as { eventDetails: unknown }).eventDetails).toMatchObject({
      eventType: "Mariage",
      hallNeeded: true,
      theme: "Champêtre",
    });

    expect(await screen.findByText(/Les modifications ont été enregistrées/)).toBeInTheDocument();
  });

  it("keeps the form and explains a version conflict (409)", async () => {
    const user = userEvent.setup();
    renderApp(PATH, {
      "GET /api/clients": () => ({ body: [] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
      [`PUT /api/demands/${DEMAND_ID}`]: () => ({
        status: 409,
        body: { error: "demand was modified concurrently; reload and retry" },
      }),
    });

    const location = await screen.findByLabelText("Localisation");
    await user.clear(location);
    await user.type(location, "Écrasement");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText(
        "Cette demande a été modifiée entre-temps. Rechargez-la avant de réessayer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger la demande" })).toBeInTheDocument();
    expect(screen.getByLabelText("Localisation")).toHaveValue("Écrasement");
  });

  it("still applies the client-side validation", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, {
      "GET /api/clients": () => ({ body: [] }),
      [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
    });

    await waitFor(() => expect(screen.getByLabelText(/^Client/)).toHaveValue(CLIENT_ID));
    await user.selectOptions(screen.getByLabelText(/^Client/), "");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(screen.getByText("Sélectionnez un client.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
