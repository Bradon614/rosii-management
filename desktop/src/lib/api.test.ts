import { describe, expect, it, vi } from "vitest";

import {
  api,
  ApiError,
  AUTH_TOKEN_STORAGE_KEY,
  downloadPdf,
  filenameFromContentDisposition,
  PDF_OBJECT_URL_TTL_MS,
  UNAUTHORIZED_EVENT,
} from "@/lib/api";

import { mockApi } from "@/test/mock-api";

describe("api.get", () => {
  it("sends the bearer token and parses the JSON body", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "secret-token");
    const { calls } = mockApi({ "GET /api/clients": () => ({ body: [{ id: "c1" }] }) });

    await expect(api.get("/api/clients")).resolves.toEqual([{ id: "c1" }]);

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("Authorization")).toBe("Bearer secret-token");
    expect(calls[0].headers.get("Accept")).toBe("application/json");
  });

  it("sends no Authorization header without a stored token", async () => {
    const { calls } = mockApi({ "GET /api/proposals": () => ({ body: [] }) });

    await api.get("/api/proposals");

    expect(calls[0].headers.get("Authorization")).toBeNull();
  });

  it("returns undefined for 204 responses", async () => {
    mockApi({ "GET /api/empty": () => ({ status: 204 }) });

    await expect(api.get("/api/empty")).resolves.toBeUndefined();
  });

  it("clears the token, notifies and throws on 401", async () => {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "expired");
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    mockApi({
      "GET /api/protected": () => ({ status: 401, body: { detail: "Token expired" } }),
    });

    const failure = await api.get("/api/protected").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(401);
    expect((failure as ApiError).isUnauthorized).toBe(true);
    expect((failure as ApiError).message).toBe("Token expired");
    expect(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  });

  it("does not clear the session when the login request itself is refused", async () => {
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    mockApi({ "POST /api/auth/login": () => ({ status: 401, body: {} }) });

    const failure = await api
      .post("/api/auth/login", { email: "a", password: "b" }, { auth: false })
      .catch((error: unknown) => error);

    expect((failure as ApiError).status).toBe(401);
    expect(onUnauthorized).not.toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  });

  it("surfaces the backend message for 404 and 500", async () => {
    mockApi({
      "GET /api/missing": () => ({ status: 404, body: { detail: "proposal not found" } }),
      "GET /api/broken": () => ({ status: 500, body: { error: "boom" } }),
    });

    const notFound = await api.get("/api/missing").catch((error: unknown) => error);
    const broken = await api.get("/api/broken").catch((error: unknown) => error);

    expect((notFound as ApiError).isNotFound).toBe(true);
    expect((notFound as ApiError).message).toBe("proposal not found");
    expect((broken as ApiError).status).toBe(500);
    expect((broken as ApiError).message).toBe("boom");
  });

  it("reports an unreachable API with status 0", async () => {
    mockApi({ "GET /api/down": () => { throw new TypeError("Failed to fetch"); } });

    const failure = await api.get("/api/down").catch((error: unknown) => error);

    expect((failure as ApiError).status).toBe(0);
    expect((failure as ApiError).isNetworkError).toBe(true);
  });

  it("deduplicates two identical concurrent GETs", async () => {
    const { calls } = mockApi({ "GET /api/dossier": () => ({ body: { id: "d1" } }) });

    const [first, second] = await Promise.all([
      api.get("/api/dossier"),
      api.get("/api/dossier"),
    ]);

    expect(calls).toHaveLength(1);
    expect(first).toEqual({ id: "d1" });
    expect(second).toEqual({ id: "d1" });
  });
});

describe("filenameFromContentDisposition", () => {
  it("extracts plain and encoded filenames", () => {
    expect(filenameFromContentDisposition('attachment; filename="REC-2026-0001.pdf"')).toBe(
      "REC-2026-0001.pdf",
    );
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''FAC%202026.pdf"),
    ).toBe("FAC 2026.pdf");
    expect(filenameFromContentDisposition(null)).toBeNull();
  });
});

describe("downloadPdf", () => {
  it("fetches the document with the JWT and saves it under the server filename", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, "secret-token");
    const { calls } = mockApi({
      "GET /api/invoices/i1/pdf": () => ({
        blob: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        headers: {
          "Content-Disposition": 'attachment; filename="FAC-2026-0001.pdf"',
        },
      }),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:rosii-test");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await downloadPdf("/api/invoices/i1/pdf", "fallback.pdf");

    expect(calls).toHaveLength(1);
    expect(calls[0].headers.get("Authorization")).toBe("Bearer secret-token");
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    // The blob URL must survive the click: revoking it immediately can abort
    // the download in the webview.
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(PDF_OBJECT_URL_TTL_MS);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:rosii-test");
    vi.useRealTimers();
  });

  it("throws a readable error when the document is gone", async () => {
    mockApi({ "GET /api/invoices/gone/pdf": () => ({ status: 404 }) });

    const failure = await downloadPdf("/api/invoices/gone/pdf", "x.pdf").catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(404);
    expect((failure as ApiError).message).toBe("Ce document n'existe plus.");
  });
});
