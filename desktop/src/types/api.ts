/**
 * TypeScript mirror of the backend response DTOs.
 *
 * Every interface below copies the Java record of the same name field by field
 * (`backend/src/main/java/mg/rosii/management/**\/dto`). Optional business data
 * is typed `| null` because the API serializes absent values as JSON null, not
 * as omitted keys — a section that does not exist yet is `null`, never missing.
 * Nothing is recalculated on this side: every amount comes from the API.
 */

export type Role = "PATRONNE";

export type ProposalStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REFUSED"
  | "EXPIRED"
  | "CANCELLED";

export type DemandStatus =
  | "NEW"
  | "IN_ANALYSIS"
  | "PROPOSAL_IN_PREPARATION"
  | "QUOTE_SENT"
  | "ACCEPTED"
  | "REFUSED"
  | "ABANDONED";

export type DemandType =
  | "EVENT"
  | "CATERING"
  | "DECORATION"
  | "FLORIST"
  | "EQUIPMENT_RENTAL"
  | "TRANSPORT"
  | "CAR_RENTAL"
  | "CONSTRUCTION"
  | "REAL_ESTATE"
  | "OTHER";

export type BudgetType = "NONE" | "EXACT" | "RANGE";

export type PaymentMethod = "CASH" | "MOBILE_MONEY" | "BANK_TRANSFER";

export type ExecutionStatus =
  | "PLANNED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type ClosureStatus = "COMPLETED" | "WITH_ISSUE";

/** `ProposalLineResponse`. */
export interface ProposalLine {
  id: string;
  serviceId: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  /** quantity × unitPrice, computed by the backend (HALF_UP, scale 2). */
  lineTotal: number;
  notes: string | null;
}

/** `ProposalResponse`, including the derived financial summary. */
export interface Proposal {
  id: string;
  number: string;
  clientId: string;
  demandId: string;
  status: ProposalStatus;
  title: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  refusedAt: string | null;
  cancelledAt: string | null;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
  lines: ProposalLine[];
  /** Sum of the line totals (derived, never stored). */
  proposalTotal: number;
  requiredDeposit: number;
  requiredDepositUpdatedAt: string | null;
  /** Sum of the active payments (derived, never stored). */
  totalPaid: number;
  /** proposalTotal − totalPaid (derived). */
  remainingAmount: number;
  /** totalPaid >= requiredDeposit (derived). */
  depositReached: boolean;
}

/** `ClientResponse`. */
export interface Client {
  id: string;
  name: string;
  phone1: string;
  phone2: string | null;
  email: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `DemandEventDetailsResponse`. */
export interface DemandEventDetails {
  eventType: string | null;
  hallNeeded: boolean | null;
  desiredHall: string | null;
  cateringRequested: boolean | null;
  decorationRequested: boolean | null;
  floristRequested: boolean | null;
  equipmentRentalRequested: boolean | null;
  transportRequested: boolean | null;
  theme: string | null;
  notes: string | null;
}

/** `DemandResponse`. */
export interface Demand {
  id: string;
  clientId: string;
  clientName: string;
  type: DemandType;
  status: DemandStatus;
  requestedDate: string | null;
  estimatedPeople: number | null;
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  location: string | null;
  notes: string | null;
  eventDetails: DemandEventDetails | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `PaymentResponse`. */
export interface Payment {
  id: string;
  proposalId: string;
  proposalNumber: string;
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `PaymentReceiptResponse` (immutable snapshot of the payment at issuance). */
export interface PaymentReceipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `InvoiceResponse` (immutable snapshot of the payment at issuance). */
export interface Invoice {
  id: string;
  paymentId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  paymentReference: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `PreparationResponse`. */
export interface Preparation {
  id: string;
  proposalId: string;
  proposalNumber: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `ExecutionResponse`. */
export interface Execution {
  id: string;
  preparationId: string;
  /** Proposal behind the preparation (Feature 34 list context, read-only). */
  proposalId: string;
  /** Human-readable proposal number, e.g. `PROP-2026-0001`. */
  proposalNumber: string;
  status: ExecutionStatus;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `ClosureResponse`. */
export interface ServiceClosure {
  id: string;
  preparationId: string;
  /** Proposal behind the preparation (Feature 34 list context, read-only). */
  proposalId: string;
  /** Human-readable proposal number, e.g. `PROP-2026-0001`. */
  proposalNumber: string;
  status: ClosureStatus;
  closedAt: string | null;
  finalNotes: string | null;
  /**
   * Active execution of the preparation, or `null` when it has none (Feature 34
   * list context; a soft-deleted execution is never reported).
   */
  executionId: string | null;
  executionStatus: ExecutionStatus | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * `ServiceDossierResponse` (Feature 17): the read-only recap of one commercial
 * case. `preparation`, `execution` and `closure` are independent: the closure is
 * never inferred from the execution status.
 */
export interface ServiceDossier {
  proposal: Proposal;
  client: Client;
  demand: Demand;
  payments: Payment[];
  receipts: PaymentReceipt[];
  invoices: Invoice[];
  preparation: Preparation | null;
  execution: Execution | null;
  closure: ServiceClosure | null;
}

/** `ServiceCategory` of the F05 catalogue. */
export type ServiceCategory =
  | "CATERING"
  | "DECORATION"
  | "FLORIST"
  | "TRANSPORT"
  | "EQUIPMENT_RENTAL"
  | "HALL_RENTAL"
  | "CAR_RENTAL"
  | "CONSTRUCTION"
  | "REAL_ESTATE"
  | "OTHER";

/** `ServiceResponse` of the F05 catalogue (a commercial reference, not a line). */
export interface CatalogueService {
  id: string;
  name: string;
  category: ServiceCategory;
  description: string | null;
  defaultUnit: string;
  referencePrice: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** `MeResponse`. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
}

/** `AuthResponse` returned by `POST /api/auth/login`. */
export interface AuthSession {
  token: string;
  tokenType: string;
  expiresInSeconds: number;
  user: AuthenticatedUser;
}
