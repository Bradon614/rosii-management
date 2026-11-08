import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildClient } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const CLIENT = buildClient();
const EDIT_PATH = `/clients/${CLIENT.id}/edit`;

describe("ClientEditPage — chargement", () => {
  it("prefills the form with the recorded values", async () => {
    renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
    });

    expect(await screen.findByLabelText(/^Nom/)).toHaveValue(CLIENT.name);
    expect(screen.getByLabelText(/^Téléphone principal/)).toHaveValue(CLIENT.phone1);
    expect(screen.getByLabelText("Téléphone secondaire")).toHaveValue("");
    expect(screen.getByLabelText("Email")).toHaveValue("");
  });

  it("shows a dedicated message for an unknown client", async () => {
    renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ status: 404 }),
    });

    expect(await screen.findByText("Client introuvable")).toBeInTheDocument();
  });
});

describe("ClientEditPage — enregistrement", () => {
  it("puts the editable fields (without version) and returns to the record", async () => {
    const user = userEvent.setup();
    const updated = { ...CLIENT, name: "Alice Rakoto-Modifiée", version: 1 };
    const { mock } = renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
      [`PUT /api/clients/${CLIENT.id}`]: () => ({ body: updated }),
    });

    const name = await screen.findByLabelText(/^Nom/);
    await user.clear(name);
    await user.type(name, "Alice Rakoto-Modifiée");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() =>
      expect(mock.calls.some((call) => call.method === "PUT")).toBe(true),
    );
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/clients/${CLIENT.id}`);
    expect(put?.body).toEqual({
      name: "Alice Rakoto-Modifiée",
      phone1: CLIENT.phone1,
      phone2: null,
      email: null,
      notes: null,
    });
    // UpdateClientRequest has no version field: the backend owns @Version.
    expect(put?.body).not.toHaveProperty("version");

    expect(await screen.findByText(/Les modifications ont été enregistrées/)).toBeInTheDocument();
  });

  it("keeps the form and explains a version conflict (409)", async () => {
    const user = userEvent.setup();
    renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
      [`PUT /api/clients/${CLIENT.id}`]: () => ({
        status: 409,
        body: { error: "client was modified concurrently; reload and retry" },
      }),
    });

    const name = await screen.findByLabelText(/^Nom/);
    await user.clear(name);
    await user.type(name, "Écrasement");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText(
        "Ce client a été modifié entre-temps. Rechargez la fiche avant de réessayer.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recharger la fiche" })).toBeInTheDocument();
    // Nothing was silently overwritten: the typed value is still there.
    expect(screen.getByLabelText(/^Nom/)).toHaveValue("Écrasement");
  });

  it("reloads the record on demand after a conflict", async () => {
    const user = userEvent.setup();
    let gets = 0;
    const { mock } = renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => {
        gets += 1;
        return { body: gets === 1 ? CLIENT : { ...CLIENT, name: "Alice Rechargée", version: 2 } };
      },
      [`PUT /api/clients/${CLIENT.id}`]: () => ({ status: 409, body: { error: "conflict" } }),
    });

    const name = await screen.findByLabelText(/^Nom/);
    await user.clear(name);
    await user.type(name, "Écrasement");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await user.click(await screen.findByRole("button", { name: "Recharger la fiche" }));

    await waitFor(() => expect(screen.getByLabelText(/^Nom/)).toHaveValue("Alice Rechargée"));
    expect(
      mock.calls.filter(
        (call) => call.method === "GET" && call.url === `/api/clients/${CLIENT.id}`,
      ),
    ).toHaveLength(2);
  });

  it("still applies the client-side validation", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(EDIT_PATH, {
      [`GET /api/clients/${CLIENT.id}`]: () => ({ body: CLIENT }),
    });

    const name = await screen.findByLabelText(/^Nom/);
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(screen.getByText("Le nom est obligatoire.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });
});
