import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { renderApp, TEST_USER } from "@/test/render-app";
import type { MockReply } from "@/test/mock-api";

const PATH = "/settings";

describe("SettingsPage — compte réel (F27)", () => {
  it("displays the only account fields exposed by GET /api/auth/me", async () => {
    const { mock, user } = renderApp(PATH, {});

    expect(
      await screen.findByRole("heading", { level: 1, name: "Paramètres" }),
    ).toBeInTheDocument();
    const accountCard = screen.getByText("Mon profil").closest('[data-slot="card"]');
    expect(accountCard).not.toBeNull();
    expect(within(accountCard as HTMLElement).getByText(user.email)).toBeInTheDocument();
    expect(within(accountCard as HTMLElement).getByText("Patronne")).toBeInTheDocument();
    expect(within(accountCard as HTMLElement).getByText(user.id)).toBeInTheDocument();
    expect(screen.getAllByText("Session active").length).toBeGreaterThan(0);
    expect(screen.getByText("Lecture seule")).toBeInTheDocument();
    expect(screen.getByText("Modification non disponible")).toBeInTheDocument();

    // The page reuses the existing session context: no extra API endpoint.
    expect(mock.calls.every((call) => call.url === "/api/auth/me")).toBe(true);
  });

  it("never renders a fake company or preference form", async () => {
    renderApp(PATH, {});

    await screen.findByRole("heading", { level: 1, name: "Paramètres" });

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enregistrer/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Nom commercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Adresse")).not.toBeInTheDocument();
    expect(screen.queryByText("Téléphone")).not.toBeInTheDocument();
    expect(screen.queryByText("Logo")).not.toBeInTheDocument();
    expect(screen.queryByText("Préférences")).not.toBeInTheDocument();
    expect(screen.queryByText("Thème clair")).not.toBeInTheDocument();
    expect(screen.queryByText("Thème sombre")).not.toBeInTheDocument();
  });

  it("links the Paramètres navigation entry to the page", async () => {
    renderApp(PATH, {});

    await screen.findByRole("heading", { level: 1, name: "Paramètres" });

    expect(screen.getByRole("link", { name: "Paramètres" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });
});

describe("SettingsPage — session (F27)", () => {
  it("logs out through the real client-side session action", async () => {
    const user = userEvent.setup();
    renderApp(PATH, {});

    await screen.findByRole("heading", { level: 1, name: "Paramètres" });
    await user.click(
      screen.getByRole("button", { name: "Se déconnecter de la session" }),
    );

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("shows the existing session loading state while /api/auth/me is pending", async () => {
    let resolveRead: ((reply: MockReply) => void) | undefined;
    const pending = new Promise<MockReply>((resolve) => {
      resolveRead = resolve;
    });
    renderApp(PATH, { "GET /api/auth/me": () => pending });

    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveRead?.({ body: TEST_USER });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Paramètres" }),
    ).toBeInTheDocument();
  });

  it("redirects to login when the session is rejected", async () => {
    renderApp(PATH, { "GET /api/auth/me": () => ({ status: 401 }) });

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("shows an explicit unavailable state when the account is missing", async () => {
    renderApp(PATH, { "GET /api/auth/me": () => ({ body: null }) });

    expect(await screen.findByText("Compte indisponible")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Se déconnecter de la session" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Session active")).not.toBeInTheDocument();
  });

  it("ends the session from the unavailable state without a fake save", async () => {
    const user = userEvent.setup();
    renderApp(PATH, { "GET /api/auth/me": () => ({ body: null }) });

    await screen.findByText("Compte indisponible");
    await user.click(
      screen.getByRole("button", { name: "Se déconnecter de la session" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Se connecter/ }),
      ).toBeInTheDocument(),
    );
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
