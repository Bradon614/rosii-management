import { describe, expect, it } from "vitest";

import {
  CLOSURE_LIMITS,
  createClosureForm,
  validateClosure,
} from "@/lib/closure-validation";
import { PREPARATION_ID } from "@/test/fixtures";

describe("createClosureForm — valeurs par défaut, sans note fictive", () => {
  it("starts on the standard COMPLETED status with empty notes", () => {
    expect(createClosureForm()).toEqual({
      status: "COMPLETED",
      finalNotes: "",
    });
  });
});

describe("validateClosure — contrat POST F11", () => {
  it("builds the exact COMPLETED payload with null notes", () => {
    const result = validateClosure(createClosureForm(), {
      preparationId: PREPARATION_ID,
    });

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      preparationId: PREPARATION_ID,
      status: "COMPLETED",
      finalNotes: null,
    });
  });

  it("sends WITH_ISSUE with trimmed notes", () => {
    const result = validateClosure(
      { status: "WITH_ISSUE", finalNotes: "  Matériel manquant.  " },
      { preparationId: PREPARATION_ID },
    );

    expect(result.payload).toEqual({
      preparationId: PREPARATION_ID,
      status: "WITH_ISSUE",
      finalNotes: "Matériel manquant.",
    });
  });

  it("accepts exactly 2000 characters", () => {
    const result = validateClosure(
      { status: "COMPLETED", finalNotes: "x".repeat(CLOSURE_LIMITS.finalNotes) },
      { preparationId: PREPARATION_ID },
    );

    expect(result.errors).toEqual({});
    expect(result.payload?.finalNotes).toHaveLength(2000);
  });

  it("refuses more than 2000 characters", () => {
    const result = validateClosure(
      { status: "COMPLETED", finalNotes: "x".repeat(CLOSURE_LIMITS.finalNotes + 1) },
      { preparationId: PREPARATION_ID },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.finalNotes).toMatch(/2\s000/);
  });

  it("refuses an unknown status", () => {
    const result = validateClosure(
      { status: "ARCHIVED" as never, finalNotes: "" },
      { preparationId: PREPARATION_ID },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.status).toBe("Sélectionnez un résultat de clôture valide.");
  });

  it("never includes closedAt in the payload", () => {
    const result = validateClosure(createClosureForm(), {
      preparationId: PREPARATION_ID,
    });

    expect(result.payload).not.toHaveProperty("closedAt");
  });
});
