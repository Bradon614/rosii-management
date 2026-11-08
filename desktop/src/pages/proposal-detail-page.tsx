import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FolderOpen, RefreshCw } from "lucide-react";

import { SectionCard } from "@/components/dossier/section-card";
import { FinancialSummary } from "@/components/proposals/financial-summary";
import { ProposalLinesTable } from "@/components/proposals/proposal-lines-table";
import { ProposalStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatDateTime } from "@/lib/format";
import type { Proposal } from "@/types/api";

function ProposalDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-28 w-full" />
      <Card className="gap-4 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    </div>
  );
}

/**
 * Proposal detail. Its main action is opening the service dossier; the page is
 * otherwise a read-only summary of the proposal itself.
 */
export function ProposalDetailPage() {
  const { proposalId } = useParams<{ proposalId: string }>();
  const { data, error, loading, reload } = useApiQuery<Proposal>(
    proposalId ? `/api/proposals/${proposalId}` : null,
  );

  if (!proposalId) {
    return (
      <ErrorState
        title="Proposition introuvable"
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
    return <ProposalDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Proposition introuvable" : "Chargement impossible"}
        description={
          notFound
            ? "Cette proposition n'existe pas ou a été supprimée."
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

  const proposal = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/propositions"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux propositions
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">{proposal.number}</span>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">
            {proposal.title ?? "Proposition sans titre"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Créée le {formatDateTime(proposal.createdAt)}
            {proposal.acceptedAt ? ` · Acceptée le ${formatDateTime(proposal.acceptedAt)}` : ""}
          </p>
        </div>
        <Button asChild>
          <Link to={`/propositions/${proposal.id}/dossier`}>
            <FolderOpen aria-hidden />
            Ouvrir le dossier de service
          </Link>
        </Button>
      </header>

      <FinancialSummary proposal={proposal} />

      <SectionCard
        title="Lignes de la proposition"
        description={
          proposal.lines.length === 1
            ? "1 ligne commerciale"
            : `${proposal.lines.length} lignes commerciales`
        }
      >
        <ProposalLinesTable lines={proposal.lines} total={proposal.proposalTotal} />
      </SectionCard>

      {proposal.notes ? (
        <SectionCard title="Notes" description="Remarques enregistrées sur la proposition">
          <p className="text-sm whitespace-pre-line">{proposal.notes}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
