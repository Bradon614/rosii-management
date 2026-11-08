import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildClient, buildDemand, CLIENT_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const ALICE = buildClient();
const CREATED = buildDemand({
  id: "99999999-9999-9999-9999-999999999999",
  clientId: CLIENT_ID,
  clientName: ALICE.name,
});

async function pickClient(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: "Alice Rakoto" });
  await user.selectOptions(screen.getByLabelText(/^Client/), CLIENT_ID);
}

describe("DemandCreatePage — validation", () => {
  it("requires a client and a type before calling the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
    });

    await user.click(await screen.findByRole("button", { name: "Créer la demande" }));

    expect(screen.getByText("Sélectionnez un client.")).toBeInTheDocument();
    expect(screen.getByText("Sélectionnez le type de demande.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });
});

describe("DemandCreatePage — budget", () => {
  it("creates a minimal demand with NO budget", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "POST /api/demands": () => ({ status: 201, body: CREATED }),
      [`GET /api/demands/${CREATED.id}`]: () => ({ body: CREATED }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "CATERING");
    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    expect(mock.calls.find((call) => call.method === "POST")?.body).toEqual({
      clientId: CLIENT_ID,
      type: "CATERING",
      status: "NEW",
      requestedDate: null,
      estimatedPeople: null,
      budgetType: "NONE",
      budgetMin: null,
      budgetMax: null,
      location: null,
      notes: null,
      eventDetails: null,
    });
    expect(
      await screen.findByRole("heading", { name: /Événement · Alice Rakoto/, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/La demande de « Alice Rakoto » a été créée/)).toBeInTheDocument();
  });

  it("sends a single amount for an EXACT budget", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "POST /api/demands": () => ({ status: 201, body: CREATED }),
      [`GET /api/demands/${CREATED.id}`]: () => ({ body: CREATED }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "OTHER");
    await user.selectOptions(screen.getByLabelText("Type de budget"), "EXACT");
    await user.type(screen.getByLabelText("Budget exact (Ar)"), "500 000");
    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const payload = mock.calls.find((call) => call.method === "POST")?.body as Record<
      string,
      unknown
    >;
    expect(payload.budgetType).toBe("EXACT");
    expect(payload.budgetMin).toBe(500000);
    expect(payload.budgetMax).toBe(500000);
  });

  it("rejects an inconsistent RANGE budget before the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "OTHER");
    await user.selectOptions(screen.getByLabelText("Type de budget"), "RANGE");
    await user.type(screen.getByLabelText("Budget minimum (Ar)"), "800000");
    await user.type(screen.getByLabelText("Budget maximum (Ar)"), "400000");
    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    expect(
      screen.getByText("Le budget maximum doit être supérieur au budget minimum."),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });
});

describe("DemandCreatePage — événement", () => {
  it("creates an EVENT demand with its event details", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "POST /api/demands": () => ({ status: 201, body: CREATED }),
      [`GET /api/demands/${CREATED.id}`]: () => ({ body: CREATED }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "EVENT");
    fireEvent.change(screen.getByLabelText("Date souhaitée"), {
      target: { value: "2026-12-12" },
    });
    await user.type(screen.getByLabelText("Nombre de personnes"), "120");
    await user.type(screen.getByLabelText("Localisation"), "Salle des fêtes");
    await user.type(screen.getByLabelText("Notes"), "Menu enfant");
    await user.selectOptions(screen.getByLabelText("Type de budget"), "RANGE");
    await user.type(screen.getByLabelText("Budget minimum (Ar)"), "400000");
    await user.type(screen.getByLabelText("Budget maximum (Ar)"), "800000");

    await user.type(screen.getByLabelText("Type d'événement"), "Mariage");
    await user.selectOptions(screen.getByLabelText("Salle"), "YES");
    await user.type(screen.getByLabelText("Salle souhaitée"), "Salle A");
    await user.selectOptions(screen.getByLabelText("Traiteur"), "YES");
    await user.selectOptions(screen.getByLabelText("Décoration"), "NO");
    await user.type(screen.getByLabelText("Thème"), "Champêtre");

    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const payload = mock.calls.find((call) => call.method === "POST")?.body as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      clientId: CLIENT_ID,
      type: "EVENT",
      status: "NEW",
      requestedDate: "2026-12-12",
      estimatedPeople: 120,
      budgetType: "RANGE",
      budgetMin: 400000,
      budgetMax: 800000,
      location: "Salle des fêtes",
      notes: "Menu enfant",
    });
    expect(payload.eventDetails).toEqual({
      eventType: "Mariage",
      hallNeeded: true,
      desiredHall: "Salle A",
      cateringRequested: true,
      decorationRequested: false,
      floristRequested: null,
      equipmentRentalRequested: null,
      transportRequested: null,
      theme: "Champêtre",
      notes: null,
    });
  });

  it("hides the event section for a non-event demand", async () => {
    const user = userEvent.setup();
    renderApp("/demandes/new", { "GET /api/clients": () => ({ body: [ALICE] }) });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "CATERING");

    expect(screen.queryByLabelText("Type d'événement")).not.toBeInTheDocument();
  });
});

describe("DemandCreatePage — erreurs serveur", () => {
  it("shows the backend refusal and stays on the form", async () => {
    const user = userEvent.setup();
    renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "POST /api/demands": () => ({ status: 400, body: { error: "Bad Request" } }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "OTHER");
    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    expect(
      await screen.findByText(
        "Certaines informations sont invalides. Vérifiez les champs puis réessayez.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la demande" })).toBeInTheDocument();
  });

  it("explains that the selected client no longer exists (404)", async () => {
    const user = userEvent.setup();
    renderApp("/demandes/new", {
      "GET /api/clients": () => ({ body: [ALICE] }),
      "POST /api/demands": () => ({ status: 404, body: { error: "Not Found" } }),
    });

    await pickClient(user);
    await user.selectOptions(screen.getByLabelText(/^Type de demande/), "OTHER");
    await user.click(screen.getByRole("button", { name: "Créer la demande" }));

    expect(
      await screen.findByText(
        "Le client sélectionné n'existe plus. Actualisez la liste des clients et réessayez.",
      ),
    ).toBeInTheDocument();
  });
});
