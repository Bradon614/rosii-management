/**
 * Proposal form validation (Feature 21), mirroring the F07 contract.
 *
 * Rules verified against the running API:
 * - demand mandatory (the client is derived from it, never typed);
 * - title ≤ 200, notes ≤ 2000;
 * - `validUntil` optional in DRAFT, but it may not be before the creation date,
 *   and it becomes mandatory to send the proposal;
 * - `requiredDeposit` mandatory, > 0 and never above the proposal total;
 * - at least one line; description ≤ 500, unit ≤ 50, notes ≤ 2000;
 * - quantity numeric(14,3) > 0, unitPrice numeric(14,2) ≥ 0;
 * - totals are computed exactly like the backend (quantity × unitPrice,
 *   HALF_UP at 2 decimals) for the indicative estimate only: the amounts saved
 *   and displayed after saving always come from the API.
 */

import type { Proposal } from "@/types/api";
import type { ProposalPayload } from "@/lib/proposals-api";

export const PROPOSAL_LIMITS = {
  title: 200,
  notes: 2000,
  lineDescription: 500,
  lineUnit: 50,
  lineNotes: 2000,
} as const;

export interface ProposalLineFormValues {
  /** Local React key, never sent to the API. */
  key: string;
  serviceId: string;
  description: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  notes: string;
}

export interface ProposalFormValues {
  demandId: string;
  /** Derived from the selected demand; mandatory because the DTO requires it. */
  clientId: string;
  title: string;
  validUntil: string;
  notes: string;
  requiredDeposit: string;
  lines: ProposalLineFormValues[];
}

export type ProposalLineField = keyof ProposalLineFormValues;

export type ProposalLineErrors = Partial<Record<ProposalLineField, string>>;

export interface ProposalFormErrors {
  demandId?: string;
  title?: string;
  validUntil?: string;
  notes?: string;
  requiredDeposit?: string;
  lines?: string;
}

let lineSequence = 0;

/** Stable local key for a line row (no crypto dependency needed). */
export function newLineKey(): string {
  lineSequence += 1;
  return `line-${lineSequence}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyLine(): ProposalLineFormValues {
  return {
    key: newLineKey(),
    serviceId: "",
    description: "",
    unit: "",
    quantity: "1",
    unitPrice: "",
    notes: "",
  };
}

export function createEmptyProposalForm(): ProposalFormValues {
  return {
    demandId: "",
    clientId: "",
    title: "",
    validUntil: "",
    notes: "",
    requiredDeposit: "",
    lines: [createEmptyLine()],
  };
}

export type ParsedDecimal =
  | { valid: true; value: number | null }
  | { valid: false; value: null };

/** Accepts spaces and a French decimal comma, then enforces numeric(14,x). */
export function parseDecimal(
  raw: string,
  integerDigits: number,
  fractionDigits: number,
): ParsedDecimal {
  const normalized = raw.replace(/[\s\u202f\u00a0]/g, "").replace(",", ".");
  if (normalized.length === 0) {
    return { valid: true, value: null };
  }
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(\\.\\d{1,${fractionDigits}})?$`);
  if (!pattern.test(normalized)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Number(normalized) };
}

/** HALF_UP at 2 decimals, as `ProposalLine.getLineTotal()` does. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface ProposalEstimate {
  lineTotals: number[];
  total: number;
}

/**
 * Indicative estimate used only while editing: same formula as the backend, but
 * the official amounts are the ones returned by the API after saving.
 */
export function estimateProposal(lines: ProposalLineFormValues[]): ProposalEstimate {
  const lineTotals = lines.map((line) => {
    const quantity = parseDecimal(line.quantity, 11, 3);
    const unitPrice = parseDecimal(line.unitPrice, 12, 2);
    if (!quantity.valid || !unitPrice.valid || quantity.value === null || unitPrice.value === null) {
      return 0;
    }
    return round2(quantity.value * unitPrice.value);
  });
  const total = round2(lineTotals.reduce((sum, value) => sum + value, 0));
  return { lineTotals, total };
}

export interface ProposalValidationResult {
  errors: ProposalFormErrors;
  lineErrors: ProposalLineErrors[];
  payload: ProposalPayload | null;
  estimate: ProposalEstimate;
}

function trimmed(value: string): string {
  return value.trim();
}

function emptyToNull(value: string): string | null {
  const result = trimmed(value);
  return result.length === 0 ? null : result;
}

export interface ProposalValidationOptions {
  /** Proposal creation date (`YYYY-MM-DD`); today for a new proposal. */
  createdOn: string;
}

export function validateProposal(
  values: ProposalFormValues,
  options: ProposalValidationOptions,
): ProposalValidationResult {
  const errors: ProposalFormErrors = {};
  const lineErrors: ProposalLineErrors[] = values.lines.map(() => ({}));
  const estimate = estimateProposal(values.lines);

  if (trimmed(values.demandId).length === 0 || trimmed(values.clientId).length === 0) {
    errors.demandId = "Sélectionnez une demande.";
  }

  const title = emptyToNull(values.title);
  if (title !== null && title.length > PROPOSAL_LIMITS.title) {
    errors.title = `Le titre ne peut pas dépasser ${PROPOSAL_LIMITS.title} caractères.`;
  }

  const validUntil = emptyToNull(values.validUntil);
  if (validUntil !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      errors.validUntil = "La date de validité n'est pas valide.";
    } else if (validUntil < options.createdOn) {
      errors.validUntil =
        "La date de validité ne peut pas être antérieure à la création de la proposition.";
    }
  }

  const notes = emptyToNull(values.notes);
  if (notes !== null && notes.length > PROPOSAL_LIMITS.notes) {
    errors.notes = `Les notes ne peuvent pas dépasser ${PROPOSAL_LIMITS.notes.toLocaleString("fr-FR")} caractères.`;
  }

  if (values.lines.length === 0) {
    errors.lines = "Ajoutez au moins une ligne à la proposition.";
  }

  const linePayloads: ProposalPayload["lines"] = [];

  values.lines.forEach((line, index) => {
    const lineError = lineErrors[index];

    const description = trimmed(line.description);
    if (description.length === 0) {
      lineError.description = "La description est obligatoire.";
    } else if (description.length > PROPOSAL_LIMITS.lineDescription) {
      lineError.description = `La description ne peut pas dépasser ${PROPOSAL_LIMITS.lineDescription} caractères.`;
    }

    const unit = trimmed(line.unit);
    if (unit.length === 0) {
      lineError.unit = "L'unité est obligatoire.";
    } else if (unit.length > PROPOSAL_LIMITS.lineUnit) {
      lineError.unit = `L'unité ne peut pas dépasser ${PROPOSAL_LIMITS.lineUnit} caractères.`;
    }

    const quantity = parseDecimal(line.quantity, 11, 3);
    if (!quantity.valid) {
      lineError.quantity = "La quantité doit être un nombre avec 3 décimales maximum.";
    } else if (quantity.value === null) {
      lineError.quantity = "Saisissez une quantité.";
    } else if (quantity.value <= 0) {
      lineError.quantity = "La quantité doit être supérieure à zéro.";
    }

    const unitPrice = parseDecimal(line.unitPrice, 12, 2);
    if (!unitPrice.valid) {
      lineError.unitPrice = "Le prix unitaire doit être un montant avec 2 décimales maximum.";
    } else if (unitPrice.value === null) {
      lineError.unitPrice = "Saisissez un prix unitaire.";
    }

    const lineNotes = emptyToNull(line.notes);
    if (lineNotes !== null && lineNotes.length > PROPOSAL_LIMITS.lineNotes) {
      lineError.notes = `Les notes de ligne ne peuvent pas dépasser ${PROPOSAL_LIMITS.lineNotes.toLocaleString("fr-FR")} caractères.`;
    }

    if (Object.keys(lineError).length === 0) {
      linePayloads.push({
        serviceId: emptyToNull(line.serviceId),
        description,
        unit,
        quantity: quantity.valid ? (quantity.value as number) : 0,
        unitPrice: unitPrice.valid ? (unitPrice.value as number) : 0,
        notes: lineNotes,
      });
    }
  });

  const deposit = parseDecimal(values.requiredDeposit, 12, 2);
  if (!deposit.valid) {
    errors.requiredDeposit = "Le dépôt doit être un montant avec 2 décimales maximum.";
  } else if (deposit.value === null) {
    errors.requiredDeposit = "Saisissez le dépôt demandé.";
  } else if (deposit.value <= 0) {
    errors.requiredDeposit = "Le dépôt demandé doit être supérieur à zéro.";
  } else if (estimate.total > 0 && deposit.value > estimate.total + 0.001) {
    errors.requiredDeposit = `Le dépôt demandé ne peut pas dépasser le total de la proposition (${estimate.total.toLocaleString("fr-FR")} Ar).`;
  }

  const hasErrors =
    Object.keys(errors).length > 0 || lineErrors.some((entry) => Object.keys(entry).length > 0);

  if (hasErrors) {
    return { errors, lineErrors, payload: null, estimate };
  }

  return {
    errors,
    lineErrors,
    estimate,
    payload: {
      clientId: trimmed(values.clientId),
      demandId: trimmed(values.demandId),
      title,
      validUntil,
      requiredDeposit: deposit.valid ? (deposit.value as number) : 0,
      notes,
      lines: linePayloads,
    },
  };
}

/** Fills the form from an existing proposal (edit screen). */
export function proposalToFormValues(proposal: Proposal): ProposalFormValues {
  return {
    demandId: proposal.demandId,
    clientId: proposal.clientId,
    title: proposal.title ?? "",
    validUntil: proposal.validUntil ?? "",
    notes: proposal.notes ?? "",
    requiredDeposit: String(proposal.requiredDeposit),
    lines: proposal.lines.map((line) => ({
      key: newLineKey(),
      serviceId: line.serviceId ?? "",
      description: line.description,
      unit: line.unit ?? "",
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      notes: line.notes ?? "",
    })),
  };
}
