import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Pencil,
  RefreshCw,
  Trash2,
  User,
  Wallet,
} from "lucide-react";

import { DemandDeleteConfirmation } from "@/components/demands/demand-delete-confirmation";
import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { DemandStatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { formatTriState } from "@/lib/demand-display";
import {
  demandErrorMessage,
  demandsApi,
  demandToUpdatePayload,
} from "@/lib/demands-api";
import { formatAriary, formatDate, formatDateTime, formatInteger } from "@/lib/format";
import { budgetTypeLabels, demandStatusLabels, demandTypeLabels } from "@/lib/labels";
import type { Demand, DemandStatus } from "@/types/api";

const DEMAND_STATUSES = Object.keys(demandStatusLabels) as DemandStatus[];

function DemandDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-8 w-72" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

/**
 * Demand detail (Feature 20). Read-only record plus the two permitted actions:
 * edit, and a manual status correction — which is a normal update carrying the
 * current version, never an automatic business action.
 */
export function DemandDetailPage() {
  const { demandId } = useParams<{ demandId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const routeFlash = (location.state as { flash?: string } | null)?.flash ?? null;

  const { data, error, loading, reload } = useApiQuery<Demand>(
    demandId ? `/api/demands/${demandId}` : null,
  );

  const [flash, setFlash] = useState<string | null>(routeFlash);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [pendingStatus, setPendingStatus] = useState<DemandStatus | null>(null);
  const [confirmingStatus, setConfirmingStatus] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusFlash, setStatusFlash] = useState<string | null>(null);

  async function handleDelete() {
    if (!data) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await demandsApi.remove(data.id);
      navigate("/demandes", {
        state: { flash: `La demande de « ${data.clientName} » a été supprimée.` },
      });
    } catch (cause) {
      setDeleteError(demandErrorMessage(cause));
    } finally {
      setDeleting(false);
    }
  }

  async function applyStatus() {
    if (!data || !pendingStatus) {
      return;
    }
    setStatusSaving(true);
    setStatusError(null);
    try {
      const updated = await demandsApi.update(
        data.id,
        demandToUpdatePayload(data, { status: pendingStatus }),
      );
      setStatusFlash(`Le statut est maintenant « ${demandStatusLabels[updated.status]} ».`);
      setPendingStatus(null);
      setConfirmingStatus(false);
      setFlash(null);
      reload();
    } catch (cause) {
      setStatusError(demandErrorMessage(cause));
    } finally {
      setStatusSaving(false);
    }
  }

  if (!demandId) {
    return (
      <ErrorState
        title="Demande introuvable"
        description="Aucun identifiant de demande n'a été fourni."
        action={
          <Button asChild variant="outline">
            <Link to="/demandes">Retour aux demandes</Link>
          </Button>
        }
      />
    );
  }

  if (loading && !data) {
    return <DemandDetailSkeleton />;
  }

  if (error) {
    const notFound = error.isNotFound;
    return (
      <ErrorState
        title={notFound ? "Demande introuvable" : "Chargement impossible"}
        description={
          notFound ? "Cette demande n'existe pas ou a été supprimée." : demandErrorMessage(error)
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
              <Link to="/demandes">Retour aux demandes</Link>
            </Button>
          </>
        }
      />
    );
  }

  if (!data) {
    return null;
  }

  const demand = data;
  const eventDetails = demand.eventDetails;
  const statusChanged = pendingStatus !== null && pendingStatus !== demand.status;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/demandes"
          className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Retour aux demandes
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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              {demandTypeLabels[demand.type]} · {demand.clientName}
            </h1>
            <DemandStatusBadge status={demand.status} />
          </div>
          <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <CalendarDays className="size-4" aria-hidden />
            Créée le {formatDateTime(demand.createdAt)} · modifiée le{" "}
            {formatDateTime(demand.updatedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to={`/demandes/${demand.id}/edit`}>
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
        <DemandDeleteConfirmation
          clientName={demand.clientName}
          typeLabel={demandTypeLabels[demand.type]}
          requestedDate={demand.requestedDate ? formatDate(demand.requestedDate) : null}
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
        <SectionCard
          title="Client"
          description="Client à l'origine de la demande"
          icon={User}
          action={
            <Link
              to={`/clients/${demand.clientId}`}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              Fiche client
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          }
        >
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Nom" value={demand.clientName} />
          </DetailList>
        </SectionCard>

        <SectionCard title="Budget" description="Budget exprimé par le client" icon={Wallet}>
          <DetailList className="sm:grid-cols-1">
            <DetailItem label="Type de budget" value={budgetTypeLabels[demand.budgetType]} />
            {demand.budgetType === "EXACT" ? (
              <DetailItem
                label="Budget exact"
                value={formatAriary(demand.budgetMin ?? demand.budgetMax)}
              />
            ) : null}
            {demand.budgetType === "RANGE" ? (
              <>
                <DetailItem label="Budget minimum" value={formatAriary(demand.budgetMin)} />
                <DetailItem label="Budget maximum" value={formatAriary(demand.budgetMax)} />
              </>
            ) : null}
          </DetailList>
          {demand.budgetType === "NONE" ? (
            <p className="text-muted-foreground mt-3 text-sm">
              Aucun budget communiqué par le client.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="Demande"
        description="Informations enregistrées par la patronne"
        icon={ClipboardList}
      >
        <DetailList>
          <DetailItem label="Type de demande" value={demandTypeLabels[demand.type]} />
          <DetailItem label="Statut" value={demandStatusLabels[demand.status]} />
          <DetailItem
            label="Date souhaitée"
            value={demand.requestedDate ? formatDate(demand.requestedDate) : null}
          />
          <DetailItem
            label="Nombre de personnes"
            value={
              demand.estimatedPeople === null
                ? null
                : `${formatInteger(demand.estimatedPeople)} personnes`
            }
          />
          <DetailItem label="Localisation" value={demand.location} />
          <DetailNote label="Notes" value={demand.notes} />
        </DetailList>
      </SectionCard>

      {eventDetails ? (
        <SectionCard
          title="Informations événementielles"
          description="Précisions propres à un événement"
          icon={CalendarDays}
        >
          <DetailList>
            <DetailItem label="Type d'événement" value={eventDetails.eventType} />
            <DetailItem label="Salle" value={formatTriState(eventDetails.hallNeeded)} />
            <DetailItem label="Salle souhaitée" value={eventDetails.desiredHall} />
            <DetailItem label="Traiteur" value={formatTriState(eventDetails.cateringRequested)} />
            <DetailItem
              label="Décoration"
              value={formatTriState(eventDetails.decorationRequested)}
            />
            <DetailItem label="Fleuriste" value={formatTriState(eventDetails.floristRequested)} />
            <DetailItem
              label="Location de matériel"
              value={formatTriState(eventDetails.equipmentRentalRequested)}
            />
            <DetailItem label="Transport" value={formatTriState(eventDetails.transportRequested)} />
            <DetailItem label="Thème" value={eventDetails.theme} />
            <DetailNote label="Notes événementielles" value={eventDetails.notes} />
          </DetailList>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Statut"
        description="Correction manuelle du suivi commercial"
        icon={RefreshCw}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-full gap-1.5 sm:max-w-xs">
            <Label htmlFor="demand-status">Statut de la demande</Label>
            <Select
              id="demand-status"
              value={pendingStatus ?? demand.status}
              onChange={(event) => {
                setPendingStatus(event.target.value as DemandStatus);
                setConfirmingStatus(false);
                setStatusError(null);
                setStatusFlash(null);
              }}
            >
              {DEMAND_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {demandStatusLabels[status]}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => setConfirmingStatus(true)}
            disabled={!statusChanged || statusSaving}
          >
            Appliquer
          </Button>
        </div>

        <p className="text-muted-foreground mt-2 text-xs">
          Le statut est une correction manuelle : aucun changement ne crée de proposition, de
          réservation, de paiement ou de préparation.
        </p>

        {confirmingStatus && pendingStatus ? (
          <Alert className="mt-4">
            <AlertTitle>Confirmer le changement de statut ?</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>
                « {demandStatusLabels[demand.status]} » → « {demandStatusLabels[pendingStatus]} »
              </span>
              <Button type="button" size="sm" onClick={applyStatus} disabled={statusSaving}>
                {statusSaving ? "Enregistrement…" : "Confirmer"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setConfirmingStatus(false)}
                disabled={statusSaving}
              >
                Annuler
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {statusFlash ? (
          <Alert variant="success" className="mt-4">
            <CheckCircle2 aria-hidden />
            <AlertTitle>Statut mis à jour</AlertTitle>
            <AlertDescription>{statusFlash}</AlertDescription>
          </Alert>
        ) : null}

        {statusError ? (
          <Alert variant="destructive" className="mt-4">
            <AlertTitle>Changement impossible</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{statusError}</span>
              <Button type="button" size="sm" variant="outline" onClick={reload}>
                Recharger la demande
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
      </SectionCard>
    </div>
  );
}
