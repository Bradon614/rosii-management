import type {
  Client,
  Demand,
  Execution,
  Invoice,
  Payment,
  PaymentReceipt,
  Preparation,
  Proposal,
  ProposalLine,
  ServiceClosure,
  ServiceDossier,
} from "@/types/api";

export const PROPOSAL_ID = "11111111-1111-1111-1111-111111111111";
export const CLIENT_ID = "22222222-2222-2222-2222-222222222222";
export const DEMAND_ID = "33333333-3333-3333-3333-333333333333";
export const PAYMENT_ID = "44444444-4444-4444-4444-444444444444";
export const RECEIPT_ID = "55555555-5555-5555-5555-555555555555";
export const INVOICE_ID = "66666666-6666-6666-6666-666666666666";
export const PREPARATION_ID = "77777777-7777-7777-7777-777777777777";
export const EXECUTION_ID = "88888888-8888-8888-8888-888888888888";
export const CLOSURE_ID = "99999999-9999-9999-9999-999999999999";

/** One proposal line: 2 × 250 000 = 500 000. */
export function buildLine(overrides: Partial<ProposalLine> = {}): ProposalLine {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    serviceId: null,
    description: "Traiteur mariage",
    unit: "personne",
    quantity: 2,
    unitPrice: 250000,
    lineTotal: 500000,
    notes: null,
    ...overrides,
  };
}

export function buildProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: PROPOSAL_ID,
    number: "PROP-2026-0001",
    clientId: CLIENT_ID,
    demandId: DEMAND_ID,
    status: "ACCEPTED",
    title: "Mariage Rakoto",
    sentAt: "2026-10-01T08:00:00Z",
    acceptedAt: "2026-10-02T09:30:00Z",
    refusedAt: null,
    cancelledAt: null,
    validUntil: "2999-12-31",
    notes: null,
    createdAt: "2026-09-30T07:15:00Z",
    updatedAt: "2026-10-02T09:30:00Z",
    version: 3,
    lines: [buildLine()],
    proposalTotal: 500000,
    requiredDeposit: 100000,
    requiredDepositUpdatedAt: "2026-09-30T07:15:00Z",
    totalPaid: 150000,
    remainingAmount: 350000,
    depositReached: true,
    ...overrides,
  };
}

export function buildClient(overrides: Partial<Client> = {}): Client {
  return {
    id: CLIENT_ID,
    name: "Alice Rakoto",
    phone1: "+261 34 12 34 56 78",
    phone2: null,
    email: null,
    notes: null,
    createdAt: "2026-09-01T06:00:00Z",
    updatedAt: "2026-09-01T06:00:00Z",
    version: 0,
    ...overrides,
  };
}

export function buildDemand(overrides: Partial<Demand> = {}): Demand {
  return {
    id: DEMAND_ID,
    clientId: CLIENT_ID,
    clientName: "Alice Rakoto",
    type: "EVENT",
    status: "ACCEPTED",
    requestedDate: "2026-12-12",
    estimatedPeople: 120,
    budgetType: "RANGE",
    budgetMin: 400000,
    budgetMax: 600000,
    location: "Salle des fêtes, Antananarivo",
    notes: "Prévoir un menu enfant.",
    eventDetails: null,
    createdAt: "2026-09-02T06:00:00Z",
    updatedAt: "2026-09-02T06:00:00Z",
    version: 1,
    ...overrides,
  };
}

export function buildPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    proposalId: PROPOSAL_ID,
    proposalNumber: "PROP-2026-0001",
    amount: 150000,
    method: "CASH",
    paymentDate: "2026-10-05",
    reference: "Caisse 1",
    notes: null,
    createdAt: "2026-10-05T10:00:00Z",
    updatedAt: "2026-10-05T10:00:00Z",
    version: 0,
    ...overrides,
  };
}

export function buildReceipt(overrides: Partial<PaymentReceipt> = {}): PaymentReceipt {
  return {
    id: RECEIPT_ID,
    paymentId: PAYMENT_ID,
    receiptNumber: "REC-2026-0001",
    amount: 150000,
    paymentMethod: "CASH",
    paymentDate: "2026-10-05",
    paymentReference: "Caisse 1",
    createdAt: "2026-10-05T10:05:00Z",
    updatedAt: "2026-10-05T10:05:00Z",
    version: 0,
    ...overrides,
  };
}

export function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: INVOICE_ID,
    paymentId: PAYMENT_ID,
    invoiceNumber: "FAC-2026-0001",
    amount: 150000,
    paymentMethod: "CASH",
    paymentDate: "2026-10-05",
    paymentReference: "Caisse 1",
    issuedAt: "2026-10-05T10:06:00Z",
    createdAt: "2026-10-05T10:06:00Z",
    updatedAt: "2026-10-05T10:06:00Z",
    version: 0,
    ...overrides,
  };
}

export function buildPreparation(overrides: Partial<Preparation> = {}): Preparation {
  return {
    id: PREPARATION_ID,
    proposalId: PROPOSAL_ID,
    proposalNumber: "PROP-2026-0001",
    createdAt: "2026-10-06T08:00:00Z",
    updatedAt: "2026-10-06T08:00:00Z",
    version: 0,
    ...overrides,
  };
}

export function buildExecution(overrides: Partial<Execution> = {}): Execution {
  return {
    id: EXECUTION_ID,
    preparationId: PREPARATION_ID,
    /** Feature 34: the proposal of the preparation travels with the row. */
    proposalId: PROPOSAL_ID,
    proposalNumber: "PROP-2026-0001",
    status: "COMPLETED",
    scheduledDate: "2026-12-12",
    startTime: "18:00:00",
    endTime: "23:30:00",
    location: "Salle des fêtes, Antananarivo",
    notes: "Prestation terminée sans incident.",
    startedAt: "2026-12-12T15:00:00Z",
    completedAt: "2026-12-12T20:30:00Z",
    cancelledAt: null,
    cancellationReason: null,
    createdAt: "2026-10-07T08:00:00Z",
    updatedAt: "2026-12-12T20:30:00Z",
    version: 4,
    ...overrides,
  };
}

export function buildClosure(overrides: Partial<ServiceClosure> = {}): ServiceClosure {
  return {
    id: CLOSURE_ID,
    preparationId: PREPARATION_ID,
    /** Feature 34: the closure row carries its proposal and active execution. */
    proposalId: PROPOSAL_ID,
    proposalNumber: "PROP-2026-0001",
    status: "COMPLETED",
    closedAt: "2026-12-13T09:00:00Z",
    finalNotes: "Prestation terminée sans incident",
    executionId: EXECUTION_ID,
    executionStatus: "COMPLETED",
    createdAt: "2026-12-13T09:00:00Z",
    updatedAt: "2026-12-13T09:00:00Z",
    version: 0,
    ...overrides,
  };
}

/** Full happy-path dossier: everything exists. */
export function buildDossier(overrides: Partial<ServiceDossier> = {}): ServiceDossier {
  return {
    proposal: buildProposal(),
    client: buildClient(),
    demand: buildDemand(),
    payments: [buildPayment()],
    receipts: [buildReceipt()],
    invoices: [buildInvoice()],
    preparation: buildPreparation(),
    execution: buildExecution(),
    closure: buildClosure(),
    ...overrides,
  };
}

/** Replaces the narrow no-break spaces Intl inserts between digit groups. */
export function normalizeSpaces(value: string | null | undefined): string {
  return (value ?? "").replace(/[\u202f\u00a0]/g, " ");
}
