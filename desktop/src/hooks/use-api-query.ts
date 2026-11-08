import { useCallback, useEffect, useState } from "react";

import { api, ApiError } from "@/lib/api";

export interface ApiQueryResult<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Re-runs the request (used by the "Réessayer" buttons). */
  reload: () => void;
}

interface ApiQueryState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  return new ApiError(0, "Une erreur inattendue est survenue.");
}

/**
 * Reads one API resource. A `null` path disables the query (for example while a
 * route parameter is missing). One request per path and per reload, never one
 * per render; the shared client deduplicates concurrent identical GETs.
 */
export function useApiQuery<T>(path: string | null): ApiQueryResult<T> {
  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<ApiQueryState<T>>({
    data: null,
    error: null,
    loading: path !== null,
  });

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    api
      .get<T>(path)
      .then((data) => {
        if (active) {
          setState({ data, error: null, loading: false });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ data: null, error: toApiError(error), loading: false });
        }
      });

    return () => {
      active = false;
    };
  }, [path, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  return { ...state, reload };
}
