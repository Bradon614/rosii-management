import { Fragment, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SearchX,
  Trash2,
  Users,
} from "lucide-react";

import { ClientDeleteConfirmation } from "@/components/clients/client-delete-confirmation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { clientErrorMessage, clientsApi, clientsPath } from "@/lib/clients-api";
import { formatDate } from "@/lib/format";
import type { Client } from "@/types/api";

/**
 * Client list (Feature 19). Search is the backend's single `search` parameter
 * (substring on name, both phones and email, sorted by name); the API exposes
 * no pagination, so none is invented here.
 */
export function ClientsPage() {
  const location = useLocation();
  const routeFlash = (location.state as { flash?: string } | null)?.flash ?? null;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const { data, error, loading, reload } = useApiQuery<Client[]>(clientsPath(debouncedSearch));

  const [flash, setFlash] = useState<string | null>(routeFlash);
  const [confirming, setConfirming] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const term = debouncedSearch.trim();
  const searching = term.length > 0;
  const clients = data ?? [];

  async function handleDelete() {
    if (!confirming) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await clientsApi.remove(confirming.id);
      setFlash(`Le client « ${confirming.name} » a été supprimé.`);
      setConfirming(null);
      reload();
    } catch (cause) {
      setDeleteError(clientErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Consultez, recherchez et mettez à jour les coordonnées des clients de ROSII.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </Button>
          <Button asChild size="sm">
            <Link to="/clients/new">
              <Plus aria-hidden />
              Nouveau client
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-md">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="client-search"
            type="search"
            className="pl-9"
            placeholder="Rechercher un nom, un téléphone, un email…"
            aria-label="Rechercher un client"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {searching ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setSearch("")}>
            Effacer la recherche
          </Button>
        ) : null}
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Chargement impossible</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>{clientErrorMessage(error)}</span>
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

      {!loading && !error && data && clients.length === 0 ? (
        searching ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description={`Aucun client ne correspond à « ${term} ».`}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => setSearch("")}>
                Afficher tous les clients
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Users}
            title="Aucun client"
            description="Créez votre premier client pour commencer à enregistrer des demandes."
            action={
              <Button asChild size="sm">
                <Link to="/clients/new">
                  <Plus aria-hidden />
                  Créer un client
                </Link>
              </Button>
            }
          />
        )
      ) : null}

      {clients.length > 0 ? (
        <>
          <p className="text-muted-foreground text-sm" data-testid="client-count">
            {clients.length === 1 ? "1 client" : `${clients.length} clients`}
            {searching ? ` pour « ${term} »` : ""}
          </p>
          <Card className="py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead className="hidden sm:table-cell">Téléphone</TableHead>
                  <TableHead className="hidden lg:table-cell">Téléphone 2</TableHead>
                  <TableHead className="hidden xl:table-cell">Email</TableHead>
                  <TableHead className="hidden xl:table-cell">Créé le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <Fragment key={client.id}>
                    <TableRow>
                      <TableCell className="max-w-[18rem]">
                        <span className="block font-medium break-words">{client.name}</span>
                        <span className="text-muted-foreground mt-0.5 block text-xs sm:hidden">
                          {client.phone1}
                          {client.email ? ` · ${client.email}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap sm:table-cell">
                        {client.phone1}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap lg:table-cell">
                        {client.phone2 ?? "—"}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">{client.email ?? "—"}</TableCell>
                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
                        {formatDate(client.createdAt.slice(0, 10))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-nowrap items-center justify-end gap-1">
                          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/clients/${client.id}`}
                              aria-label={`Voir le client ${client.name}`}
                            >
                              <Eye aria-hidden />
                              <span className="hidden sm:inline">Voir</span>
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="sm" className="px-2 sm:px-3">
                            <Link
                              to={`/clients/${client.id}/edit`}
                              aria-label={`Modifier le client ${client.name}`}
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
                            aria-label={`Supprimer le client ${client.name}`}
                            onClick={() => {
                              setConfirming(client);
                              setDeleteError(null);
                            }}
                          >
                            <Trash2 aria-hidden />
                            <span className="hidden sm:inline">Supprimer</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {confirming?.id === client.id ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={6} className="bg-destructive/5 py-3">
                          <ClientDeleteConfirmation
                            clientName={client.name}
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
