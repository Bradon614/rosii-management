/**
 * Closure creation validation (Feature 25), mirroring the F11 contract.
 *
 * Rules verified against the backend DTO/service:
 * - `preparationId` is always taken from the preparation context;
 * - `status` is one of the two F11 statuses (COMPLETED or WITH_ISSUE);
 * - `finalNotes` is optional, trimmed, and limited to 2000 characters;
 * - `closedAt` is never sent: the backend stamps it at creation.
 */

import type { CreateClosurePayload } from "@/lib/closures-api";
import type { ClosureStatus } from "@/types/api";

export const CLOSURE_LIMITS = {
  finalNotes: 2000,
} as const;

export interface ClosureFormValues {
  status: ClosureStatus;
  finalNotes: string;
}

export type ClosureFormErrors = Partial<Record<keyof ClosureFormValues, string>>;

export const CLOSURE_STATUSES: readonly ClosureStatus[] = ["COMPLETED", "WITH_ISSUE"];

/** A fresh form: the standard COMPLETED status, no invented notes. */
export function createClosureForm(): ClosureFormValues {
  return {
    status: "COMPLETED",
    finalNotes: "",
  };
}

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

export interface ClosureValidationOptions {
  preparationId: string;
}

export interface ClosureValidationResult {
  errors: ClosureFormErrors;
  payload: CreateClosurePayload | null;
}

export function validateClosure(
  values: ClosureFormValues,
  options: ClosureValidationOptions,
): ClosureValidationResult {
  const errors: ClosureFormErrors = {};

  if (!CLOSURE_STATUSES.includes(values.status)) {
    errors.status = "Sélectionnez un résultat de clôture valide.";
  }

  const finalNotes = emptyToNull(values.finalNotes);
  if (finalNotes !== null && finalNotes.length > CLOSURE_LIMITS.finalNotes) {
    errors.finalNotes = `Les notes finales ne peuvent pas dépasser ${CLOSURE_LIMITS.finalNotes.toLocaleString("fr-FR")} caractères.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      preparationId: options.preparationId,
      status: values.status,
      finalNotes,
    },
  };
}
