import { Info } from "lucide-react";

import { AccountSettingsCard } from "@/components/settings/account-settings-card";
import { SecuritySettingsCard } from "@/components/settings/security-settings-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { useAuth } from "@/lib/auth";

/**
 * Application settings (Feature 27).
 *
 * The current backend exposes only the authenticated account identity
 * (`GET /api/auth/me`) and client-side logout. There is no profile update, no
 * company-information endpoint and no persisted preference, so this page stays
 * read-only and never renders a fake form. Future editable settings require an
 * explicit backend evolution.
 */
export function SettingsPage() {
  const { user, logout } = useAuth();

  if (!user) {
    return (
      <ErrorState
        title="Compte indisponible"
        description="Les informations du compte authentifié n'ont pas pu être chargées."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={logout}
            aria-label="Se déconnecter de la session"
          >
            Se déconnecter de la session
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-muted-foreground text-sm">Groupe Chez Rosii</p>
        <h1 className="text-2xl font-semibold tracking-tight">Paramètres</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Compte et session de la patronne.
        </p>
      </header>

      <Alert>
        <Info aria-hidden />
        <AlertTitle>Paramètres réellement pris en charge</AlertTitle>
        <AlertDescription>
          Cette version présente uniquement les informations de compte et de session
          exposées par l&apos;API. Les informations d&apos;entreprise, la modification du
          profil, du mot de passe ou de l&apos;adresse e-mail et les préférences
          d&apos;affichage ne sont pas gérées par le backend.
        </AlertDescription>
      </Alert>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AccountSettingsCard user={user} />
        <SecuritySettingsCard onLogout={logout} />
      </div>
    </div>
  );
}
