import { UserRound } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { Badge } from "@/components/ui/badge";
import type { AuthenticatedUser, Role } from "@/types/api";

const ROLE_LABELS: Record<Role, string> = {
  PATRONNE: "Patronne",
};

/**
 * Read-only identity exposed by `GET /api/auth/me`. The backend has no profile
 * update endpoint, so every field is displayed as-is and no form is rendered.
 */
export function AccountSettingsCard({ user }: { user: AuthenticatedUser }) {
  return (
    <SectionCard
      title="Mon profil"
      description="Informations du compte de la patronne"
      icon={UserRound}
      action={<Badge variant="outline">Lecture seule</Badge>}
      className="h-full"
    >
      <DetailList className="sm:grid-cols-1">
        <DetailItem label="Adresse e-mail" value={user.email} />
        <DetailItem label="Rôle">
          <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
        </DetailItem>
        <DetailItem label="Identifiant du compte">
          <span className="font-mono text-xs break-all">{user.id}</span>
        </DetailItem>
      </DetailList>
      <p className="text-muted-foreground mt-4 text-xs">
        Ces informations sont fournies par la session authentifiée. L&apos;API actuelle
        n&apos;expose aucune opération de modification du profil.
      </p>
    </SectionCard>
  );
}
