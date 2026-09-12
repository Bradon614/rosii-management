import { Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const APP_VERSION = "0.1.0";

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="size-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">ROSII Management</h1>
              <p className="text-sm text-muted-foreground">Group Chez Rosii</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <section className="rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
          <h2 className="text-2xl font-semibold tracking-tight">Welcome</h2>
          <p className="mt-2 max-w-prose text-muted-foreground">
            This is the application shell of ROSII Management. Business features
            (clients, demands, projects, payments, reservations and more) will be
            added in upcoming features.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Development build — the desktop window is served by Tauri with a Vite
            front end.
          </p>
          <div className="mt-6">
            <Button variant="outline" onClick={() => console.info("Placeholder action")}>
              Placeholder action
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto w-full max-w-5xl px-6 py-4 text-sm text-muted-foreground">
          ROSII Management — v{APP_VERSION} · offline-first desktop application
        </div>
      </footer>
    </div>
  );
}
