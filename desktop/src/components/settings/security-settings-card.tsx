import { Info, LogOut, ShieldCheck } from "lucide-react";

import { DetailItem, DetailList } from "@/components/dossier/detail-list";
import { SectionCard } from "@/components/dossier/section-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * Session block of the settings page. Logout is the only real security action
 * supported by the current API; password and e-mail changes have no backend
 * endpoint and are therefore never simulated with a form.
 */
export function SecuritySettingsCard({ onLogout }: { onLogout: () => void }) {
  return (
    <SectionCard
      title="Sécurité"
      description="Session et accès au compte"
      icon={ShieldCheck}
      action={<Badge variant="success">Session active</Badge>}
      className="h-full"
    >
      <DetailList className="sm:grid-cols-1">
        <DetailItem label="Authentification" value="Session JWT" />
        <DetailItem label="État de la session">
          <Badge variant="success">Active</Badge>
        </DetailItem>
      </DetailList>

      <Alert className="mt-4">
        <Info aria-hidden />
        <AlertTitle>Modification non disponible</AlertTitle>
        <AlertDescription>
          La modification du mot de passe et de l&apos;adresse e-mail n&apos;est pas prise
          en charge par l&apos;API actuelle. Aucun formulaire n&apos;est proposé pour éviter
          une fonctionnalité fictive.
        </AlertDescription>
      </Alert>

      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onLogout}
          aria-label="Se déconnecter de la session"
        >
          <LogOut aria-hidden />
          Se déconnecter de la session
        </Button>
      </div>
    </SectionCard>
  );
}
