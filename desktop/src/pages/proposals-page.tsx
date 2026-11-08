import { Link } from "react-router-dom";
import { FolderOpen, RefreshCw, SearchX } from "lucide-react";

import { ProposalStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatAriary, formatDate } from "@/lib/format";
import type { Proposal } from "@/types/api";

/**
 * Proposal list — the entry point to the service dossier: every row can open the
 * dossier of that proposal. Read-only: this page never creates nor modifies a
 * proposal.
 */
export function ProposalsPage() {
  const { data, error, loading, reload } = useApiQuery<Proposal[]>("/api/proposals");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Propositions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Ouvrez le dossier de service d'une proposition pour retrouver le client, les paiements,
            les documents et le déroulement de la prestation.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          Actualiser
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{error.message}</span>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <Card className="gap-4 p-5" aria-busy="true">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : null}

      {!loading && !error && data && data.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Aucune proposition"
          description="Aucune proposition n'est encore enregistrée. Créez-en une depuis le module Propositions du backend."
        />
      ) : null}

      {data && data.length > 0 ? (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numéro</TableHead>
                <TableHead>Titre</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((proposal) => (
                <TableRow key={proposal.id}>
                  <TableCell className="font-mono text-xs whitespace-nowrap">
                    {proposal.number}
                  </TableCell>
                  <TableCell className="max-w-[22rem]">
                    <span className="block font-medium break-words">
                      {proposal.title ?? "Sans titre"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Créée le {formatDate(proposal.createdAt.slice(0, 10))}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ProposalStatusBadge status={proposal.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatAriary(proposal.proposalTotal)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/propositions/${proposal.id}`}>Détails</Link>
                      </Button>
                      <Button asChild size="sm">
                        <Link to={`/propositions/${proposal.id}/dossier`}>
                          <FolderOpen aria-hidden />
                          Dossier
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
