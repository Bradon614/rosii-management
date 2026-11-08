import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  api,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";
import type { AuthenticatedUser, AuthSession } from "@/types/api";

/**
 * Session state of the desktop application.
 *
 * The JWT lives in localStorage (same storage the API client reads on every
 * request). On startup a stored token is verified against `GET /api/auth/me`
 * before any protected page renders; a 401 anywhere logs the session out
 * through {@link UNAUTHORIZED_EVENT}.
 */
export type AuthStatus = "loading" | "authenticated" | "anonymous";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthenticatedUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthState {
  status: AuthStatus;
  user: AuthenticatedUser | null;
}

function initialState(): AuthState {
  return getAuthToken()
    ? { status: "loading", user: null }
    : { status: "anonymous", user: null };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  // Restore the session once, from the token stored by a previous run.
  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    let active = true;
    api
      .get<AuthenticatedUser>("/api/auth/me")
      .then((user) => {
        if (active) {
          setState({ status: "authenticated", user });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: "anonymous", user: null });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // A 401 on any request ends the session exactly once, wherever it happened.
  useEffect(() => {
    const onUnauthorized = () => setState({ status: "anonymous", user: null });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const session = await api.post<AuthSession>(
      "/api/auth/login",
      { email, password },
      { auth: false },
    );
    setAuthToken(session.token);
    setState({ status: "authenticated", user: session.user });
  }, []);

  const logout = useCallback(() => {
    clearAuthToken();
    setState({ status: "anonymous", user: null });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, login, logout }),
    [state.status, state.user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return context;
}
