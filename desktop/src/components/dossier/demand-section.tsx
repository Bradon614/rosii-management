import { ClipboardList } from "lucide-react";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { DemandStatusBadge } from "@/components/status-badge";
import { formatDate, formatInteger } from "@/lib/format";
import { demandTypeLabels } from "@/lib/labels";
import type { Demand } from "@/types/api";

/**
 * Original demand behind the proposal. Only fields that exist in the DTO are
 * shown, and each optional field disappears when it has no value.
 */
export function DemandSection({ demand }: { demand: Demand }) {
  return (
    <SectionCard
      title="Demande d'origine"
      description="Ce que le client avait demandé au départ"
      icon={ClipboardList}
      action={<DemandStatusBadge status={demand.status} />}
    >
      <DetailList>
        <DetailItem label="Type de demande" value={demandTypeLabels[demand.type]} />
        <DetailItem
          label="Date demandée"
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
        {demand.eventDetails?.theme ? (
          <DetailItem label="Thème" value={demand.eventDetails.theme} />
        ) : null}
        <DetailNote label="Notes" value={demand.notes} />
      </DetailList>
    </SectionCard>
  );
}
