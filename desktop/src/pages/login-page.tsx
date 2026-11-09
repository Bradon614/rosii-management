import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Building2, LoaderCircle, LogIn } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const APP_VERSION = "0.1.0";

/**
 * Sign-in screen. The token returned by `POST /api/auth/login` is stored by the
 * auth provider and used by every subsequent request.
 */
export function LoginPage() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const requestedPath = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === "authenticated") {
    return <Navigate to={requestedPath} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(requestedPath, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.isUnauthorized) {
        setError("Email ou mot de passe incorrect.");
      } else if (cause instanceof ApiError && cause.isNetworkError) {
        setError(cause.message);
      } else {
        setError("Connexion impossible. Réessayez dans un instant.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-md">
          <Building2 className="size-6" aria-hidden />
        </span>
        <div>
          <p className="text-lg leading-tight font-semibold">ROSII Management</p>
          <p className="text-muted-foreground text-sm">Groupe Chez Rosii</p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Connexion</CardTitle>
          <CardDescription>
            Connectez-vous avec le compte de la patronne pour accéder aux dossiers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === "loading" ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={handleSubmit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertTitle>Connexion refusée</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <div className="grid gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="patronne@chezrosii.mg"
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              <Button type="submit" className="mt-1 w-full" disabled={submitting}>
                {submitting ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : (
                  <LogIn aria-hidden />
                )}
                {submitting ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">v{APP_VERSION}</p>
    </div>
  );
}
