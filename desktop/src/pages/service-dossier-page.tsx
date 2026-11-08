import { Link, useParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { ClientSection } from "@/components/dossier/client-section";
import { ClosureSection } from "@/components/dossier/closure-section";
import { DemandSection } from "@/components/dossier/demand-section";
import { DossierHeader } from "@/components/dossier/dossier-header";
import { ExecutionSection } from "@/components/dossier/execution-section";
import { InvoicesSection } from "@/components/dossier/invoices-section";
import { PaymentsSection } from "@/components/dossier/payments-section";
import { PreparationSection } from "@/components/dossier/preparation-section";
import { ProposalSection } from "@/components/dossier/proposal-section";
import { FinancialSummary } from "@/components/proposals/financial-summary";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import type { ServiceDossier } from "@/types/api";

/** Page-shaped placeholder: same sections as the real dossier, greyed out. */
function DossierSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-44" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

/**
 * Feature 18 — read-only service dossier of one proposal.
 *
 * The whole content comes from `GET /api/service-dossiers/{proposalId}`: no
 * amount is recomputed, no data is written, and each section that does not
 * exist yet shows its own explicit empty state.
 */
export function ServiceDossierPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const { data, error, loading, reload } = useApiQuery<ServiceDossier>(
    proposalId ? `/api/service-dossiers/${proposalId}` : null,
  );

  if (!proposalId) {
    return (
      <ErrorState
        title="Dossier introuvable"
        description="Aucun identifiant de proposition n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/propositions">Retour aux propositions</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <DossierSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Dossier introuvable" : "Chargement impossible"}
        description={
          notFound
            ? "Cette proposition n'existe pas ou a été supprimée : son dossier de service n'est plus accessible."
            : error.message
        }
        action={
          <>
            {!notFound ? (
              <Button type="button" onClick={reload}>
                <RefreshCw aria-hidden />
                Réessayer
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/propositions">Retour aux propositions</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const dossier = data;

  return (
    <div className="flex flex-col gap-6">
      <DossierHeader
        dossier={dossier}
        refreshing={loading}
        onRefresh={reload}
      />

      <FinancialSummary proposal={dossier.proposal} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ClientSection client={dossier.client} />
        <DemandSection demand={dossier.demand} />
      </div>

      <ProposalSection proposal={dossier.proposal} />

      <PaymentsSection payments={dossier.payments} receipts={dossier.receipts} />

      <InvoicesSection invoices={dossier.invoices} payments={dossier.payments} />

      <Card className="gap-0 p-0">
        <div className="grid gap-6 p-5 lg:grid-cols-2 xl:grid-cols-3">
          <PreparationSection preparation={dossier.preparation} />
          <ExecutionSection execution={dossier.execution} />
          <ClosureSection closure={dossier.closure} />
        </div>
      </Card>
    </div>
  );
}
