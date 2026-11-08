import { CalendarClock } from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ExecutionStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import type { Execution } from "@/types/api";

/**
 * Execution of the service. Every field is optional in the DTO (a service may
 * be planned without time slot nor location), so each one disappears when it
 * has no value. A cancelled execution also shows its cancellation date/reason.
 */
export function ExecutionSection({ execution }: { execution: Execution | null }) {
  return (
    <SectionCard
      title="Exécution"
      description="Déroulement de la prestation"
      icon={CalendarClock}
      action={execution ? <ExecutionStatusBadge status={execution.status} /> : null}
    >
      {execution === null ? (
        <EmptyState
          icon={CalendarClock}
          title="Aucune exécution"
          description="Aucune exécution n'est planifiée : elle est créée après la préparation de la prestation."
        />
      ) : (
        <DetailList className="sm:grid-cols-1">
          <DetailItem
            label="Date prévue"
            value={execution.scheduledDate ? formatDate(execution.scheduledDate) : null}
          />
          <DetailItem
            label="Horaires"
            value={
              execution.startTime || execution.endTime
                ? `${formatTime(execution.startTime)} – ${formatTime(execution.endTime)}`
                : null
            }
          />
          <DetailItem label="Localisation" value={execution.location} />
          <DetailItem
            label="Débutée le"
            value={execution.startedAt ? formatDateTime(execution.startedAt) : null}
          />
          <DetailItem
            label="Terminée le"
            value={execution.completedAt ? formatDateTime(execution.completedAt) : null}
          />
          <DetailItem
            label="Annulée le"
            value={execution.cancelledAt ? formatDateTime(execution.cancelledAt) : null}
          />
          <DetailNote label="Motif d'annulation" value={execution.cancellationReason} />
          <DetailNote label="Notes" value={execution.notes} />
        </DetailList>
      )}
    </SectionCard>
  );
}
