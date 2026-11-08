/**
 * Payment API (Feature 22) — typed wrapper over the existing HTTP client.
 *
 * F08 endpoints, verified against the running API:
 * - `GET /api/payments?proposalId=&method=&paymentDate=` (global list, newest
 *   first, no pagination, **no text search**);
 * - `GET /api/payments/{id}`;
 * - `POST /api/payments` (ACCEPTED proposals only, amount > 0 and never above
 *   the proposal total — both enforced server-side with 409).
 *
 * The `paymentDate` filter parameter exists in the controller but currently
 * fails with a 500 (`could not determine data type of parameter` on the
 * `(? is null or payment_date = ?)` predicate), so the UI deliberately does not
 * expose it: only `proposalId` and `method` are used.
 *
 * Update and soft delete exist but are outside Feature 22's scope.
 */

import { ApiError, api } from "@/lib/api";
import type { Payment, PaymentMethod } from "@/types/api";

/** Body of `POST /api/payments`. */
export interface PaymentPayload {
  proposalId: string;
  /** Strictly positive, numeric(14,2). */
  amount: number;
  method: PaymentMethod;
  paymentDate: string;
  reference: string | null;
  notes: string | null;
}

export interface PaymentFilters {
  /** Payments of one proposal (backend parameter). */
  proposalId?: string | null;
  method?: PaymentMethod | "";
}

/** List path with only the filters that are actually set. */
export function paymentsPath(filters: PaymentFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.proposalId) {
    params.set("proposalId", filters.proposalId);
  }
  if (filters.method) {
    params.set("method", filters.method);
  }
  const query = params.toString();
  return query ? `/api/payments?${query}` : "/api/payments";
}

export const paymentsApi = {
  list(filters: PaymentFilters = {}): Promise<Payment[]> {
    return api.get<Payment[]>(paymentsPath(filters));
  },
  get(id: string): Promise<Payment> {
    return api.get<Payment>(`/api/payments/${id}`);
  },
  create(payload: PaymentPayload): Promise<Payment> {
    return api.post<Payment>("/api/payments", payload);
  },
};

/**
 * User-facing message for a failed payment call. F08 answers 400/409 with a
 * generic Spring body, so the status is translated here.
 */
export function paymentErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Certaines informations sont invalides. Vérifiez le montant et la méthode puis réessayez.";
    case 409:
      return "Le paiement a été refusé : la proposition n'est pas acceptée, ou le montant dépasserait le total de la proposition.";
    case 404:
      return "Ce paiement n'existe plus.";
    case 403:
      return "Accès refusé.";
    default:
      return error.message;
  }
}
