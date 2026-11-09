import { BadgeCheck } from "lucide-react";
import { Link } from "react-router-dom";

import { DetailItem, DetailList, DetailNote } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { ClosureStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import type { ServiceClosure } from "@/types/api";

/**
 * Official closure of the service — an independent act, created only after the
 * execution is COMPLETED. It is never inferred from the execution status: when
 * no closure exists, this section says so explicitly with its own empty state.
 */
export function ClosureSection({ closure }: { closure: ServiceClosure | null }) {
  return (
    <SectionCard
      title="Clôture"
      description="Fin officielle de la prestation"
      icon={BadgeCheck}
      action={
        closure ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ClosureStatusBadge status={closure.status} />
            <Link
              to={`/closures/${closure.id}`}
              className="text-muted-foreground hover:text-foreground text-sm hover:underline hover:underline-offset-4"
            >
              Ouvrir la clôture
            </Link>
          </div>
        ) : null
      }
    >
      {closure === null ? (
        <EmptyState
          icon={BadgeCheck}
          title="Aucune clôture enregistrée"
          description="La clôture est un acte distinct : elle n'est jamais déduite du statut de l'exécution."
        />
      ) : (
        <DetailList className="sm:grid-cols-1">
          <DetailItem
            label="Clôturée le"
            value={closure.closedAt ? formatDateTime(closure.closedAt) : null}
          />
          <DetailNote label="Notes finales" value={closure.finalNotes} />
        </DetailList>
      )}
    </SectionCard>
  );
}
