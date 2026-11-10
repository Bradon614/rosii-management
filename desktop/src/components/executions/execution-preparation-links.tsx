import { Link } from "react-router-dom";

/**
 * Preparation and proposal links of one execution row (Feature 24).
 *
 * Feature 34: the execution DTO now carries the proposal of the preparation
 * (`proposalId`, `proposalNumber`), so the row no longer reads
 * `GET /api/preparations/{id}` for every execution. Nothing is invented here:
 * the values come from the list response itself.
 */
export function ExecutionPreparationLinks({
  preparationId,
  proposalId,
  proposalNumber,
}: {
  preparationId: string;
  proposalId: string;
  proposalNumber: string;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <Link
        to={`/preparations/${preparationId}`}
        aria-label={`Ouvrir la préparation ${preparationId}`}
        className="w-fit text-sm hover:underline hover:underline-offset-4"
      >
        Préparation
      </Link>
      <Link
        to={`/propositions/${proposalId}`}
        aria-label={`Ouvrir la proposition ${proposalNumber}`}
        className="w-fit font-mono text-xs hover:underline hover:underline-offset-4"
      >
        {proposalNumber}
      </Link>
    </div>
  );
}
