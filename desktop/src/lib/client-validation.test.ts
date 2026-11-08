import { describe, expect, it } from "vitest";

import {
  CLIENT_LIMITS,
  EMPTY_CLIENT_FORM,
  clientToFormValues,
  validateClient,
  type ClientFormValues,
} from "@/lib/client-validation";

import { normalizeSpaces } from "@/test/fixtures";

function values(overrides: Partial<ClientFormValues> = {}): ClientFormValues {
  return { ...EMPTY_CLIENT_FORM, name: "Alice Rakoto", phone1: "+261 34 12 34 56 78", ...overrides };
}

describe("validateClient — champs obligatoires", () => {
  it("accepts the minimal valid client and trims the values", () => {
    const result = validateClient(values({ name: "  Alice Rakoto  ", phone1: " 034 12 345 67 " }));

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      name: "Alice Rakoto",
      phone1: "034 12 345 67",
      phone2: null,
      email: null,
      notes: null,
    });
  });

  it("rejects a missing name", () => {
    const result = validateClient(values({ name: "   " }));

    expect(result.payload).toBeNull();
    expect(result.errors.name).toBe("Le nom est obligatoire.");
  });

  it("rejects a missing main phone", () => {
    const result = validateClient(values({ phone1: "" }));

    expect(result.payload).toBeNull();
    expect(result.errors.phone1).toBe("Le téléphone principal est obligatoire.");
  });

  it("treats a whitespace-only optional phone as absent", () => {
    const result = validateClient(values({ phone2: "    " }));

    expect(result.errors).toEqual({});
    expect(result.payload?.phone2).toBeNull();
  });
});

describe("validateClient — limites de caractères", () => {
  it("accepts the maximum lengths", () => {
    const result = validateClient(
      values({
        name: "n".repeat(CLIENT_LIMITS.name),
        phone1: "1".repeat(CLIENT_LIMITS.phone),
        phone2: "2".repeat(CLIENT_LIMITS.phone),
        email: `${"a".repeat(CLIENT_LIMITS.email - 12)}@example.mg`,
        notes: "x".repeat(CLIENT_LIMITS.notes),
      }),
    );

    expect(result.errors).toEqual({});
    expect(result.payload?.name).toHaveLength(CLIENT_LIMITS.name);
  });

  it("rejects a name longer than 200 characters", () => {
    const result = validateClient(values({ name: "n".repeat(CLIENT_LIMITS.name + 1) }));

    expect(result.errors.name).toBe("Le nom ne peut pas dépasser 200 caractères.");
  });

  it("rejects phones longer than 30 characters", () => {
    const result = validateClient(
      values({
        phone1: "1".repeat(CLIENT_LIMITS.phone + 1),
        phone2: "2".repeat(CLIENT_LIMITS.phone + 1),
      }),
    );

    expect(result.errors.phone1).toContain("30 caractères");
    expect(result.errors.phone2).toContain("30 caractères");
  });

  it("rejects notes longer than 2000 characters", () => {
    const result = validateClient(values({ notes: "x".repeat(CLIENT_LIMITS.notes + 1) }));

    expect(normalizeSpaces(result.errors.notes)).toContain("2 000 caractères");
  });

  it("rejects an email longer than 255 characters", () => {
    const result = validateClient(
      values({ email: `${"a".repeat(CLIENT_LIMITS.email)}@example.mg` }),
    );

    expect(result.errors.email).toContain("255 caractères");
  });
});

describe("validateClient — email facultatif", () => {
  it("rejects a malformed email", () => {
    const result = validateClient(values({ email: "pas-un-email" }));

    expect(result.errors.email).toBe("L'adresse email n'est pas valide.");
  });

  it("accepts a valid email and keeps it optional", () => {
    expect(validateClient(values({ email: "alice@example.mg" })).errors.email).toBeUndefined();
    expect(validateClient(values({ email: "" })).payload?.email).toBeNull();
  });
});

describe("clientToFormValues", () => {
  it("maps a backend client to the form, with empty strings for nulls", () => {
    expect(
      clientToFormValues({
        name: "Alice",
        phone1: "034",
        phone2: null,
        email: "a@b.mg",
        notes: null,
      }),
    ).toEqual({ name: "Alice", phone1: "034", phone2: "", email: "a@b.mg", notes: "" });
  });
});
