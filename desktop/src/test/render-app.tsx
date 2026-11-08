import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { AppRoutes } from "@/App";
import { AUTH_TOKEN_STORAGE_KEY } from "@/lib/api";
import { AuthProvider } from "@/lib/auth";
import type { AuthenticatedUser } from "@/types/api";

import { mockApi, type ApiMock, type MockHandler } from "./mock-api";

export const TEST_USER: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  email: "patronne@chezrosii.mg",
  role: "PATRONNE",
};

export const TEST_TOKEN = "test-jwt-token";

interface RenderAppOptions {
  /** Store a token before mounting (default true). */
  authenticated?: boolean;
}

export interface RenderedApp {
  mock: ApiMock;
  user: AuthenticatedUser;
}

/**
 * Renders the real route table inside a MemoryRouter, with a mocked `fetch`.
 *
 * `/api/auth/me` is answered by default so the session check succeeds; pass an
 * explicit handler in `routes` to override it.
 */
export function renderApp(
  initialPath: string,
  routes: Record<string, MockHandler>,
  options: RenderAppOptions = {},
): RenderedApp {
  const authenticated = options.authenticated ?? true;
  if (authenticated) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, TEST_TOKEN);
  }

  const mock = mockApi({
    "GET /api/auth/me": () => ({ body: TEST_USER }),
    ...routes,
  });

  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );

  return { mock, user: TEST_USER };
}
