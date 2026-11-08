import { describe, expect, it } from "vitest";

import { buildProposal } from "@/test/fixtures";
import {
  createEmptyProposalForm,
  createEmptyLine,
  parseDecimal,
  proposalToFormValues,
  estimateProposal,
  validateProposal,
  type ProposalFormValues,
} from "@/lib/proposal-validation";
import { formatAriary } from "@/lib/format";

function values(overrides: Partial<ProposalFormValues> = {}): ProposalFormValues {
  return {
    ...createEmptyProposalForm(),
    demandId: "33333333-3333-3333-3333-333333333333",
    clientId: "22222222-2222-2222-2222-222222222222",
    requiredDeposit: "100000",
    lines: [
      {
        ...createEmptyLine(),
        description: "Traiteur mariage",
        unit: "personne",
        quantity: "80",
        unitPrice: "4500",
      },
    ],
    ...overrides,
  };
}

const OPTIONS = { createdOn: "2026-11-08" };

describe("validateProposal — contrat minimal", () => {
  it("accepts a valid proposal and builds the F07 payload", () => {
    const result = validateProposal(values({ title: "  Mariage  ", notes: "   " }), OPTIONS);

    expect(result.errors).toEqual({});
    expect(result.lineErrors).toEqual([{}]);
    expect(result.payload).toEqual({
      clientId: "22222222-2222-2222-2222-222222222222",
      demandId: "33333333-3333-3333-3333-333333333333",
      title: "Mariage",
      validUntil: null,
      requiredDeposit: 100000,
      notes: null,
      lines: [
        {
          serviceId: null,
          description: "Traiteur mariage",
          unit: "personne",
          quantity: 80,
          unitPrice: 4500,
          notes: null,
        },
      ],
    });
  });

  it("requires a demand (and its client)", () => {
    const result = validateProposal(values({ demandId: "", clientId: "" }), OPTIONS);

    expect(result.payload).toBeNull();
    expect(result.errors.demandId).toBe("Sélectionnez une demande.");
  });

  it("requires at least one line", () => {
    const result = validateProposal(values({ lines: [] }), OPTIONS);

    expect(result.payload).toBeNull();
    expect(result.errors.lines).toBe("Ajoutez au moins une ligne à la proposition.");
  });
});

describe("validateProposal — lignes", () => {
  it("requires description and unit", () => {
    const result = validateProposal(
      values({ lines: [{ ...createEmptyLine(), quantity: "1", unitPrice: "10" }] }),
      OPTIONS,
    );

    expect(result.lineErrors[0].description).toBe("La description est obligatoire.");
    expect(result.lineErrors[0].unit).toBe("L'unité est obligatoire.");
  });

  it("enforces quantity > 0 and numeric(14,3)", () => {
    const zero = validateProposal(
      values({
        lines: [{ ...createEmptyLine(), description: "X", unit: "u", quantity: "0", unitPrice: "10" }],
      }),
      OPTIONS,
    );
    expect(zero.lineErrors[0].quantity).toBe("La quantité doit être supérieure à zéro.");

    const tooPrecise = validateProposal(
      values({
        lines: [
          { ...createEmptyLine(), description: "X", unit: "u", quantity: "1.2345", unitPrice: "10" },
        ],
      }),
      OPTIONS,
    );
    expect(tooPrecise.lineErrors[0].quantity).toContain("3 décimales");

    const valid = validateProposal(
      values({
        requiredDeposit: "10",
        lines: [
          { ...createEmptyLine(), description: "X", unit: "u", quantity: "1.234", unitPrice: "10" },
        ],
      }),
      OPTIONS,
    );
    expect(valid.payload?.lines[0].quantity).toBe(1.234);
  });

  it("accepts a zero unit price and rejects negative or over-precise prices", () => {
    const zero = validateProposal(
      values({
        requiredDeposit: "1",
        lines: [{ ...createEmptyLine(), description: "X", unit: "u", quantity: "1", unitPrice: "0" }],
      }),
      OPTIONS,
    );
    expect(zero.payload?.lines[0].unitPrice).toBe(0);

    const negative = validateProposal(
      values({
        lines: [{ ...createEmptyLine(), description: "X", unit: "u", quantity: "1", unitPrice: "-1" }],
      }),
      OPTIONS,
    );
    expect(negative.lineErrors[0].unitPrice).toContain("2 décimales");
  });

  it("keeps a line without service and forwards a selected service", () => {
    const result = validateProposal(
      values({
        requiredDeposit: "100",
        lines: [
          {
            ...createEmptyLine(),
            serviceId: "service-1",
            description: "Traiteur",
            unit: "personne",
            quantity: "1",
            unitPrice: "4500",
          },
        ],
      }),
      OPTIONS,
    );

    expect(result.payload?.lines[0].serviceId).toBe("service-1");
    expect(validateProposal(values(), OPTIONS).payload?.lines[0].serviceId).toBeNull();
  });
});

describe("validateProposal — dépôt et validité", () => {
  it("requires a positive deposit within the estimated total", () => {
    expect(validateProposal(values({ requiredDeposit: "" }), OPTIONS).errors.requiredDeposit).toBe(
      "Saisissez le dépôt demandé.",
    );
    expect(validateProposal(values({ requiredDeposit: "0" }), OPTIONS).errors.requiredDeposit).toBe(
      "Le dépôt demandé doit être supérieur à zéro.",
    );

    const tooHigh = validateProposal(values({ requiredDeposit: "400000" }), OPTIONS);
    expect(tooHigh.errors.requiredDeposit).toContain("ne peut pas dépasser le total");

    // 80 × 4500 = 360 000 exactly.
    expect(validateProposal(values({ requiredDeposit: "360000" }), OPTIONS).payload).not.toBeNull();
  });

  it("accepts an absent validity date but rejects one before the creation date", () => {
    expect(validateProposal(values({ validUntil: "" }), OPTIONS).payload?.validUntil).toBeNull();
    expect(validateProposal(values({ validUntil: "2026-11-08" }), OPTIONS).errors.validUntil).toBeUndefined();
    expect(validateProposal(values({ validUntil: "2026-11-07" }), OPTIONS).errors.validUntil).toBe(
      "La date de validité ne peut pas être antérieure à la création de la proposition.",
    );
  });

  it("enforces the documented text limits", () => {
    expect(validateProposal(values({ title: "x".repeat(201) }), OPTIONS).errors.title).toContain(
      "200 caractères",
    );
    expect(validateProposal(values({ notes: "x".repeat(2001) }), OPTIONS).errors.notes).toContain(
      "caractères",
    );
  });
});

describe("estimation indicative", () => {
  it("computes the same formula as the backend (HALF_UP, 2 decimals)", () => {
    const estimate = estimateProposal([
      { ...createEmptyLine(), quantity: "80", unitPrice: "4500" },
      { ...createEmptyLine(), quantity: "1", unitPrice: "150000" },
    ]);

    expect(estimate.lineTotals).toEqual([360000, 150000]);
    expect(estimate.total).toBe(510000);
    expect(formatAriary(estimate.total)).toMatch(/510\s000\sAr/);
  });

  it("uses a French comma and spaces in amounts", () => {
    expect(parseDecimal("1 234,50", 12, 2)).toEqual({ valid: true, value: 1234.5 });
    expect(parseDecimal("4 500", 12, 2)).toEqual({ valid: true, value: 4500 });
    expect(parseDecimal("abc", 12, 2).valid).toBe(false);
    expect(parseDecimal("1.234", 12, 2).valid).toBe(false);
  });
});

describe("proposalToFormValues", () => {
  it("maps a backend proposal into the editable form", () => {
    const form = proposalToFormValues(buildProposal());

    expect(form.demandId).toBe(buildProposal().demandId);
    expect(form.clientId).toBe(buildProposal().clientId);
    expect(form.title).toBe("Mariage Rakoto");
    expect(form.validUntil).toBe("2999-12-31");
    expect(form.requiredDeposit).toBe("100000");
    expect(form.lines).toHaveLength(1);
    expect(form.lines[0]).toMatchObject({
      serviceId: "",
      description: "Traiteur mariage",
      unit: "personne",
      quantity: "2",
      unitPrice: "250000",
    });
  });

  it("uses empty strings for null values", () => {
    const form = proposalToFormValues(
      buildProposal({ title: null, validUntil: null, notes: null }),
    );

    expect(form.title).toBe("");
    expect(form.validUntil).toBe("");
    expect(form.notes).toBe("");
  });
});
