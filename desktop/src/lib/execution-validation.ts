/**
 * Execution PUT form validation (Feature 24), mirroring the F10 contract.
 *
 * Rules verified against the backend DTO/service:
 * - `scheduledDate` is mandatory on every PUT and is never invented here;
 * - while PLANNED, date, times, location and notes are editable, and `endTime`
 *   cannot be before `startTime` when both are given;
 * - while IN_PROGRESS, only location and notes are editable: the existing
 *   schedule is re-sent unchanged so the backend's schedule-change check (409)
 *   never triggers;
 * - location ≤ 500 and notes ≤ 2000 (the DTO limits).
 *
 * The form never computes a business value: version and schedule come from the
 * execution returned by the API.
 */

import type { UpdateExecutionPayload } from "@/lib/executions-api";
import type { Execution, ExecutionStatus } from "@/types/api";

export const EXECUTION_LIMITS = {
  location: 500,
  notes: 2000,
} as const;

export interface ExecutionFormValues {
  scheduledDate: string;
  startTime: string;
  endTime: string;
  location: string;
  notes: string;
}

export type ExecutionFormField = keyof ExecutionFormValues;
export type ExecutionFormErrors = Partial<Record<ExecutionFormField, string>>;

/** Backend `HH:mm:ss` → `<input type="time">` `HH:mm`. */
function toTimeInput(value: string | null): string {
  return value ? value.slice(0, 5) : "";
}

/** Fills the form from the execution returned by the API (no invented date). */
export function createExecutionForm(execution: Execution): ExecutionFormValues {
  return {
    scheduledDate: execution.scheduledDate ?? "",
    startTime: toTimeInput(execution.startTime),
    endTime: toTimeInput(execution.endTime),
    location: execution.location ?? "",
    notes: execution.notes ?? "",
  };
}

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value);
}

function minutesOf(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export interface ExecutionValidationOptions {
  /** Version read from the execution being edited (optimistic locking). */
  version: number;
  /** Current backend status: decides which fields are editable. */
  status: ExecutionStatus;
}

export interface ExecutionValidationResult {
  errors: ExecutionFormErrors;
  payload: UpdateExecutionPayload | null;
}

export function validateExecutionUpdate(
  values: ExecutionFormValues,
  options: ExecutionValidationOptions,
): ExecutionValidationResult {
  const errors: ExecutionFormErrors = {};

  const scheduledDate = trimmed(values.scheduledDate);
  if (scheduledDate.length === 0) {
    errors.scheduledDate = "La date programmée est obligatoire.";
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
    errors.scheduledDate = "La date programmée n'est pas valide.";
  }

  const startTime = emptyToNull(values.startTime);
  if (startTime !== null && !isValidTime(startTime)) {
    errors.startTime = "L'heure de début n'est pas valide.";
  }

  const endTime = emptyToNull(values.endTime);
  if (endTime !== null && !isValidTime(endTime)) {
    errors.endTime = "L'heure de fin n'est pas valide.";
  }

  if (startTime !== null && endTime !== null && isValidTime(startTime) && isValidTime(endTime)) {
    if (minutesOf(endTime) < minutesOf(startTime)) {
      errors.endTime = "L'heure de fin ne peut pas précéder l'heure de début.";
    }
  }

  const location = emptyToNull(values.location);
  if (location !== null && location.length > EXECUTION_LIMITS.location) {
    errors.location = `Le lieu ne peut pas dépasser ${EXECUTION_LIMITS.location} caractères.`;
  }

  const notes = emptyToNull(values.notes);
  if (notes !== null && notes.length > EXECUTION_LIMITS.notes) {
    errors.notes = `Les notes ne peuvent pas dépasser ${EXECUTION_LIMITS.notes.toLocaleString("fr-FR")} caractères.`;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      version: options.version,
      scheduledDate,
      startTime,
      endTime,
      location,
      notes,
    },
  };
}
