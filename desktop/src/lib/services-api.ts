/** Catalogue API (Feature 05) — read-only use from the proposal lines editor. */

import { api } from "@/lib/api";
import type { CatalogueService } from "@/types/api";

/** Path of the catalogue, optionally restricted to active services. */
export function servicesPath(active?: boolean): string {
  return active === undefined ? "/api/services" : `/api/services?active=${active}`;
}

export function listServices(active?: boolean): Promise<CatalogueService[]> {
  return api.get<CatalogueService[]>(servicesPath(active));
}
