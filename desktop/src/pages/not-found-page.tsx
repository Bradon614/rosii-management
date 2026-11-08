import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

/** Fallback route for an unknown path. */
export function NotFoundPage() {
  return (
    <ErrorState
      title="Page introuvable"
      description="La page demandée n'existe pas ou a été déplacée."
      action={
        <Button asChild variant="outline">
          <Link to="/propositions">Retour aux propositions</Link>
        </Button>
      }
    />
  );
}
