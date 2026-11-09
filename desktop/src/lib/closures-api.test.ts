import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import {
  closureCreateErrorMessage,
  closureDeleteErrorMessage,
  closureErrorMessage,
  closuresPath,
} from "@/lib/closures-api";

describe("closuresPath — filtres réellement supportés par F11", () => {
  it("returns the global list when no filter is set", () => {
    expect(closuresPath()).toBe("/api/closures");
    expect(closuresPath({ preparationId: null, status: "" })).toBe("/api/closures");
  });

  it("encodes both backend parameters", () => {
    expect(
      closuresPath({ preparationId: "aaa-bbb", status: "WITH_ISSUE" }),
    ).toBe("/api/closures?preparationId=aaa-bbb&status=WITH_ISSUE");
  });

  it("encodes a preparation id", () => {
    expect(closuresPath({ preparationId: "id with space" })).toBe(
      "/api/closures?preparationId=id+with+space",
    );
  });
});

describe("messages d'erreur des clôtures", () => {
  it("maps the read errors", () => {
    expect(closureErrorMessage(new ApiError(404, "missing"))).toBe(
      "Cette clôture n'existe pas ou a été supprimée.",
    );
    expect(closureErrorMessage(new ApiError(403, "forbidden"))).toBe("Accès refusé.");
    expect(closureErrorMessage(new ApiError(0, "offline"))).toContain("offline");
  });

  it("maps the creation conflicts and missing context", () => {
    expect(closureCreateErrorMessage(new ApiError(409, "conflict"))).toContain(
      "conditions (proposition acceptée, dépôt atteint, exécution terminée)",
    );
    expect(closureCreateErrorMessage(new ApiError(404, "missing"))).toContain(
      "préparation ou son exécution n'existe plus",
    );
    expect(closureCreateErrorMessage(new ApiError(400, "bad"))).toContain(
      "notes finales limitées à 2 000 caractères",
    );
  });

  it("maps the deletion errors", () => {
    expect(closureDeleteErrorMessage(new ApiError(404, "missing"))).toBe(
      "Cette clôture n'existe plus.",
    );
    expect(closureDeleteErrorMessage(new ApiError(409, "conflict"))).toContain(
      "conflit",
    );
  });
});
