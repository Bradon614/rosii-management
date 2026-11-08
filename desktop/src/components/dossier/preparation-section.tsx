import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { Preparation } from "@/types/api";

/**
 * Preparation of the service. The DTO only exposes the link to its proposal and
 * its audit dates — no status, task or planning exists in the business rules —
 * so only those fields are displayed. Feature 23 adds the link to the
 * preparation detail, which reuses the same F09 DTO.
 */
export function PreparationSection({ preparation }: { preparation: Preparation | null }) {
  return (
    <SectionCard
      title="Préparation"
      description="Ouverture opérationnelle de la prestation"
      icon={ClipboardCheck}
      action={
        preparation ? (
          <Link
            to={`/preparations/${preparation.id}`}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
          >
            Ouvrir la préparation
          </Link>
        ) : null
      }
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
