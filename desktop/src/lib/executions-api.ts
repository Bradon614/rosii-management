/**
 * Execution API (Feature 24) — typed wrapper over the existing HTTP client.
 *
 * F10 endpoints, verified against the backend controller and integration tests:
 * - `POST /api/executions` with `{ preparationId }` (201, initial status
 *   PLANNED; 404 unknown/soft-deleted preparation; 409 proposal not ACCEPTED,
 *   required deposit not reached, or an active execution already exists);
 * - `GET /api/executions?preparationId=&status=&scheduledDate=` (real global
 *   list, every parameter optional, soft-deleted rows excluded);
 * - `GET /api/executions/{id}`;
 * - `PUT /api/executions/{id}` with `version` and `scheduledDate` mandatory
 *   (409 on a stale version, on a terminal status, or on a schedule change
 *   while IN_PROGRESS);
 * - `PATCH /api/executions/{id}/status` with `{ status }` (strict state
 *   machine, 409 on any other transition);
 * - `DELETE /api/executions/{id}` (204, **soft** deletion).
 *
 * No business value is computed here. The transition table below mirrors the
 * backend state machine exactly so the UI only offers the actions the server
 * accepts; the backend stays the final authority.
 */

import { ApiError, api } from "@/lib/api";
import type { Execution, ExecutionStatus } from "@/types/api";

/** Body of `POST /api/executions`: the preparation only, as defined by F10. */
export interface CreateExecutionPayload {
  preparationId: string;
}

/** Body of `PUT /api/executions/{id}` (exact F10 contract). */
export interface UpdateExecutionPayload {
  /** Optimistic-locking version of the execution being edited. */
  version: number;
  /** Mandatory on every PUT, even while IN_PROGRESS. */
  scheduledDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  notes: string | null;
}

export interface ExecutionFilters {
  preparationId?: string | null;
  status?: ExecutionStatus | "";
  /** Exact local date (`YYYY-MM-DD`), backend parameter. */
  scheduledDate?: string;
}

/** List path with only the filters that are actually set. */
export function executionsPath(filters: ExecutionFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.preparationId) {
    params.set("preparationId", filters.preparationId);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.scheduledDate) {
    params.set("scheduledDate", filters.scheduledDate);
  }
  const query = params.toString();
  return query ? `/api/executions?${query}` : "/api/executions";
}

/**
 * Exact backend state machine (ExecutionService.TRANSITIONS): PLANNED and
 * IN_PROGRESS have outgoing transitions, COMPLETED and CANCELLED are terminal.
 */
export const EXECUTION_TRANSITIONS: Record<ExecutionStatus, readonly ExecutionStatus[]> = {
  PLANNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

/** Transitions the backend currently allows from `status`. */
export function allowedExecutionTransitions(status: ExecutionStatus): readonly ExecutionStatus[] {
  return EXECUTION_TRANSITIONS[status];
}

/** Operational information is editable only while PLANNED or IN_PROGRESS. */
export function isExecutionEditable(status: ExecutionStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

export const executionsApi = {
  list(filters: ExecutionFilters = {}): Promise<Execution[]> {
    return api.get<Execution[]>(executionsPath(filters));
  },
  get(id: string): Promise<Execution> {
    return api.get<Execution>(`/api/executions/${id}`);
  },
  /** F10 creation payload: only the preparation id is ever sent. */
  create(payload: CreateExecutionPayload): Promise<Execution> {
    return api.post<Execution>("/api/executions", payload);
  },
  update(id: string, payload: UpdateExecutionPayload): Promise<Execution> {
    return api.put<Execution>(`/api/executions/${id}`, payload);
  },
  setStatus(id: string, status: ExecutionStatus): Promise<Execution> {
    return api.patch<Execution>(`/api/executions/${id}/status`, { status });
  },
  /** Soft deletion: the execution leaves the API, the row is kept. */
  remove(id: string): Promise<void> {
    return api.delete(`/api/executions/${id}`);
  },
};

/** Message for a failure while reading an execution or its list. */
export function executionErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Les informations de l'exécution sont invalides.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette exécution n'existe pas ou a été supprimée.";
    case 409:
      return "Cette exécution a été modifiée entre-temps. Rechargez-la avant de réessayer.";
    case 0:
      return error.message;
    default:
      return error.message;
  }
}

/**
 * Message for a failed creation. The backend is the final authority: a 409
 * means the F10 conditions no longer hold or an active execution already
 * exists, and the user must reload the preparation instead of retrying blindly.
 */
export function executionCreateErrorMessage(error: unknown): string {
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
      return "Cette préparation n'existe plus : l'exécution ne peut pas être créée.";
    case 409:
      return "La création est refusée : les conditions (proposition acceptée, dépôt requis atteint) ne sont plus remplies, ou une exécution active existe déjà. Rechargez la préparation.";
    case 0:
      return error.message;
    default:
      return error.message;
  }
}

/** Message for a failed PUT. A 409 is a version or status conflict. */
export function executionUpdateErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Les informations sont invalides : vérifiez la date programmée et les horaires.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette exécution n'existe plus ou a été supprimée.";
    case 409:
      return "L'exécution a été modifiée entre-temps (version obsolète) ou son statut ne permet plus cette modification. Rechargez l'exécution.";
    case 0:
      return error.message;
    default:
      return error.message;
  }
}

/** Message for a failed status transition. */
export function executionStatusErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Le changement de statut est refusé : les informations envoyées sont invalides.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette exécution n'existe plus ou a été supprimée.";
    case 409:
      return "Cette transition n'est plus autorisée pour le statut actuel. Rechargez l'exécution.";
    case 0:
      return error.message;
    default:
      return error.message;
  }
}

/** Message for a failed soft deletion. */
export function executionDeleteErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "La suppression est refusée : la requête est invalide.";
    case 401:
      return "Votre session a expiré. Reconnectez-vous puis réessayez.";
    case 403:
      return "Accès refusé.";
    case 404:
      return "Cette exécution n'existe plus.";
    case 409:
      return "La suppression a été refusée par le serveur (conflit de version). Rechargez l'exécution.";
    case 0:
      return error.message;
    default:
      return error.message;
  }
}
