import { useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { BadgeCheck, CheckCircle2, Eye, RefreshCw, SearchX } from "lucide-react";

import {
  ClosureExecutionCell,
  ClosurePreparationCell,
} from "@/components/closures/closure-row-context";
import { ClosureStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import { closureErrorMessage, closuresPath } from "@/lib/closures-api";
import { formatDateTime } from "@/lib/format";
import { closureStatusLabels } from "@/lib/labels";
import type {
  ClosureStatus,
  Preparation,
  Proposal,
  ServiceClosure,
} from "@/types/api";

const CLOSURE_STATUSES = Object.keys(closureStatusLabels) as ClosureStatus[];

/**
 * Global closure list (Feature 25). F11 really exposes `GET /api/closures` with
 * optional `preparationId` and `status` filters and no pagination or date
 * filter; this screen only offers the parameters the API supports and never
 * invents one. The preparation/execution context of a row is resolved from the
 * existing F09/F10 reads because the closure DTO only carries preparationId.
 */
export function ClosuresPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;
  const preparationFilter = searchParams.get("preparationId");
  const [status, setStatus] = useState<ClosureStatus | "">("");

  const { data, error, loading, reload } = useApiQuery<ServiceClosure[]>(
    closuresPath({ preparationId: preparationFilter, status }),
  );
  const { data: filterPreparation } = useApiQuery<Preparation>(
    preparationFilter ? `/api/preparations/${preparationFilter}` : null,
  );
  const { data: filterProposal } = useApiQuery<Proposal>(
    filterPreparation ? `/api/proposals/${filterPreparation.proposalId}` : null,
  );

  const closures = data ?? [];
  const filtered = Boolean(preparationFilter || status);

  function clearFilters() {
    setStatus("");
    if (preparationFilter) {
      setSearchParams({});
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clôtures</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Clôtures officielles des services, après une exécution terminée.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          Actualiser
        </Button>
      </header>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      {preparationFilter ? (
        <Alert>
          <AlertTitle>
            Clôtures de la préparation
            {filterProposal ? ` — ${filterProposal.number}` : ""}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Seules les clôtures de cette préparation sont affichées.</span>
            {filterProposal ? (
              <Button asChild size="sm" variant="outline">
                <Link to={`/propositions/${filterProposal.id}`}>Ouvrir la proposition</Link>
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
              Retirer le filtre
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:max-w-xs">
        <Label htmlFor="closure-filter-status">Statut</Label>
        <Select
          id="closure-filter-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as ClosureStatus | "")}
        >
          <option value="">Tous les statuts</option>
          {CLOSURE_STATUSES.map((item) => (
            <option key={item} value={item}>
              {closureStatusLabels[item]}
            </option>
          ))}
        </Select>
      </div>

      {filtered ? (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Réinitialiser les filtres
          </Button>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{closureErrorMessage(error)}</span>
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

      {!loading && !error && data && closures.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Aucune clôture ne correspond à ces critères."
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Afficher toutes les clôtures
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={BadgeCheck}
            title="Aucune clôture"
            description="Les clôtures se créent depuis le détail d'une préparation, après une exécution terminée et lorsque toutes les conditions F11 sont réunies."
          />
        )
      ) : null}

      {closures.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="closure-count">
            {closures.length === 1 ? "1 clôture" : `${closures.length} clôtures`}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de clôture</TableHead>
                  <TableHead>Préparation / proposition</TableHead>
                  <TableHead className="hidden md:table-cell">Exécution</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closures.map((closure) => (
                  <TableRow key={closure.id}>
                    <TableCell>
                      <ClosureStatusBadge status={closure.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {closure.closedAt ? formatDateTime(closure.closedAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <ClosurePreparationCell
                        preparationId={closure.preparationId}
                        proposalId={closure.proposalId}
                        proposalNumber={closure.proposalNumber}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <ClosureExecutionCell
                        executionId={closure.executionId}
                        executionStatus={closure.executionStatus}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                        <Link
                          to={`/closures/${closure.id}`}
                          aria-label={`Voir la clôture ${closure.id}`}
                        >
                          <Eye aria-hidden />
                          <span className="hidden sm:inline">Voir</span>
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
