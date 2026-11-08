import { useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  FolderOpen,
  Plus,
  RefreshCw,
  Search,
  SearchX,
} from "lucide-react";

import { ProposalStatusBadge } from "@/components/status-badge";
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
import type { Client, Demand, Proposal, ProposalStatus } from "@/types/api";
import { formatAriary, formatDate } from "@/lib/format";
import { demandTypeLabels, proposalStatusLabels } from "@/lib/labels";
import { proposalErrorMessage, proposalsPath } from "@/lib/proposals-api";

const PROPOSAL_STATUSES = Object.keys(proposalStatusLabels) as ProposalStatus[];

/**
 * Proposal list (Features 18 → 21). The F18 read-only list is preserved (same
 * route, same dossier access) and extended with the search, the status filter,
 * the demand context and the creation entry point.
 *
 * The F07 response only carries `clientId` / `demandId`; the client and demand
 * names are resolved from the existing F04/F06 list endpoints.
 */
export function ProposalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const demandFilter = searchParams.get("demandId");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProposalStatus | "">("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const { data, error, loading, reload } = useApiQuery<Proposal[]>(
    proposalsPath({ search: debouncedSearch, status, demandId: demandFilter }),
  );

  const { data: clients } = useApiQuery<Client[]>("/api/clients");
  const { data: demands } = useApiQuery<Demand[]>("/api/demands");
  const { data: filterDemand } = useApiQuery<Demand>(
    demandFilter ? `/api/demands/${demandFilter}` : null,
  );

  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const clientNames = useMemo(
    () => new Map((clients ?? []).map((client) => [client.id, client.name])),
    [clients],
  );
  const demandsById = useMemo(
    () => new Map((demands ?? []).map((demand) => [demand.id, demand])),
    [demands],
  );

  const proposals = data ?? [];
  const filtered = Boolean(debouncedSearch.trim() || status || demandFilter);

  function clearFilters() {
    setSearch("");
    setStatus("");
    if (demandFilter) {
      setSearchParams({});
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Propositions</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Devis envoyés aux clients : contenu, validité, montant et suivi commercial.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </Button>
          <Button asChild size="sm">
            <Link to="/propositions/new">
              <Plus aria-hidden />
              Nouvelle proposition
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

      {demandFilter ? (
        <Alert>
          <AlertTitle>
            Propositions de la demande
            {filterDemand ? ` — ${filterDemand.clientName} · ${demandTypeLabels[filterDemand.type]}` : ""}
          </AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>Seules les propositions de cette demande sont affichées.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setSearchParams({})}>
              Retirer le filtre
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="proposal-search">Recherche</Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <Input
              id="proposal-search"
              type="search"
              className="pl-9"
              placeholder="Numéro, titre, client, notes…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="proposal-filter-status">Statut</Label>
          <Select
            id="proposal-filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as ProposalStatus | "")}
          >
            <option value="">Tous les statuts</option>
            {PROPOSAL_STATUSES.map((item) => (
              <option key={item} value={item}>
                {proposalStatusLabels[item]}
              </option>
            ))}
          </Select>
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
            <span>{proposalErrorMessage(error)}</span>
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

      {!loading && !error && data && proposals.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Aucune proposition ne correspond à ces critères."
            action={
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Afficher toutes les propositions
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Aucune proposition"
            description="Créez une proposition à partir d'une demande pour envoyer un devis au client."
            action={
              <Button asChild size="sm">
                <Link to="/propositions/new">
                  <Plus aria-hidden />
                  Créer une proposition
                </Link>
              </Button>
            }
          />
        )
      ) : null}

      {proposals.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="proposal-count">
            {proposals.length === 1 ? "1 proposition" : `${proposals.length} propositions`}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Numéro</TableHead>
                  <TableHead className="hidden sm:table-cell">Client</TableHead>
                  <TableHead className="hidden md:table-cell">Demande</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="hidden lg:table-cell">Validité</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposals.map((proposal) => {
                  const demand = demandsById.get(proposal.demandId);
                  const clientName =
                    clientNames.get(proposal.clientId) ?? demand?.clientName ?? "—";
                  return (
                    <TableRow key={proposal.id}>
                      <TableCell className="max-w-[12rem]">
                        <span className="block font-mono text-xs whitespace-nowrap">
                          {proposal.number}
                        </span>
                        <span className="text-muted-foreground block text-xs break-words">
                          {proposal.title ?? "Sans titre"}
                        </span>
                        {/* Narrow screens keep the amount next to the number. */}
                        <span className="text-muted-foreground mt-0.5 block text-xs whitespace-nowrap tabular-nums sm:hidden">
                          {formatAriary(proposal.proposalTotal)}
                        </span>
                      </TableCell>
                      <TableCell className="hidden max-w-[14rem] sm:table-cell">
                        <span className="block break-words">{clientName}</span>
                      </TableCell>
                      <TableCell className="hidden max-w-[14rem] md:table-cell">
                        {demand ? (
                          <span className="block text-sm">
                            {demandTypeLabels[demand.type]}
                            {demand.requestedDate
                              ? ` · ${formatDate(demand.requestedDate)}`
                              : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <ProposalStatusBadge status={proposal.status} />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {formatDate(proposal.validUntil)}
                      </TableCell>
                      <TableCell className="hidden text-right font-medium whitespace-nowrap tabular-nums sm:table-cell">
                        {formatAriary(proposal.proposalTotal)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/propositions/${proposal.id}`}
                              aria-label={`Voir la proposition ${proposal.number}`}
                            >
                              <Eye aria-hidden />
                              <span className="hidden sm:inline">Détails</span>
                            </Link>
                          </Button>
                          <Button asChild size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/propositions/${proposal.id}/dossier`}
                              aria-label={`Ouvrir le dossier de ${proposal.number}`}
                            >
                              <FolderOpen aria-hidden />
                              <span className="hidden sm:inline">Dossier</span>
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      ) : null}
    </div>
  );
}
