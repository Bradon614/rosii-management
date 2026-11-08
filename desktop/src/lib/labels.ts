/**
 * French labels for the backend enums.
 *
 * The API only ever exposes stable enum constants; the display language lives
 * here so every screen shows the same wording.
 */

import type {
  BudgetType,
  ClosureStatus,
  DemandStatus,
  DemandType,
  ExecutionStatus,
  PaymentMethod,
  ProposalStatus,
} from "@/types/api";

export const proposalStatusLabels: Record<ProposalStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyée",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  EXPIRED: "Expirée",
  CANCELLED: "Annulée",
};

export const demandStatusLabels: Record<DemandStatus, string> = {
  NEW: "Nouvelle",
  IN_ANALYSIS: "En analyse",
  PROPOSAL_IN_PREPARATION: "Devis en préparation",
  QUOTE_SENT: "Devis envoyé",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  ABANDONED: "Abandonnée",
};

export const demandTypeLabels: Record<DemandType, string> = {
  EVENT: "Événement",
  CATERING: "Traiteur",
  DECORATION: "Décoration",
  FLORIST: "Fleuriste",
  EQUIPMENT_RENTAL: "Location de matériel",
  TRANSPORT: "Transport",
  CAR_RENTAL: "Location de voiture",
  CONSTRUCTION: "Construction",
  REAL_ESTATE: "Immobilier",
  OTHER: "Autre",
};

export const budgetTypeLabels: Record<BudgetType, string> = {
  NONE: "Aucun budget",
  EXACT: "Budget exact",
  RANGE: "Fourchette de budget",
};

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  CASH: "Espèces",
  MOBILE_MONEY: "Mobile Money",
  BANK_TRANSFER: "Virement bancaire",
};

export const executionStatusLabels: Record<ExecutionStatus, string> = {
  PLANNED: "Planifiée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export const closureStatusLabels: Record<ClosureStatus, string> = {
  COMPLETED: "Clôturée",
  WITH_ISSUE: "Clôturée avec réserve",
};
