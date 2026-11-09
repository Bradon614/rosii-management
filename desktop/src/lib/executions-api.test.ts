import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  EXECUTION_TRANSITIONS,
  allowedExecutionTransitions,
  executionCreateErrorMessage,
  executionDeleteErrorMessage,
  executionErrorMessage,
  executionStatusErrorMessage,
  executionUpdateErrorMessage,
  executionsPath,
} from "@/lib/executions-api";

describe("executionsPath — filtres réellement supportés par F10", () => {
  it("returns the global list when no filter is set", () => {
    expect(executionsPath()).toBe("/api/executions");
    expect(executionsPath({ preparationId: null, status: "", scheduledDate: "" })).toBe(
      "/api/executions",
    );
  });

  it("encodes all three backend parameters", () => {
    expect(
      executionsPath({
        preparationId: "aaa-bbb",
        status: "IN_PROGRESS",
        scheduledDate: "2026-12-12",
      }),
    ).toBe(
      "/api/executions?preparationId=aaa-bbb&status=IN_PROGRESS&scheduledDate=2026-12-12",
    );
  });

  it("encodes a preparation id", () => {
    expect(executionsPath({ preparationId: "id with space" })).toBe(
      "/api/executions?preparationId=id+with+space",
    );
  });
});

describe("EXECUTION_TRANSITIONS — miroir exact du backend", () => {
  it("matches the F10 state machine", () => {
    expect(EXECUTION_TRANSITIONS).toEqual({
      PLANNED: ["IN_PROGRESS", "CANCELLED"],
      IN_PROGRESS: ["COMPLETED", "CANCELLED"],
      COMPLETED: [],
      CANCELLED: [],
    });
  });

  it("offers no outgoing transition from a terminal status", () => {
    expect(allowedExecutionTransitions("COMPLETED")).toEqual([]);
    expect(allowedExecutionTransitions("CANCELLED")).toEqual([]);
  });
});

describe("messages d'erreur des exécutions", () => {
  it("maps the read errors", () => {
    expect(executionErrorMessage(new ApiError(404, "not found"))).toContain(
      "n'existe pas ou a été supprimée",
    );
    expect(executionErrorMessage(new ApiError(403, "forbidden"))).toBe("Accès refusé.");
    expect(executionErrorMessage(new ApiError(0, "offline"))).toContain("offline");
  });

  it("maps the creation conflicts and missing preparation", () => {
    expect(executionCreateErrorMessage(new ApiError(409, "conflict"))).toContain(
      "conditions (proposition acceptée, dépôt requis atteint)",
    );
    expect(executionCreateErrorMessage(new ApiError(404, "missing"))).toContain(
      "préparation n'existe plus",
    );
  });

  it("maps the update version conflict", () => {
    expect(executionUpdateErrorMessage(new ApiError(409, "stale"))).toContain(
      "version obsolète",
    );
    expect(executionUpdateErrorMessage(new ApiError(400, "bad"))).toContain("invalides");
  });

  it("maps the transition conflict", () => {
    expect(executionStatusErrorMessage(new ApiError(409, "illegal"))).toContain(
      "transition n'est plus autorisée",
    );
  });

  it("maps the deletion errors", () => {
    expect(executionDeleteErrorMessage(new ApiError(404, "missing"))).toBe(
      "Cette exécution n'existe plus.",
    );
    expect(executionDeleteErrorMessage(new ApiError(409, "conflict"))).toContain(
      "conflit de version",
    );
  });
});
