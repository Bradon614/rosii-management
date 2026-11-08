/**
 * Display helpers for demands (Feature 20). Formatting only: no business rule,
 * no computed amount — the API owns the values.
 */

import { formatAriary, formatDate } from "@/lib/format";
import { demandTypeLabels } from "@/lib/labels";
import type { BudgetType, Demand } from "@/types/api";
import type { TriState } from "@/lib/demand-validation";

/** Labels of the backend's nullable Boolean (true / false / null). */
export const TRI_STATE_LABELS: Record<TriState, string> = {
  UNSET: "Non précisé",
  YES: "Souhaité",
  NO: "Refusé",
};

/** `true` / `false` / `null` → « Souhaité » / « Refusé » / « Non précisé ». */
export function formatTriState(value: boolean | null | undefined): string {
  if (value === true) {
    return TRI_STATE_LABELS.YES;
  }
  if (value === false) {
    return TRI_STATE_LABELS.NO;
  }
  return TRI_STATE_LABELS.UNSET;
}

/**
 * Budget of a demand, as recorded:
 * `NONE` → « — », `EXACT` → the single amount, `RANGE` → « min – max ».
 */
export function formatDemandBudget(demand: {
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
}): string {
  if (demand.budgetType === "NONE") {
    return "—";
  }
  if (demand.budgetType === "EXACT") {
    return formatAriary(demand.budgetMin ?? demand.budgetMax);
  }
  return `${formatAriary(demand.budgetMin)} – ${formatAriary(demand.budgetMax)}`;
}

/** Short line used under the client name in the list: « Événement · 12 déc. 2026 ». */
export function describeDemand(demand: Demand): string {
  const type = demandTypeLabels[demand.type];
  return demand.requestedDate ? `${type} · ${formatDate(demand.requestedDate)}` : type;
}
