import { afterEach, describe, expect, it, vi } from "vitest";

import { apiUrl, resolveApiBaseUrl } from "@/lib/api";

describe("resolveApiBaseUrl", () => {
  it("keeps an empty base URL so the Vite dev proxy handles /api", () => {
    expect(resolveApiBaseUrl(undefined)).toEqual({ baseUrl: "", error: null });
    expect(resolveApiBaseUrl("   ")).toEqual({ baseUrl: "", error: null });
  });

  it("uses the configured backend origin", () => {
    expect(resolveApiBaseUrl("http://192.168.1.20:8080")).toEqual({
      baseUrl: "http://192.168.1.20:8080",
      error: null,
    });
  });

  it("removes trailing slashes", () => {
    expect(resolveApiBaseUrl("https://api.rosii.mg///").baseUrl).toBe("https://api.rosii.mg");
  });

  it("removes an accidental /api suffix instead of producing /api/api", () => {
    expect(resolveApiBaseUrl("http://tauri.localhost:8080/api").baseUrl).toBe(
      "http://tauri.localhost:8080",
    );
    expect(resolveApiBaseUrl("http://tauri.localhost:8080/api/").baseUrl).toBe(
      "http://tauri.localhost:8080",
    );
  });

  it("keeps a reverse-proxy path", () => {
    expect(resolveApiBaseUrl("https://example.mg/rosii/api").baseUrl).toBe(
      "https://example.mg/rosii",
    );
  });

  it("reports an invalid URL and falls back to same-origin", () => {
    const result = resolveApiBaseUrl("pas-une-url");

    expect(result.baseUrl).toBe("");
    expect(result.error).toContain("URL valide");
  });

  it("rejects a non-http scheme", () => {
    const result = resolveApiBaseUrl("file:///C:/rosii");

    expect(result.baseUrl).toBe("");
    expect(result.error).toContain("http ou https");
  });

  it("rejects embedded credentials", () => {
    const result = resolveApiBaseUrl("https://user:secret@example.mg");

    expect(result.baseUrl).toBe("");
    expect(result.error).toContain("identifiant");
  });

  it("rejects a query string or fragment", () => {
    expect(resolveApiBaseUrl("https://example.mg?token=abc").error).toContain("query string");
    expect(resolveApiBaseUrl("https://example.mg#x").error).toContain("fragment");
  });
});

describe("apiUrl", () => {
  it("keeps relative paths when no base URL is configured", () => {
    expect(apiUrl("/api/auth/me")).toBe("/api/auth/me");
    expect(apiUrl("api/health")).toBe("/api/health");
  });

  it("prefixes requests with the configured origin", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "https://api.rosii.mg");

    const configured = await import("@/lib/api");

    expect(configured.apiUrl("/api/auth/me")).toBe("https://api.rosii.mg/api/auth/me");
  });

  it("does not use a malformed base URL and reports it", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_BASE_URL", "not a url");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const configured = await import("@/lib/api");

    expect(configured.apiUrl("/api/health")).toBe("/api/health");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("VITE_API_BASE_URL"));
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});