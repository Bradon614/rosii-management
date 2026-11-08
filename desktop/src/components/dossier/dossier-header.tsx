import { Link } from "react-router-dom";
import { ArrowLeft, FileText, RefreshCw } from "lucide-react";

import { ProposalStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { ServiceDossier } from "@/types/api";

interface DossierHeaderProps {
  dossier: ServiceDossier;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Header of the service dossier: proposal number, title, client, proposal
 * status and the most relevant date available (acceptance, else sending, else
 * creation). Read-only: it only navigates and refreshes.
 */
export function DossierHeader({ dossier, refreshing, onRefresh }: DossierHeaderProps) {
  const { proposal, client } = dossier;

  const importantDate = proposal.acceptedAt
    ? { label: "Acceptée le", value: formatDateTime(proposal.acceptedAt) }
    : proposal.sentAt
      ? { label: "Envoyée le", value: formatDateTime(proposal.sentAt) }
      : { label: "Créée le", value: formatDateTime(proposal.createdAt) };

  return (
    <header className="flex flex-col gap-4">
      <Link
        to="/propositions"
        className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour aux propositions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground font-mono text-sm">{proposal.number}</span>
            <ProposalStatusBadge status={proposal.status} />
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight break-words">
            {proposal.title ?? "Proposition sans titre"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Dossier de service · {client.name} · {importantDate.label} {importantDate.value}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/propositions/${proposal.id}`}>
              <FileText aria-hidden />
              Voir la proposition
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
