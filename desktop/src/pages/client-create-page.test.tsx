import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { buildClient } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const CREATED = buildClient({
  id: "33333333-3333-3333-3333-333333333333",
  name: "Nouveau Client",
  phone1: "+261 34 00 00 00 00",
  phone2: null,
  email: null,
  notes: null,
});

async function fillValidForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Nom/), "Nouveau Client");
  await user.type(screen.getByLabelText(/^Téléphone principal/), "+261 34 00 00 00 00");
}

describe("ClientCreatePage — validation", () => {
  it("blocks the request when the required fields are empty", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/clients/new", {});

    await user.click(await screen.findByRole("button", { name: "Créer le client" }));

    expect(screen.getByText("Le nom est obligatoire.")).toBeInTheDocument();
    expect(screen.getByText("Le téléphone principal est obligatoire.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("enforces the documented length limits", async () => {
    const user = userEvent.setup();
    renderApp("/clients/new", {});

    const name = await screen.findByLabelText(/^Nom/);
    expect(name).toHaveAttribute("maxLength", "200");
    expect(screen.getByLabelText(/^Téléphone principal/)).toHaveAttribute("maxLength", "30");
    expect(screen.getByLabelText("Téléphone secondaire")).toHaveAttribute("maxLength", "30");
    expect(screen.getByLabelText("Email")).toHaveAttribute("maxLength", "255");
    expect(screen.getByLabelText("Notes")).toHaveAttribute("maxLength", "2000");

    // fireEvent bypasses the HTML maxLength, like a paste from an older build.
    fireEvent.change(name, { target: { value: "x".repeat(201) } });
    fireEvent.change(screen.getByLabelText(/^Téléphone principal/), {
      target: { value: "1".repeat(31) },
    });
    await user.click(screen.getByRole("button", { name: "Créer le client" }));

    expect(screen.getByText("Le nom ne peut pas dépasser 200 caractères.")).toBeInTheDocument();
    expect(
      screen.getByText("Le téléphone principal ne peut pas dépasser 30 caractères."),
    ).toBeInTheDocument();
  });

  it("rejects a malformed email before calling the API", async () => {
    const user = userEvent.setup();
    renderApp("/clients/new", {});

    await fillValidForm(user);
    await user.type(screen.getByLabelText("Email"), "pas-un-email");
    await user.click(screen.getByRole("button", { name: "Créer le client" }));

    expect(screen.getByText("L'adresse email n'est pas valide.")).toBeInTheDocument();
  });
});

describe("ClientCreatePage — création", () => {
  it("posts the normalized payload, then opens the created client", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/clients/new", {
      "POST /api/clients": () => ({ status: 201, body: CREATED }),
      [`GET /api/clients/${CREATED.id}`]: () => ({ body: CREATED }),
    });

    await fillValidForm(user);
    await user.type(screen.getByLabelText("Téléphone secondaire"), "   ");
    await user.type(screen.getByLabelText("Notes"), "  Cliente recommandée  ");
    await user.click(screen.getByRole("button", { name: "Créer le client" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const post = mock.calls.find((call) => call.method === "POST");
    expect(post?.url).toBe("/api/clients");
    expect(post?.body).toEqual({
      name: "Nouveau Client",
      phone1: "+261 34 00 00 00 00",
      phone2: null,
      email: null,
      notes: "Cliente recommandée",
    });

    expect(
      await screen.findByRole("heading", { name: /Nouveau Client/, level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Le client « Nouveau Client » a été créé/)).toBeInTheDocument();
  });

  it("shows the backend validation message and stays on the form when the API refuses", async () => {
    const user = userEvent.setup();
    renderApp("/clients/new", {
      "POST /api/clients": () => ({ status: 400, body: { error: "Bad Request" } }),
    });

    await fillValidForm(user);
    await user.click(screen.getByRole("button", { name: "Créer le client" }));

    expect(
      await screen.findByText(
        "Certaines informations sont invalides. Vérifiez les champs puis réessayez.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer le client" })).toBeInTheDocument();
  });
});
