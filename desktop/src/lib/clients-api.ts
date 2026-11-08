/**
 * Client API (Feature 19) — thin, typed wrapper over the existing HTTP client.
 *
 * Endpoints of the F04 backend, verified against the running API:
 * `GET /api/clients?search=` (substring, name/phones/email, sorted by name, no
 * pagination), `GET /api/clients/{id}`, `POST /api/clients`,
 * `PUT /api/clients/{id}` (the payload carries no version: the backend's
 * @Version guards the write) and `DELETE /api/clients/{id}` (204, soft delete).
 */

import { ApiError, api } from "@/lib/api";
import type { ClientPayload } from "@/lib/client-validation";
import type { Client } from "@/types/api";

/** List path, with the backend's single `search` parameter when provided. */
export function clientsPath(search = ""): string {
  const term = search.trim();
  return term.length === 0 ? "/api/clients" : `/api/clients?search=${encodeURIComponent(term)}`;
}

export const clientsApi = {
  list(search = ""): Promise<Client[]> {
    return api.get<Client[]>(clientsPath(search));
  },
  get(id: string): Promise<Client> {
    return api.get<Client>(`/api/clients/${id}`);
  },
  create(payload: ClientPayload): Promise<Client> {
    return api.post<Client>("/api/clients", payload);
  },
  /**
   * Full replacement of the editable fields. `UpdateClientRequest` has no
   * version field: optimistic locking happens server-side at flush time.
   */
  update(id: string, payload: ClientPayload): Promise<Client> {
    return api.put<Client>(`/api/clients/${id}`, payload);
  },
  remove(id: string): Promise<void> {
    return api.delete(`/api/clients/${id}`);
  },
};

/**
 * User-facing message for a failed client call. The backend answers 400 with a
 * generic Spring body (no field details) and 409 with a raw technical message,
 * so both are translated here instead of being shown as-is.
 */
export function clientErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Certaines informations sont invalides. Vérifiez les champs puis réessayez.";
    case 409:
      return "Ce client a été modifié entre-temps. Rechargez la fiche avant de réessayer.";
    case 404:
      return "Ce client n'existe plus.";
    case 403:
      return "Accès refusé.";
    default:
      return error.message;
  }
}
