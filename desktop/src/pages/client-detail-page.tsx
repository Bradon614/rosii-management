import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Pencil,
  Phone,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";

import { ClientDeleteConfirmation } from "@/components/clients/client-delete-confirmation";
import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { clientErrorMessage, clientsApi } from "@/lib/clients-api";
import { formatDateTime } from "@/lib/format";
import type { Client } from "@/types/api";

function ClientDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * Client detail (Feature 19). Read-only view of the F04 record with the two
 * permitted actions: edit and soft delete. No history, demand list or activity
 * is shown: the backend exposes no such endpoint.
 */
export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const flash = (location.state as { flash?: string } | null)?.flash ?? null;

  const { data, error, loading, reload } = useApiQuery<Client>(
    clientId ? `/api/clients/${clientId}` : null,
  );

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDelete() {
    if (!data) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await clientsApi.remove(data.id);
      navigate("/clients", {
        state: { flash: `Le client « ${data.name} » a été supprimé.` },
      });
    } catch (cause) {
      setDeleteError(clientErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  if (!clientId) {
    return (
      <ErrorState
        title="Client introuvable"
        description="Aucun identifiant de client n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/clients">Retour aux clients</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <ClientDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Client introuvable" : "Chargement impossible"}
        description={
          notFound ? "Ce client n'existe pas ou a été supprimé." : clientErrorMessage(error)
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
              <Link to="/clients">Retour aux clients</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const client = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/clients"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux clients
        </Link>
      </div>

      {flash ? (
        <Alert variant="success">
          <CheckCircle2 aria-hidden />
          <AlertTitle>Opération réussie</AlertTitle>
          <AlertDescription>{flash}</AlertDescription>
        </Alert>
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight break-words">
            <User className="text-muted-foreground size-5" aria-hidden />
            {client.name}
          </h1>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <CalendarDays className="size-4" aria-hidden />
            Client depuis le {formatDateTime(client.createdAt)}
            {client.updatedAt !== client.createdAt
              ? ` · dernière modification le ${formatDateTime(client.updatedAt)}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/demandes?clientId=${client.id}`}>
              <ClipboardList aria-hidden />
              Demandes
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={`/clients/${client.id}/edit`}>
              <Pencil aria-hidden />
              Modifier
            </Link>
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={confirming}
          >
            <Trash2 aria-hidden />
            Supprimer
          </Button>
        </div>
      </header>

      {confirming ? (
        <ClientDeleteConfirmation
          clientName={client.name}
          pending={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => {
            setConfirming(false);
            setDeleteError(null);
          }}
        />
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Coordonnées" description="Contacts enregistrés" icon={Phone}>
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Téléphone principal" value={client.phone1} />
            <DetailItem label="Téléphone secondaire" value={client.phone2} />
            <DetailItem label="Email" value={client.email} />
          </DetailList>
        </SectionCard>

        <SectionCard title="Informations" description="Suivi du dossier client" icon={CalendarDays}>
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Créé le" value={formatDateTime(client.createdAt)} />
            <DetailItem label="Dernière modification" value={formatDateTime(client.updatedAt)} />
          </DetailList>
        </SectionCard>
      </div>

      {client.notes ? (
        <SectionCard title="Notes" description="Remarques enregistrées" icon={FileText}>
          <p className="text-sm whitespace-pre-line break-words">{client.notes}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
