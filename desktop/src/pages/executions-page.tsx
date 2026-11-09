import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarClock, Eye, RefreshCw, SearchX } from "lucide-react";

import { ExecutionPreparationLinks } from "@/components/executions/execution-preparation-links";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { executionErrorMessage, executionsPath } from "@/lib/executions-api";
import { formatDate, formatTime } from "@/lib/format";
import { executionStatusLabels } from "@/lib/labels";
import type { Execution, ExecutionStatus, Preparation, Proposal } from "@/types/api";

const EXECUTION_STATUSES = Object.keys(executionStatusLabels) as ExecutionStatus[];

/**
 * Global execution list (Feature 24). F10 really exposes `GET /api/executions`
 * with optional `preparationId`, `status` and `scheduledDate` filters and no
 * pagination or text search; the screen therefore only offers filters the API
 * supports and never invents a parameter.
 */
export function ExecutionsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const preparationFilter = searchParams.get("preparationId");

  const [status, setStatus] = useState<ExecutionStatus | "">("");
  const [scheduledDate, setScheduledDate] = useState("");

  const { data, error, loading, reload } = useApiQuery<Execution[]>(
    executionsPath({ preparationId: preparationFilter, status, scheduledDate }),
  );
  const { data: filterPreparation } = useApiQuery<Preparation>(
    preparationFilter ? `/api/preparations/${preparationFilter}` : null,
  );
  const { data: filterProposal } = useApiQuery<Proposal>(
    filterPreparation ? `/api/proposals/${filterPreparation.proposalId}` : null,
  );

  const executions = data ?? [];
  const filtered = Boolean(preparationFilter || status || scheduledDate);

  function clearFilters() {
    setStatus("");
    setScheduledDate("");
    if (preparationFilter) {
      setSearchParams({});
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Exécutions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Suivi opérationnel des préparations : statut, date programmée, lieu et dossier associé.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
          Actualiser
        </Button>
      </header>

      {preparationFilter ? (
        <Alert>
          <AlertTitle>
            Exécutions de la préparation
            {filterProposal ? ` — ${filterProposal.number}` : ""}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Seules les exécutions de cette préparation sont affichées.</span>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="execution-filter-status">Statut</Label>
          <Select
            id="execution-filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ExecutionStatus | "")}
          >
            <option value="">Tous les statuts</option>
            {EXECUTION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {executionStatusLabels[item]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="execution-filter-date">Date programmée</Label>
          <Input
            id="execution-filter-date"
            type="date"
            value={scheduledDate}
            onChange={(event) => setScheduledDate(event.target.value)}
          />
        </div>
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
            <span>{executionErrorMessage(error)}</span>
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

      {!loading && !error && data && executions.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Aucune exécution ne correspond à ces critères."
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Afficher toutes les exécutions
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="Aucune exécution"
            description="Les exécutions se créent depuis le détail d'une préparation, lorsque la proposition est acceptée et le dépôt atteint."
          />
        )
      ) : null}

      {executions.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="execution-count">
            {executions.length === 1 ? "1 exécution" : `${executions.length} exécutions`}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date programmée</TableHead>
                  <TableHead className="hidden md:table-cell">Horaires</TableHead>
                  <TableHead className="hidden sm:table-cell">Lieu</TableHead>
                  <TableHead>Préparation / proposition</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.map((execution) => (
                  <TableRow key={execution.id}>
                    <TableCell>
                      <ExecutionStatusBadge status={execution.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="block">{formatDate(execution.scheduledDate)}</span>
                      <span className="text-muted-foreground mt-0.5 block text-xs sm:hidden">
                        {execution.location ?? "Lieu non renseigné"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      {execution.startTime || execution.endTime
                        ? `${formatTime(execution.startTime)} – ${formatTime(execution.endTime)}`
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden max-w-[16rem] break-words sm:table-cell">
                      {execution.location ?? "—"}
                    </TableCell>
                    <TableCell>
                      <ExecutionPreparationLinks preparationId={execution.preparationId} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                        <Link
                          to={`/executions/${execution.id}`}
                          aria-label={`Voir l'exécution ${execution.id}`}
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
