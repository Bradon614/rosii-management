import { vi } from "vitest";

export interface MockReply {
  status?: number;
  body?: unknown;
  /** Raw body (used for PDF blobs). */
  blob?: Blob;
  headers?: Record<string, string>;
}

export type MockHandler = (request: { url: string; init: RequestInit }) => MockReply;

export interface ApiMock {
  fetchMock: ReturnType<typeof vi.fn>;
  calls: Array<{ url: string; method: string; headers: Headers }>;
}

function buildResponse(reply: MockReply): Response {
  const status = reply.status ?? 200;
  const headers = new Headers(reply.headers);
  if (reply.blob) {
    headers.set("Content-Type", "application/pdf");
    return new Response(reply.blob, { status, headers });
  }
  if (status === 204 || reply.body === undefined) {
    return new Response(null, { status, headers });
  }
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(reply.body), { status, headers });
}

/**
 * Replaces `fetch` with a router over the API paths used by a test.
 *
 * Keys are `"/api/path"` (any method) or `"METHOD /api/path"`. An unprefixed
 * key matches every method. Any unexpected path fails the test loudly instead
 * of hitting the network.
 */
export function mockApi(routes: Record<string, MockHandler>): ApiMock {
  const calls: ApiMock["calls"] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url, method, headers: new Headers(init.headers) });

    const path = url.split("?")[0];
    const handler = routes[`${method} ${path}`] ?? routes[path];
    if (!handler) {
      throw new Error(`Unexpected API call: ${method} ${url}`);
    }
    return buildResponse(handler({ url, init }));
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}
