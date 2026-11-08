/**
 * Payment form validation (Feature 22), mirroring the F08 contract.
 *
 * Rules verified against the running API: amount strictly positive,
 * numeric(14,2), and never above the remaining amount (the backend answers 409
 * otherwise); method and payment date mandatory; reference ≤ 100 and notes
 * ≤ 2000. The remaining amount is the one returned by the backend — it is never
 * recomputed here.
 */

import { parseDecimal } from "@/lib/decimal";
import { todayIsoDate } from "@/lib/format";
import type { PaymentPayload } from "@/lib/payments-api";
import type { PaymentMethod } from "@/types/api";

export const PAYMENT_LIMITS = {
  reference: 100,
  notes: 2000,
} as const;

export interface PaymentFormValues {
  amount: string;
  method: PaymentMethod | "";
  paymentDate: string;
  reference: string;
  notes: string;
}

export type PaymentField = keyof PaymentFormValues;
export type PaymentFormErrors = Partial<Record<PaymentField, string>>;

/** A fresh form: today's date (the DTO requires one), no invented amount. */
export function createPaymentForm(): PaymentFormValues {
  return {
    amount: "",
    method: "",
    paymentDate: todayIsoDate(),
    reference: "",
    notes: "",
  };
}

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

export interface PaymentValidationOptions {
  proposalId: string;
  /** Remaining amount exposed by the backend (`remainingAmount`). */
  remainingAmount: number;
}

export interface PaymentValidationResult {
  errors: PaymentFormErrors;
  payload: PaymentPayload | null;
}

export function validatePayment(
  values: PaymentFormValues,
  options: PaymentValidationOptions,
): PaymentValidationResult {
  const errors: PaymentFormErrors = {};

  const amount = parseDecimal(values.amount, 12, 2);
  if (!amount.valid) {
    errors.amount = "Le montant doit être un nombre avec 2 décimales maximum.";
  } else if (amount.value === null) {
    errors.amount = "Saisissez le montant du paiement.";
  } else if (amount.value <= 0) {
    errors.amount = "Le montant doit être supérieur à zéro.";
  } else if (amount.value > options.remainingAmount + 0.001) {
    errors.amount = `Le montant ne peut pas dépasser le reste à payer (${options.remainingAmount.toLocaleString("fr-FR")} Ar).`;
  }

  const method = values.method;
  if (method === "") {
    errors.method = "Sélectionnez la méthode de paiement.";
  }

  const paymentDate = trimmed(values.paymentDate);
  if (paymentDate.length === 0) {
    errors.paymentDate = "La date du paiement est obligatoire.";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    errors.paymentDate = "La date du paiement n'est pas valide.";
  }

  const reference = emptyToNull(values.reference);
  if (reference !== null && reference.length > PAYMENT_LIMITS.reference) {
    errors.reference = `La référence ne peut pas dépasser ${PAYMENT_LIMITS.reference} caractères.`;
  }

  const notes = emptyToNull(values.notes);
  if (notes !== null && notes.length > PAYMENT_LIMITS.notes) {
    errors.notes = `Les notes ne peuvent pas dépasser ${PAYMENT_LIMITS.notes.toLocaleString("fr-FR")} caractères.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      proposalId: options.proposalId,
      amount: amount.valid ? (amount.value as number) : 0,
      method: method as PaymentMethod,
      paymentDate,
      reference,
      notes,
    },
  };
}
