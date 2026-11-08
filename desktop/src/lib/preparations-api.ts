/**
 * Preparation API (Feature 23) — typed wrapper over the existing HTTP client.
 *
 * Feature 09 endpoints, verified against the backend controller:
 * - `POST /api/preparations` with `{ proposalId }` (201; 409 when the proposal
 *   is not ACCEPTED, the required deposit is not reached, or an active
 *   preparation already exists; 404 for an unknown/soft-deleted proposal);
 * - `GET /api/preparations/{id}` (404 when unknown or soft-deleted);
 * - `GET /api/preparations?proposalId=...` (the single active preparation of one
 *   proposal, 404 when there is none);
 * - `DELETE /api/preparations/{id}` (204, **soft** deletion).
 *
 * There is deliberately no global list: F09 only exposes the `proposalId`
 * filter, so the UI never invents a list endpoint. The backend remains the
 * authority for every eligibility rule; nothing is recomputed here.
 */

import { ApiError, api } from "@/lib/api";
import type { Preparation } from "@/types/api";

/** Body of `POST /api/preparations`: only the proposal is accepted. */
export interface PreparationPayload {
  proposalId: string;
}

/** Path of the active preparation of one proposal. */
export function preparationPathByProposal(proposalId: string): string {
  return `/api/preparations?proposalId=${encodeURIComponent(proposalId)}`;
}

export const preparationsApi = {
  create(payload: PreparationPayload): Promise<Preparation> {
    return api.post<Preparation>("/api/preparations", payload);
  },
  get(id: string): Promise<Preparation> {
    return api.get<Preparation>(`/api/preparations/${id}`);
  },
  getByProposal(proposalId: string): Promise<Preparation> {
    return api.get<Preparation>(preparationPathByProposal(proposalId));
  },
  /** Soft deletion: the preparation leaves the API, the row is kept. */
  remove(id: string): Promise<void> {
    return api.delete(`/api/preparations/${id}`);
  },
};

/**
 * Message for a preparation that cannot be read. A 404 is handled by the pages
 * themselves (it means "no active preparation" for the proposal lookup, and
 * "unknown/soft-deleted" for the detail lookup).
 */
export function preparationErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Les informations de la préparation sont invalides.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette préparation n'existe pas ou a été supprimée.";
    case 409:
      return "Cette préparation a été modifiée entre-temps. Rechargez-la avant de réessayer.";
    default:
      return error.message;
  }
}

/**
 * Message for a failed creation. The backend is the final authority: a 409
 * means another preparation exists or the F09 conditions no longer hold, and
 * the user must reload the proposal instead of retrying blindly.
 */
export function preparationCreateErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "La création est refusée : les informations envoyées sont invalides.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette proposition n'existe plus : la préparation ne peut pas être créée.";
    case 409:
      return "La préparation n'a pas pu être créée : une préparation active existe déjà, ou les conditions (proposition acceptée, dépôt requis atteint) ne sont plus remplies. Rechargez la proposition.";
    default:
      return error.message;
  }
}

/** Message for a failed soft deletion (409 when the server refuses it). */
export function preparationDeleteErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette préparation n'existe plus.";
    case 409:
      return "La suppression est refusée par le serveur : la préparation est encore liée à une exécution.";
    default:
      return error.message;
  }
}
