/**
 * Demand API (Feature 20) — typed wrapper over the existing HTTP client.
 *
 * Endpoints of the F06 backend, verified against the running API:
 * `GET /api/demands?search=&clientId=&type=&status=` (all optional, combinable,
 * newest first, no pagination), `GET /api/demands/{id}`, `POST /api/demands`
 * (status defaults to NEW, budgetType to NONE), `PUT /api/demands/{id}` (the
 * payload requires the full editable state **plus** `version`; a stale version
 * answers 409) and `DELETE /api/demands/{id}` (204, soft delete).
 *
 * There is no dedicated status endpoint: changing the status is a normal update
 * built from the current record.
 */

import { ApiError, api } from "@/lib/api";
import type {
  BudgetType,
  Demand,
  DemandEventDetails,
  DemandStatus,
  DemandType,
} from "@/types/api";

/** Event details payload (same shape as `DemandEventDetailsRequest`). */
export interface DemandEventDetailsPayload {
  eventType: string;
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

/** Body of `POST /api/demands`. */
export interface DemandPayload {
  clientId: string;
  type: DemandType;
  status: DemandStatus;
  requestedDate: string | null;
  estimatedPeople: number | null;
  budgetType: BudgetType;
  budgetMin: number | null;
  budgetMax: number | null;
  location: string | null;
  notes: string | null;
  eventDetails: DemandEventDetailsPayload | null;
}

/** Body of `PUT /api/demands/{id}`: the editable state plus the version. */
export interface DemandUpdatePayload extends DemandPayload {
  version: number;
}

export interface DemandFilters {
  search?: string;
  type?: DemandType | "";
  status?: DemandStatus | "";
  /** Restricts the list to one client (supported by the backend). */
  clientId?: string | null;
}

/** List path with only the filters that are actually set. */
export function demandsPath(filters: DemandFilters = {}): string {
  const params = new URLSearchParams();
  const search = filters.search?.trim();
  if (search) {
    params.set("search", search);
  }
  if (filters.clientId) {
    params.set("clientId", filters.clientId);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  const query = params.toString();
  return query ? `/api/demands?${query}` : "/api/demands";
}

function mapEventDetails(details: DemandEventDetails | null): DemandEventDetailsPayload | null {
  if (!details) {
    return null;
  }
  return {
    eventType: details.eventType ?? "",
    hallNeeded: details.hallNeeded,
    desiredHall: details.desiredHall,
    cateringRequested: details.cateringRequested,
    decorationRequested: details.decorationRequested,
    floristRequested: details.floristRequested,
    equipmentRentalRequested: details.equipmentRentalRequested,
    transportRequested: details.transportRequested,
    theme: details.theme,
    notes: details.notes,
  };
}

/** Builds the full update body from a loaded demand (used to change the status). */
export function demandToUpdatePayload(
  demand: Demand,
  overrides: Partial<DemandPayload> = {},
): DemandUpdatePayload {
  return {
    clientId: demand.clientId,
    type: demand.type,
    status: demand.status,
    requestedDate: demand.requestedDate,
    estimatedPeople: demand.estimatedPeople,
    budgetType: demand.budgetType,
    budgetMin: demand.budgetMin,
    budgetMax: demand.budgetMax,
    location: demand.location,
    notes: demand.notes,
    eventDetails: mapEventDetails(demand.eventDetails),
    ...overrides,
    version: demand.version,
  };
}

export const demandsApi = {
  list(filters: DemandFilters = {}): Promise<Demand[]> {
    return api.get<Demand[]>(demandsPath(filters));
  },
  get(id: string): Promise<Demand> {
    return api.get<Demand>(`/api/demands/${id}`);
  },
  create(payload: DemandPayload): Promise<Demand> {
    return api.post<Demand>("/api/demands", payload);
  },
  update(id: string, payload: DemandUpdatePayload): Promise<Demand> {
    return api.put<Demand>(`/api/demands/${id}`, payload);
  },
  remove(id: string): Promise<void> {
    return api.delete(`/api/demands/${id}`);
  },
};

/**
 * User-facing message for a failed demand call. F06 answers 400 and 409 with a
 * generic Spring body (no field details), so the status is translated here
 * while the form's own validation carries the precise field messages.
 */
export function demandErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Une erreur inattendue est survenue. Réessayez.";
  }
  switch (error.status) {
    case 400:
      return "Certaines informations sont invalides. Vérifiez les champs puis réessayez.";
    case 409:
      return "Cette demande a été modifiée entre-temps. Rechargez-la avant de réessayer.";
    case 404:
      return "Cette demande n'existe plus.";
    case 403:
      return "Accès refusé.";
    default:
      return error.message;
  }
}

/**
 * Message for the create/edit form. There, a 404 means the selected client
 * disappeared (the backend answers 404 on an unknown or soft-deleted client).
 */
export function demandFormErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.isNotFound) {
    return "Le client sélectionné n'existe plus. Actualisez la liste des clients et réessayez.";
  }
  return demandErrorMessage(error);
}
