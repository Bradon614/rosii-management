/**
 * Single HTTP client for the desktop application.
 *
 * - Requests go to a relative `/api` path by default, forwarded to the Spring
 *   Boot API by the Vite dev proxy (no CORS involved, and the JWT stays same
 *   origin). Set `VITE_API_BASE_URL` to target another origin explicitly.
 * - The bearer token is read from localStorage on every request, so a 401 can
 *   never be caused by a stale in-memory copy.
 * - 401 clears the stored token and broadcasts {@link UNAUTHORIZED_EVENT}: the
 *   auth provider logs out and the router redirects to the login page. 403 and
 *   404 keep their own message and are surfaced by the calling page.
 */

/** localStorage key holding the bearer token. */
export const AUTH_TOKEN_STORAGE_KEY = "rosii.auth.token";

/** Window event fired when the API answers 401. */
export const UNAUTHORIZED_EVENT = "rosii:unauthorized";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** Error carrying the HTTP status so pages can distinguish 401 / 403 / 404. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }

  /** No HTTP answer at all (API unreachable, DNS, TLS...). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Reads the stored bearer token, if any. */
export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode, hardened webview): no token.
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  } catch {
    // Ignore: the session then only lives in memory for this page.
  }
}

export function clearAuthToken(): void {
  try {
    window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

function notifyUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

interface RequestOptions {
  /**
   * Send the bearer token. The login request sets it to `false`: a 401 there
   * means "wrong credentials", not "the session expired", so it must not clear
   * anything nor redirect.
   */
  auth?: boolean;
  signal?: AbortSignal;
}

/** Builds the absolute URL of an API path. */
export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function buildHeaders(options: RequestOptions, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set("Accept", "application/json");
  if (options.auth !== false) {
    const token = getAuthToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return headers;
}

/**
 * Reads the error message of a failed response. Spring Boot answers either
 * `{"error": "..."}` (controllers) or a ProblemDetail (`{"detail": "..."}`);
 * both are supported, with a status-based fallback.
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      for (const key of ["error", "detail", "message", "title"]) {
        const value = record[key];
        if (typeof value === "string" && value.trim()) {
          return value;
        }
      }
    }
  } catch {
    // Not a JSON body: fall through to the generic message.
  }
  return defaultMessageForStatus(response.status);
}

function defaultMessageForStatus(status: number): string {
  switch (status) {
    case 401:
      return "Session expirée ou identifiants invalides.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Ressource introuvable.";
    case 409:
      return "L'opération entre en conflit avec l'état actuel des données.";
    default:
      return `La requête a échoué (HTTP ${status}).`;
  }
}

/** In-flight GET requests, keyed by URL, so concurrent mounts share one call. */
const inFlightGets = new Map<string, Promise<unknown>>();

async function execute<T>(
  path: string,
  init: RequestInit,
  options: RequestOptions,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      signal: options.signal,
      headers: buildHeaders(options, init.headers),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(
      0,
      "Impossible de joindre le serveur. Vérifiez que l'API est démarrée et réessayez.",
    );
  }

  if (response.status === 401) {
    if (options.auth !== false) {
      clearAuthToken();
      notifyUnauthorized();
    }
    throw new ApiError(401, await readErrorMessage(response));
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function request<T>(
  method: string,
  path: string,
  body: unknown,
  options: RequestOptions,
): Promise<T> {
  const init: RequestInit = {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  const dedupeKey = method === "GET" && !options.signal ? apiUrl(path) : null;
  if (dedupeKey) {
    const existing = inFlightGets.get(dedupeKey);
    if (existing) {
      return existing as Promise<T>;
    }
  }

  const promise = execute<T>(path, init, options);
  if (dedupeKey) {
    inFlightGets.set(dedupeKey, promise);
    // Detach the cleanup chain from the caller's promise: the rejection is
    // still delivered to whoever awaits `promise`.
    void promise.finally(() => inFlightGets.delete(dedupeKey)).catch(() => undefined);
  }
  return promise;
}

export const api = {
  get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return request<T>("GET", path, undefined, options);
  },
  post<T>(path: string, body: unknown, options: RequestOptions = {}): Promise<T> {
    return request<T>("POST", path, body, options);
  },
};

/** Extracts the filename of a `Content-Disposition` header, if any. */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return encoded[1];
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

/** How long a generated blob URL stays valid after the download is triggered. */
export const PDF_OBJECT_URL_TTL_MS = 60_000;

/**
 * Downloads a PDF through the authenticated API and hands it to the browser
 * (or the Tauri webview) as a file. The document itself is generated by the
 * backend: this function never builds one.
 */
export async function downloadPdf(path: string, fallbackFilename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), { headers: buildHeaders({}) });
  } catch {
    throw new ApiError(
      0,
      "Téléchargement impossible : le serveur est injoignable.",
    );
  }

  if (response.status === 401) {
    clearAuthToken();
    notifyUnauthorized();
    throw new ApiError(401, await readErrorMessage(response));
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      response.status === 404
        ? "Ce document n'existe plus."
        : `Téléchargement impossible (HTTP ${response.status}).`,
    );
  }

  const blob = await response.blob();
  const filename =
    filenameFromContentDisposition(response.headers.get("Content-Disposition")) ??
    fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  // The webview starts the download asynchronously: revoking the URL in the
  // same task can cancel a download that has not begun yet in some engines.
  // Keep it alive long enough for the transfer to start, then release it.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), PDF_OBJECT_URL_TTL_MS);
}
