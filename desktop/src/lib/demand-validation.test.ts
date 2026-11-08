import { describe, expect, it } from "vitest";

import {
  EMPTY_DEMAND_FORM,
  demandToFormValues,
  parseAmount,
  validateDemand,
  type DemandFormValues,
} from "@/lib/demand-validation";
import type { Demand } from "@/types/api";

function values(overrides: Partial<DemandFormValues> = {}): DemandFormValues {
  return {
    ...EMPTY_DEMAND_FORM,
    clientId: "22222222-2222-2222-2222-222222222222",
    type: "EVENT",
    ...overrides,
  };
}

describe("validateDemand — champs obligatoires", () => {
  it("accepts a minimal demand and normalizes optional values", () => {
    const result = validateDemand(values({ location: "  Salle A  ", notes: "   " }));

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      clientId: "22222222-2222-2222-2222-222222222222",
      type: "EVENT",
      status: "NEW",
      requestedDate: null,
      estimatedPeople: null,
      budgetType: "NONE",
      budgetMin: null,
      budgetMax: null,
      location: "Salle A",
      notes: null,
      eventDetails: null,
    });
  });

  it("requires a client", () => {
    const result = validateDemand(values({ clientId: "" }));

    expect(result.payload).toBeNull();
    expect(result.errors.clientId).toBe("Sélectionnez un client.");
  });

  it("requires a type", () => {
    const result = validateDemand(values({ type: "" }));

    expect(result.payload).toBeNull();
    expect(result.errors.type).toBe("Sélectionnez le type de demande.");
  });

  it("rejects a non-positive or non-integer number of people", () => {
    expect(validateDemand(values({ estimatedPeople: "0" })).errors.estimatedPeople).toContain(
      "supérieur ou égal à 1",
    );
    expect(validateDemand(values({ estimatedPeople: "1.5" })).errors.estimatedPeople).toContain(
      "supérieur ou égal à 1",
    );
    expect(validateDemand(values({ estimatedPeople: "120" })).payload?.estimatedPeople).toBe(120);
  });
});

describe("validateDemand — budget", () => {
  it("sends no amount for NONE, even when amounts were typed", () => {
    const result = validateDemand(
      values({ budgetType: "NONE", budgetMin: "1000", budgetMax: "2000" }),
    );

    expect(result.errors).toEqual({});
    expect(result.payload?.budgetMin).toBeNull();
    expect(result.payload?.budgetMax).toBeNull();
  });

  it("duplicates the single amount for EXACT (min = max)", () => {
    const result = validateDemand(values({ budgetType: "EXACT", budgetMin: "500 000" }));

    expect(result.errors).toEqual({});
    expect(result.payload?.budgetMin).toBe(500000);
    expect(result.payload?.budgetMax).toBe(500000);
  });

  it("requires the amount for EXACT", () => {
    const result = validateDemand(values({ budgetType: "EXACT", budgetMin: "  " }));

    expect(result.errors.budgetMin).toBe("Saisissez le montant du budget exact.");
  });

  it("accepts a French decimal comma and rejects malformed amounts", () => {
    expect(parseAmount("1 234,50")).toEqual({ valid: true, value: 1234.5 });
    expect(parseAmount("1234.5")).toEqual({ valid: true, value: 1234.5 });
    expect(parseAmount("abc").valid).toBe(false);
    expect(parseAmount("-5").valid).toBe(false);
    expect(parseAmount("1.234").valid).toBe(false);
    expect(parseAmount("1234567890123").valid).toBe(false);
  });

  it("requires both bounds for RANGE and enforces min < max", () => {
    expect(validateDemand(values({ budgetType: "RANGE", budgetMin: "1000" })).errors.budgetMax).toBe(
      "Saisissez le budget maximum.",
    );

    const inverted = validateDemand(
      values({ budgetType: "RANGE", budgetMin: "2000", budgetMax: "2000" }),
    );
    expect(inverted.errors.budgetMax).toBe(
      "Le budget maximum doit être supérieur au budget minimum.",
    );

    const valid = validateDemand(
      values({ budgetType: "RANGE", budgetMin: "400000", budgetMax: "800000" }),
    );
    expect(valid.errors).toEqual({});
    expect(valid.payload?.budgetMin).toBe(400000);
    expect(valid.payload?.budgetMax).toBe(800000);
  });
});

describe("validateDemand — longueurs", () => {
  it("enforces the documented text limits", () => {
    expect(validateDemand(values({ location: "x".repeat(501) })).errors.location).toContain(
      "500 caractères",
    );
    expect(validateDemand(values({ notes: "x".repeat(2001) })).errors.notes).toContain(
      "caractères",
    );
    expect(
      validateDemand(values({ eventType: "x".repeat(101) })).errors.eventType,
    ).toContain("100 caractères");
  });
});

describe("validateDemand — informations événementielles", () => {
  it("keeps event details null while nothing is filled", () => {
    const result = validateDemand(values({ type: "EVENT" }));

    expect(result.payload?.eventDetails).toBeNull();
  });

  it("requires the event type as soon as something event-related is filled", () => {
    const result = validateDemand(values({ type: "EVENT", theme: "Champêtre" }));

    expect(result.payload).toBeNull();
    expect(result.errors.eventType).toContain("obligatoire");
  });

  it("maps the tri-state flags to the backend nullable booleans", () => {
    const result = validateDemand(
      values({
        type: "EVENT",
        eventType: "Mariage",
        hallNeeded: "YES",
        cateringRequested: "YES",
        decorationRequested: "NO",
        floristRequested: "UNSET",
      }),
    );

    expect(result.errors).toEqual({});
    expect(result.payload?.eventDetails).toEqual({
      eventType: "Mariage",
      hallNeeded: true,
      desiredHall: null,
      cateringRequested: true,
      decorationRequested: false,
      floristRequested: null,
      equipmentRentalRequested: null,
      transportRequested: null,
      theme: null,
      notes: null,
    });
  });

  it("ignores event fields when the demand is not an EVENT", () => {
    const result = validateDemand(
      values({ type: "CATERING", eventType: "Mariage", hallNeeded: "YES" }),
    );

    expect(result.payload?.eventDetails).toBeNull();
  });
});

describe("demandToFormValues", () => {
  it("maps a backend demand into the form, including tri-state flags", () => {
    const demand: Demand = {
      id: "d1",
      clientId: "c1",
      clientName: "Alice Rakoto",
      type: "EVENT",
      status: "QUOTE_SENT",
      requestedDate: "2026-12-12",
      estimatedPeople: 120,
      budgetType: "RANGE",
      budgetMin: 400000,
      budgetMax: 800000,
      location: "Salle A",
      notes: "Note",
      eventDetails: {
        eventType: "Mariage",
        hallNeeded: true,
        desiredHall: null,
        cateringRequested: false,
        decorationRequested: null,
        floristRequested: null,
        equipmentRentalRequested: null,
        transportRequested: null,
        theme: null,
        notes: null,
      },
      createdAt: "2026-09-01T06:00:00Z",
      updatedAt: "2026-09-01T06:00:00Z",
      version: 3,
    };

    expect(demandToFormValues(demand)).toMatchObject({
      clientId: "c1",
      type: "EVENT",
      status: "QUOTE_SENT",
      requestedDate: "2026-12-12",
      estimatedPeople: "120",
      budgetType: "RANGE",
      budgetMin: "400000",
      budgetMax: "800000",
      eventType: "Mariage",
      hallNeeded: "YES",
      cateringRequested: "NO",
      decorationRequested: "UNSET",
    });
  });

  it("uses empty strings for null values", () => {
    const form = demandToFormValues({
      id: "d1",
      clientId: "c1",
      clientName: "Alice",
      type: "OTHER",
      status: "NEW",
      requestedDate: null,
      estimatedPeople: null,
      budgetType: "NONE",
      budgetMin: null,
      budgetMax: null,
      location: null,
      notes: null,
      eventDetails: null,
      createdAt: "2026-09-01T06:00:00Z",
      updatedAt: "2026-09-01T06:00:00Z",
      version: 0,
    });

    expect(form.requestedDate).toBe("");
    expect(form.estimatedPeople).toBe("");
    expect(form.budgetMin).toBe("");
    expect(form.location).toBe("");
    expect(form.eventType).toBe("");
    expect(form.hallNeeded).toBe("UNSET");
  });
});
