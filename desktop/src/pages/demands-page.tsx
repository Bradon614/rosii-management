import { Fragment, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ClipboardList,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
} from "lucide-react";

import { DemandDeleteConfirmation } from "@/components/demands/demand-delete-confirmation";
import { DemandStatusBadge } from "@/components/status-badge";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { describeDemand, formatDemandBudget } from "@/lib/demand-display";
import { demandErrorMessage, demandsApi, demandsPath } from "@/lib/demands-api";
import { formatDate, formatInteger } from "@/lib/format";
import { demandStatusLabels, demandTypeLabels } from "@/lib/labels";
import type { Client, Demand, DemandStatus, DemandType } from "@/types/api";

const DEMAND_TYPES = Object.keys(demandTypeLabels) as DemandType[];
const DEMAND_STATUSES = Object.keys(demandStatusLabels) as DemandStatus[];

/**
 * Demand list (Feature 20). The filters are the backend's own parameters
 * (`search`, `type`, `status`, `clientId`) combined exactly as the API expects:
 * no client-side filtering and no invented pagination.
 */
export function DemandsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const clientFilter = searchParams.get("clientId");

  const [search, setSearch] = useState("");
  const [type, setType] = useState<DemandType | "">("");
  const [status, setStatus] = useState<DemandStatus | "">("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data, error, loading, reload } = useApiQuery<Demand[]>(
    demandsPath({ search: debouncedSearch, type, status, clientId: clientFilter }),
  );

  // Client name of the optional `?clientId=` filter, read from the F19 API.
  const { data: filteredClient } = useApiQuery<Client>(
    clientFilter ? `/api/clients/${clientFilter}` : null,
  );

  const [flash, setFlash] = useState<string | null>(
    (location.state as { flash?: string } | null)?.flash ?? null,
  );
  const [confirming, setConfirming] = useState<Demand | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const demands = data ?? [];
  const hasFilters = Boolean(debouncedSearch.trim() || type || status || clientFilter);

  function clearFilters() {
    setSearch("");
    setType("");
    setStatus("");
    if (clientFilter) {
      setSearchParams({});
    }
  }

  async function handleDelete() {
    if (!confirming) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await demandsApi.remove(confirming.id);
      setFlash(`La demande de « ${confirming.clientName} » a été supprimée.`);
      setConfirming(null);
      reload();
    } catch (cause) {
      setDeleteError(demandErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demandes</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Suivez les besoins exprimés par les clients, de la première demande au devis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </Button>
          <Button asChild size="sm">
            <Link to="/demandes/new">
              <Plus aria-hidden />
              Nouvelle demande
            </Link>
          </Button>
        </div>
      </header>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      {clientFilter ? (
        <Alert>
          <ClipboardList aria-hidden />
          <AlertTitle>
            Demandes du client {filteredClient ? `« ${filteredClient.name} »` : ""}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Seules les demandes de ce client sont affichées.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSearchParams({})}
            >
              Retirer le filtre
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="demand-search">Recherche</Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="demand-search"
              type="search"
              className="pl-9"
              placeholder="Client, téléphone, lieu, notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="demand-filter-type">Type</Label>
          <Select
            id="demand-filter-type"
            value={type}
            onChange={(event) => setType(event.target.value as DemandType | "")}
          >
            <option value="">Tous les types</option>
            {DEMAND_TYPES.map((item) => (
              <option key={item} value={item}>
                {demandTypeLabels[item]}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="demand-filter-status">Statut</Label>
          <Select
            id="demand-filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as DemandStatus | "")}
          >
            <option value="">Tous les statuts</option>
            {DEMAND_STATUSES.map((item) => (
              <option key={item} value={item}>
                {demandStatusLabels[item]}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {hasFilters ? (
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
            <span>{demandErrorMessage(error)}</span>
            <Button type="button" size="sm" variant="outline" onClick={reload}>
              Réessayer
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {loading && !data ? (
        <Card className="gap-4 p-5" aria-busy="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </Card>
      ) : null}

      {!loading && !error && data && demands.length === 0 ? (
        hasFilters ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Aucune demande ne correspond à ces critères."
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Afficher toutes les demandes
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Aucune demande"
            description="Enregistrez la première demande d'un client pour démarrer le suivi commercial."
            action={
              <Button asChild size="sm">
                <Link to="/demandes/new">
                  <Plus aria-hidden />
                  Créer une demande
                </Link>
              </Button>
            }
          />
        )
      ) : null}

      {demands.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="demand-count">
            {demands.length === 1 ? "1 demande" : `${demands.length} demandes`}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden md:table-cell">Date souhaitée</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Personnes</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Budget</TableHead>
                  <TableHead className="hidden xl:table-cell">Créée le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demands.map((demand) => (
                  <Fragment key={demand.id}>
                    <TableRow>
                      <TableCell className="max-w-[16rem]">
                        <Link
                          to={`/clients/${demand.clientId}`}
                          className="block font-medium break-words hover:underline hover:underline-offset-4"
                        >
                          {demand.clientName}
                        </Link>
                        <span className="text-muted-foreground mt-0.5 block text-xs sm:hidden">
                          {describeDemand(demand)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {demandTypeLabels[demand.type]}
                      </TableCell>
                      <TableCell>
                        <DemandStatusBadge status={demand.status} />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">
                        {formatDate(demand.requestedDate)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums lg:table-cell">
                        {demand.estimatedPeople === null
                          ? "—"
                          : formatInteger(demand.estimatedPeople)}
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap tabular-nums lg:table-cell">
                        {formatDemandBudget(demand)}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
                        {formatDate(demand.createdAt.slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/demandes/${demand.id}`}
                              aria-label={`Voir la demande de ${demand.clientName}`}
                            >
                              <Eye aria-hidden />
                              <span className="hidden sm:inline">Voir</span>
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/demandes/${demand.id}/edit`}
                              aria-label={`Modifier la demande de ${demand.clientName}`}
                            >
                              <Pencil aria-hidden />
                              <span className="hidden sm:inline">Modifier</span>
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2 sm:px-3"
                            aria-label={`Supprimer la demande de ${demand.clientName}`}
                            onClick={() => {
                              setConfirming(demand);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 aria-hidden />
                            <span className="hidden sm:inline">Supprimer</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {confirming?.id === demand.id ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="bg-destructive/5 py-3">
                          <DemandDeleteConfirmation
                            clientName={demand.clientName}
                            typeLabel={demandTypeLabels[demand.type]}
                            requestedDate={
                              demand.requestedDate ? formatDate(demand.requestedDate) : null
                            }
                            pending={deleting}
                            error={deleteError}
                            onConfirm={handleDelete}
                            onCancel={() => {
                              setConfirming(null);
                              setDeleteError(null);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
