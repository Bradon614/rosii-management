import { describe, expect, it } from "vitest";

import { createPaymentForm, validatePayment, type PaymentFormValues } from "@/lib/payment-validation";

const OPTIONS = { proposalId: "proposal-1", remainingAmount: 350000 };

function values(overrides: Partial<PaymentFormValues> = {}): PaymentFormValues {
  return {
    amount: "150000",
    method: "MOBILE_MONEY",
    paymentDate: "2026-11-08",
    reference: "Mvola 42",
    notes: "",
    ...overrides,
  };
}

describe("createPaymentForm", () => {
  it("starts with today's date and no invented amount", () => {
    const form = createPaymentForm();

    expect(form.amount).toBe("");
    expect(form.method).toBe("");
    expect(form.reference).toBe("");
    expect(form.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("validatePayment — montant", () => {
  it("builds the F08 payload with nulls for empty optional values", () => {
    const result = validatePayment(values(), OPTIONS);

    expect(result.errors).toEqual({});
    expect(result.payload).toEqual({
      proposalId: "proposal-1",
      amount: 150000,
      method: "MOBILE_MONEY",
      paymentDate: "2026-11-08",
      reference: "Mvola 42",
      notes: null,
    });
  });

  it("requires a strictly positive amount", () => {
    expect(validatePayment(values({ amount: "" }), OPTIONS).errors.amount).toBe(
      "Saisissez le montant du paiement.",
    );
    expect(validatePayment(values({ amount: "0" }), OPTIONS).errors.amount).toBe(
      "Le montant doit être supérieur à zéro.",
    );
    expect(validatePayment(values({ amount: "-500" }), OPTIONS).errors.amount).toContain(
      "2 décimales",
    );
  });

  it("accepts an amount above the deposit as long as it stays within the remaining", () => {
    // Deposit is 100 000 for the fixture proposal; 150 000 is allowed.
    expect(validatePayment(values({ amount: "150000" }), OPTIONS).payload?.amount).toBe(150000);
  });

  it("refuses an amount above the remaining", () => {
    const result = validatePayment(values({ amount: "400000" }), OPTIONS);

    expect(result.payload).toBeNull();
    expect(result.errors.amount).toContain("ne peut pas dépasser le reste à payer");
  });

  it("accepts spaces and a French comma", () => {
    expect(validatePayment(values({ amount: "150 000,50" }), OPTIONS).payload?.amount).toBe(150000.5);
  });
});

describe("validatePayment — méthode et date", () => {
  it("requires a payment method", () => {
    const result = validatePayment(values({ method: "" }), OPTIONS);

    expect(result.payload).toBeNull();
    expect(result.errors.method).toBe("Sélectionnez la méthode de paiement.");
  });

  it("accepts every backend method", () => {
    for (const method of ["CASH", "MOBILE_MONEY", "BANK_TRANSFER"] as const) {
      expect(validatePayment(values({ method }), OPTIONS).payload?.method).toBe(method);
    }
  });

  it("requires a valid payment date", () => {
    expect(validatePayment(values({ paymentDate: "" }), OPTIONS).errors.paymentDate).toBe(
      "La date du paiement est obligatoire.",
    );
    expect(validatePayment(values({ paymentDate: "08/11/2026" }), OPTIONS).errors.paymentDate).toBe(
      "La date du paiement n'est pas valide.",
    );
  });
});

describe("validatePayment — longueurs", () => {
  it("enforces the documented limits", () => {
    expect(validatePayment(values({ reference: "x".repeat(101) }), OPTIONS).errors.reference).toContain(
      "100 caractères",
    );
    expect(validatePayment(values({ notes: "x".repeat(2001) }), OPTIONS).errors.notes).toContain(
      "caractères",
    );
  });
});
