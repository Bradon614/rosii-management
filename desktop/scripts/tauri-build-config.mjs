#!/usr/bin/env node
/**
 * Writes the production Tauri configuration used by `npm run tauri:build`.
 *
 * The CSP must name the exact backend base URL the frontend calls. That URL is
 * provided at build time through `VITE_API_BASE_URL` — the very value Vite bakes
 * into the bundle — so the CSP and the client can never drift apart.
 *
 * No production URL is invented: the build fails when the variable is missing
 * or invalid, and the generated file is git-ignored. The normalization mirrors
 * `resolveApiBaseUrl` in `desktop/src/lib/api.ts`.
 */
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "src-tauri", "tauri.build.conf.json");

function fail(message) {
  console.error(`[tauri-build-config] ${message}`);
  process.exit(1);
}

const raw = (process.env.VITE_API_BASE_URL ?? "").trim();
if (!raw) {
  fail(
    "VITE_API_BASE_URL is required to build the desktop application: it is the " +
      "backend base URL the production CSP must allow.\n" +
      "Example (Git Bash):\n" +
      "  VITE_API_BASE_URL=https://api.example.mg npm run tauri:build",
  );
}

let parsed;
try {
  parsed = new URL(raw);
} catch {
  fail(`VITE_API_BASE_URL is not a valid URL: "${raw}"`);
}
if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
  fail(`VITE_API_BASE_URL must use http or https: "${raw}"`);
}
if (parsed.username || parsed.password) {
  fail("VITE_API_BASE_URL must not contain credentials.");
}
if (parsed.search || parsed.hash) {
  fail(`VITE_API_BASE_URL must not contain a query string or fragment: "${raw}"`);
}

let path = parsed.pathname.replace(/\/+$/, "");
if (path === "/api") {
  path = "";
} else if (path.endsWith("/api")) {
  path = path.slice(0, -"/api".length);
}
const baseUrl = `${parsed.origin}${path}`;

const config = {
  app: {
    security: {
      // Merged (JSON Merge Patch) into tauri.conf.json. `connect-src` keeps
      // Tauri's IPC endpoints and adds only the configured backend base URL.
      csp: {
        "connect-src": `'self' ipc: http://ipc.localhost ${baseUrl}`,
      },
    },
  },
};

writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`[tauri-build-config] API base URL -> ${baseUrl}`);
console.log(`[tauri-build-config] wrote ${outputPath}`);