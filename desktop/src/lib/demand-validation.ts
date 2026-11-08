/**
 * Demand form validation (Feature 20), mirroring the F06 backend contract.
 *
 * Rules verified against the running API:
 * - client required; type required;
 * - `estimatedPeople` ≥ 1 when provided (@Min(1));
 * - `NONE` carries no amount, `EXACT` carries one amount (min = max),
 *   `RANGE` carries min < max — the service rejects anything else with a 400;
 * - amounts are numeric(14,2): at most 12 integer digits and 2 decimals;
 * - location ≤ 500, notes ≤ 2000, event type ≤ 100, hall ≤ 200, theme ≤ 500;
 * - event details are optional and belong to an `EVENT` demand; when any event
 *   field is filled, `eventType` becomes mandatory (@NotBlank in the DTO).
 */

import type { Demand, DemandType, DemandStatus, BudgetType } from "@/types/api";
import type { DemandEventDetailsPayload, DemandPayload } from "@/lib/demands-api";

export const DEMAND_LIMITS = {
  location: 500,
  notes: 2000,
  eventType: 100,
  desiredHall: 200,
  theme: 500,
  eventNotes: 2000,
} as const;

/** Tri-state the backend models as a nullable Boolean: true / false / null. */
export type TriState = "UNSET" | "YES" | "NO";

export interface DemandFormValues {
  clientId: string;
  type: DemandType | "";
  status: DemandStatus;
  requestedDate: string;
  estimatedPeople: string;
  budgetType: BudgetType;
  budgetMin: string;
  budgetMax: string;
  location: string;
  notes: string;
  eventType: string;
  hallNeeded: TriState;
  desiredHall: string;
  cateringRequested: TriState;
  decorationRequested: TriState;
  floristRequested: TriState;
  equipmentRentalRequested: TriState;
  transportRequested: TriState;
  theme: string;
  eventNotes: string;
}

export type DemandField = keyof DemandFormValues;
export type DemandFormErrors = Partial<Record<DemandField, string>>;

export const EMPTY_DEMAND_FORM: DemandFormValues = {
  clientId: "",
  type: "",
  status: "NEW",
  requestedDate: "",
  estimatedPeople: "",
  budgetType: "NONE",
  budgetMin: "",
  budgetMax: "",
  location: "",
  notes: "",
  eventType: "",
  hallNeeded: "UNSET",
  desiredHall: "",
  cateringRequested: "UNSET",
  decorationRequested: "UNSET",
  floristRequested: "UNSET",
  equipmentRentalRequested: "UNSET",
  transportRequested: "UNSET",
  theme: "",
  eventNotes: "",
};

export const AMOUNT_ERROR = "Le montant doit être un nombre positif (2 décimales maximum).";

/** Backend numeric(14,2): at most 12 integer digits, 2 decimals. */
const AMOUNT_PATTERN = /^\d{1,12}(\.\d{1,2})?$/;

export function triStateToBoolean(value: TriState): boolean | null {
  if (value === "YES") {
    return true;
  }
  if (value === "NO") {
    return false;
  }
  return null;
}

export function booleanToTriState(value: boolean | null | undefined): TriState {
  if (value === true) {
    return "YES";
  }
  if (value === false) {
    return "NO";
  }
  return "UNSET";
}

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

type ParsedAmount = { valid: true; value: number | null } | { valid: false; value: null };

/** Accepts spaces and a French decimal comma, then enforces numeric(14,2). */
export function parseAmount(raw: string): ParsedAmount {
  const normalized = raw.replace(/[\s\u202f\u00a0]/g, "").replace(",", ".");
  if (normalized.length === 0) {
    return { valid: true, value: null };
  }
  if (!AMOUNT_PATTERN.test(normalized)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Number(normalized) };
}

function parsePeople(raw: string): number | null {
  const normalized = trimmed(raw);
  if (normalized.length === 0) {
    return null;
  }
  const value = Number(normalized);
  return Number.isInteger(value) && value >= 1 ? value : Number.NaN;
}

export interface DemandValidationResult {
  errors: DemandFormErrors;
  payload: DemandPayload | null;
}

export function validateDemand(values: DemandFormValues): DemandValidationResult {
  const errors: DemandFormErrors = {};

  const clientId = trimmed(values.clientId);
  if (clientId.length === 0) {
    errors.clientId = "Sélectionnez un client.";
  }

  if (values.type === "") {
    errors.type = "Sélectionnez le type de demande.";
  }

  const requestedDate = emptyToNull(values.requestedDate);
  if (requestedDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
    errors.requestedDate = "La date souhaitée n'est pas valide.";
  }

  const people = parsePeople(values.estimatedPeople);
  if (Number.isNaN(people)) {
    errors.estimatedPeople = "Le nombre de personnes doit être un entier supérieur ou égal à 1.";
  }

  let budgetMin: number | null = null;
  let budgetMax: number | null = null;

  if (values.budgetType === "EXACT") {
    const parsed = parseAmount(values.budgetMin);
    if (!parsed.valid) {
      errors.budgetMin = AMOUNT_ERROR;
    } else if (parsed.value === null) {
      errors.budgetMin = "Saisissez le montant du budget exact.";
    } else {
      budgetMin = parsed.value;
      budgetMax = parsed.value;
    }
  } else if (values.budgetType === "RANGE") {
    const parsedMin = parseAmount(values.budgetMin);
    const parsedMax = parseAmount(values.budgetMax);
    if (!parsedMin.valid) {
      errors.budgetMin = AMOUNT_ERROR;
    } else if (parsedMin.value === null) {
      errors.budgetMin = "Saisissez le budget minimum.";
    }
    if (!parsedMax.valid) {
      errors.budgetMax = AMOUNT_ERROR;
    } else if (parsedMax.value === null) {
      errors.budgetMax = "Saisissez le budget maximum.";
    }
    if (
      parsedMin.valid &&
      parsedMax.valid &&
      parsedMin.value !== null &&
      parsedMax.value !== null
    ) {
      if (parsedMin.value >= parsedMax.value) {
        errors.budgetMax = "Le budget maximum doit être supérieur au budget minimum.";
      } else {
        budgetMin = parsedMin.value;
        budgetMax = parsedMax.value;
      }
    }
  }

  const location = emptyToNull(values.location);
  if (location !== null && location.length > DEMAND_LIMITS.location) {
    errors.location = `La localisation ne peut pas dépasser ${DEMAND_LIMITS.location} caractères.`;
  }

  const notes = emptyToNull(values.notes);
  if (notes !== null && notes.length > DEMAND_LIMITS.notes) {
    errors.notes = `Les notes ne peuvent pas dépasser ${DEMAND_LIMITS.notes.toLocaleString("fr-FR")} caractères.`;
  }

  // Event details only exist for an EVENT demand and only when something was
  // entered; otherwise the payload carries `null` (which removes them).
  const eventType = trimmed(values.eventType);
  const desiredHall = emptyToNull(values.desiredHall);
  const theme = emptyToNull(values.theme);
  const eventNotes = emptyToNull(values.eventNotes);
  const flags: TriState[] = [
    values.hallNeeded,
    values.cateringRequested,
    values.decorationRequested,
    values.floristRequested,
    values.equipmentRentalRequested,
    values.transportRequested,
  ];
  const eventTouched =
    eventType.length > 0 ||
    desiredHall !== null ||
    theme !== null ||
    eventNotes !== null ||
    flags.some((flag) => flag !== "UNSET");

  let eventDetails: DemandEventDetailsPayload | null = null;

  if (values.type === "EVENT" && eventTouched) {
    if (eventType.length === 0) {
      errors.eventType = "Le type d'événement est obligatoire dès qu'une information événementielle est saisie.";
    } else if (eventType.length > DEMAND_LIMITS.eventType) {
      errors.eventType = `Le type d'événement ne peut pas dépasser ${DEMAND_LIMITS.eventType} caractères.`;
    }
    if (desiredHall !== null && desiredHall.length > DEMAND_LIMITS.desiredHall) {
      errors.desiredHall = `La salle souhaitée ne peut pas dépasser ${DEMAND_LIMITS.desiredHall} caractères.`;
    }
    if (theme !== null && theme.length > DEMAND_LIMITS.theme) {
      errors.theme = `Le thème ne peut pas dépasser ${DEMAND_LIMITS.theme} caractères.`;
    }
    if (eventNotes !== null && eventNotes.length > DEMAND_LIMITS.eventNotes) {
      errors.eventNotes = `Les notes événementielles ne peuvent pas dépasser ${DEMAND_LIMITS.eventNotes.toLocaleString("fr-FR")} caractères.`;
    }
    eventDetails = {
      eventType,
      hallNeeded: triStateToBoolean(values.hallNeeded),
      desiredHall,
      cateringRequested: triStateToBoolean(values.cateringRequested),
      decorationRequested: triStateToBoolean(values.decorationRequested),
      floristRequested: triStateToBoolean(values.floristRequested),
      equipmentRentalRequested: triStateToBoolean(values.equipmentRentalRequested),
      transportRequested: triStateToBoolean(values.transportRequested),
      theme,
      notes: eventNotes,
    };
  }

  if (Object.keys(errors).length > 0) {
    return { errors, payload: null };
  }

  return {
    errors,
    payload: {
      clientId,
      type: values.type as DemandType,
      status: values.status,
      requestedDate,
      estimatedPeople: people ?? null,
      budgetType: values.budgetType,
      budgetMin,
      budgetMax,
      location,
      notes,
      eventDetails,
    },
  };
}

/** Fills the form from an existing demand (edit screen). */
export function demandToFormValues(demand: Demand): DemandFormValues {
  const details = demand.eventDetails;
  return {
    clientId: demand.clientId,
    type: demand.type,
    status: demand.status,
    requestedDate: demand.requestedDate ?? "",
    estimatedPeople: demand.estimatedPeople === null ? "" : String(demand.estimatedPeople),
    budgetType: demand.budgetType,
    budgetMin: demand.budgetMin === null ? "" : String(demand.budgetMin),
    budgetMax: demand.budgetMax === null ? "" : String(demand.budgetMax),
    location: demand.location ?? "",
    notes: demand.notes ?? "",
    eventType: details?.eventType ?? "",
    hallNeeded: booleanToTriState(details?.hallNeeded),
    desiredHall: details?.desiredHall ?? "",
    cateringRequested: booleanToTriState(details?.cateringRequested),
    decorationRequested: booleanToTriState(details?.decorationRequested),
    floristRequested: booleanToTriState(details?.floristRequested),
    equipmentRentalRequested: booleanToTriState(details?.equipmentRentalRequested),
    transportRequested: booleanToTriState(details?.transportRequested),
    theme: details?.theme ?? "",
    eventNotes: details?.notes ?? "",
  };
}
