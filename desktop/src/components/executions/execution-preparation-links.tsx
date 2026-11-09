import { Link } from "react-router-dom";

import { useApiQuery } from "@/hooks/use-api-query";
import type { Preparation } from "@/types/api";

/**
 * Preparation and proposal links of one execution row (Feature 24).
 *
 * The execution DTO only exposes `preparationId`; the F09 preparation endpoint
 * adds the proposal id and number. One request per row (identical concurrent
 * GETs are deduplicated by the shared client) and no invented parameter.
 */
export function ExecutionPreparationLinks({ preparationId }: { preparationId: string }) {
  const { data: preparation, error, loading } = useApiQuery<Preparation>(
    `/api/preparations/${preparationId}`,
  );

  return (
    <div className="grid min-w-0 gap-0.5">
      <Link
        to={`/preparations/${preparationId}`}
        aria-label={`Ouvrir la préparation ${preparationId}`}
        className="w-fit text-sm hover:underline hover:underline-offset-4"
      >
        Préparation
      </Link>
      {loading && !preparation ? (
        <span className="text-muted-foreground text-xs">Chargement du lien…</span>
      ) : preparation ? (
        <Link
          to={`/propositions/${preparation.proposalId}`}
          aria-label={`Ouvrir la proposition ${preparation.proposalNumber}`}
          className="w-fit font-mono text-xs hover:underline hover:underline-offset-4"
        >
          {preparation.proposalNumber}
        </Link>
      ) : error?.isNotFound ? (
        <span className="text-muted-foreground text-xs">Proposition indisponible</span>
      ) : (
        <span className="text-muted-foreground text-xs">Lien indisponible</span>
      )}
    </div>
  );
}
