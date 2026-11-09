import { describe, expect, it } from "vitest";

import {
  createExecutionForm,
  validateExecutionUpdate,
  EXECUTION_LIMITS,
} from "@/lib/execution-validation";
import { buildExecution } from "@/test/fixtures";

describe("createExecutionForm — valeurs du DTO, sans invention", () => {
  it("prefills every field and converts HH:mm:ss to the time input format", () => {
    const form = createExecutionForm(
      buildExecution({
        scheduledDate: "2026-12-12",
        startTime: "18:00:00",
        endTime: "23:30:00",
        location: "Salle des fêtes",
        notes: "Montage le matin",
      }),
    );

    expect(form).toEqual({
      scheduledDate: "2026-12-12",
      startTime: "18:00",
      endTime: "23:30",
      location: "Salle des fêtes",
      notes: "Montage le matin",
    });
  });

  it("keeps an absent schedule empty instead of inventing a date", () => {
    const form = createExecutionForm(
      buildExecution({
        scheduledDate: null,
        startTime: null,
        endTime: null,
        location: null,
        notes: null,
      }),
    );

    expect(form).toEqual({
      scheduledDate: "",
      startTime: "",
      endTime: "",
      location: "",
      notes: "",
    });
  });
});

describe("validateExecutionUpdate — contrat PUT F10", () => {
  it("builds the exact PLANNED payload with null optional values", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-12",
        startTime: "",
        endTime: "",
        location: "  ",
        notes: "",
      },
      { version: 3, status: "PLANNED" },
    );

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      version: 3,
      scheduledDate: "2026-12-12",
      startTime: null,
      endTime: null,
      location: null,
      notes: null,
    });
  });

  it("sends the full PLANNED operational information", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-20",
        startTime: "08:00",
        endTime: "17:00",
        location: "Salle A",
        notes: "Montage",
      },
      { version: 1, status: "PLANNED" },
    );

    expect(result.payload).toEqual({
      version: 1,
      scheduledDate: "2026-12-20",
      startTime: "08:00",
      endTime: "17:00",
      location: "Salle A",
      notes: "Montage",
    });
  });

  it("requires scheduledDate on every PUT", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "",
        startTime: "",
        endTime: "",
        location: "Salle A",
        notes: "",
      },
      { version: 0, status: "PLANNED" },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.scheduledDate).toBe("La date programmée est obligatoire.");
  });

  it("refuses an end time before the start time", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-20",
        startTime: "17:00",
        endTime: "08:00",
        location: "",
        notes: "",
      },
      { version: 0, status: "PLANNED" },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.endTime).toBe(
      "L'heure de fin ne peut pas précéder l'heure de début.",
    );
  });

  it("refuses an invalid time", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-20",
        startTime: "25:00",
        endTime: "",
        location: "",
        notes: "",
      },
      { version: 0, status: "PLANNED" },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.startTime).toBe("L'heure de début n'est pas valide.");
  });

  it("enforces the DTO location and notes lengths", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-20",
        startTime: "",
        endTime: "",
        location: "x".repeat(EXECUTION_LIMITS.location + 1),
        notes: "y".repeat(EXECUTION_LIMITS.notes + 1),
      },
      { version: 0, status: "PLANNED" },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.location).toContain("500");
    expect(result.errors.notes).toContain("2");
  });

  it("re-sends the locked schedule unchanged while IN_PROGRESS", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "2026-12-20",
        startTime: "08:00",
        endTime: "17:00",
        location: "Salle B",
        notes: "Retard sonorisation",
      },
      { version: 4, status: "IN_PROGRESS" },
    );

    expect(result.payload).toEqual({
      version: 4,
      scheduledDate: "2026-12-20",
      startTime: "08:00",
      endTime: "17:00",
      location: "Salle B",
      notes: "Retard sonorisation",
    });
  });

  it("still requires the locked date while IN_PROGRESS", () => {
    const result = validateExecutionUpdate(
      {
        scheduledDate: "",
        startTime: "",
        endTime: "",
        location: "Salle B",
        notes: "",
      },
      { version: 4, status: "IN_PROGRESS" },
    );

    expect(result.payload).toBeNull();
    expect(result.errors.scheduledDate).toBe("La date programmée est obligatoire.");
  });
});
