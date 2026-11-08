import { ClipboardCheck } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { Preparation } from "@/types/api";

/**
 * Preparation of the service. The DTO only exposes the link to its proposal and
 * its audit dates — no status, task or planning exists in the business rules —
 * so only those fields are displayed.
 */
export function PreparationSection({ preparation }: { preparation: Preparation | null }) {
  return (
    <SectionCard
      title="Préparation"
      description="Ouverture opérationnelle de la prestation"
      icon={ClipboardCheck}
    >
      {preparation === null ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Aucune préparation"
          description="La préparation n'est pas encore ouverte : elle démarre une fois le dépôt demandé atteint."
        />
      ) : (
        <DetailList className="sm:grid-cols-1">
          <DetailItem
            label="Préparation ouverte le"
            value={formatDateTime(preparation.createdAt)}
          />
          <DetailItem
            label="Dernière mise à jour"
            value={formatDateTime(preparation.updatedAt)}
          />
        </DetailList>
      )}
    </SectionCard>
  );
}
