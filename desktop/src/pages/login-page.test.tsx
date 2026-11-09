import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { buildDossier, PROPOSAL_ID } from "@/test/fixtures";
import { renderApp } from "@/test/render-app";

const LOGIN_RESPONSE = {
  token: "fresh-jwt",
  tokenType: "Bearer",
  expiresInSeconds: 3600,
  user: { id: "u1", email: "patronne@chezrosii.mg", role: "PATRONNE" },
};

describe("LoginPage", () => {
  it("stores the token returned by the API and opens the dashboard", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      "/login",
      {
        "POST /api/auth/login": () => ({ body: LOGIN_RESPONSE }),
        "GET /api/demands": () => ({ body: [] }),
        "GET /api/proposals": () => ({ body: [] }),
        "GET /api/payments": () => ({ body: [] }),
        "GET /api/executions": () => ({ body: [] }),
        "GET /api/closures": () => ({ body: [] }),
      },
      { authenticated: false },
    );

    await user.type(await screen.findByLabelText("Email"), "patronne@chezrosii.mg");
    await user.type(screen.getByLabelText("Mot de passe"), "mot-de-passe");
    await user.click(screen.getByRole("button", { name: /Se connecter/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tableau de bord" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Aucune activité enregistrée")).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBe("fresh-jwt");

    const loginCall = mock.calls.find((call) => call.url === "/api/auth/login");
    expect(loginCall?.method).toBe("POST");
    expect(loginCall?.headers.get("Authorization")).toBeNull();
  });

  it("shows a clear message when the credentials are refused", async () => {
    const user = userEvent.setup();
    renderApp(
      "/login",
      { "POST /api/auth/login": () => ({ status: 401, body: { error: "bad credentials" } }) },
      { authenticated: false },
    );

    await user.type(await screen.findByLabelText("Email"), "patronne@chezrosii.mg");
    await user.type(screen.getByLabelText("Mot de passe"), "wrong");
    await user.click(screen.getByRole("button", { name: /Se connecter/ }));

    expect(await screen.findByText("Email ou mot de passe incorrect.")).toBeInTheDocument();
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
  });

  it("returns to the page that was requested before signing in", async () => {
    const user = userEvent.setup();
    renderApp(
      `/propositions/${PROPOSAL_ID}/dossier`,
      {
        "POST /api/auth/login": () => ({ body: LOGIN_RESPONSE }),
        [`GET /api/service-dossiers/${PROPOSAL_ID}`]: () => ({ body: buildDossier() }),
      },
      { authenticated: false },
    );

    // The guarded route redirected to /login and kept the target in memory.
    await user.type(await screen.findByLabelText("Email"), "patronne@chezrosii.mg");
    await user.type(screen.getByLabelText("Mot de passe"), "mot-de-passe");
    await user.click(screen.getByRole("button", { name: /Se connecter/ }));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Mariage Rakoto" }),
    ).toBeInTheDocument();
  });
});
