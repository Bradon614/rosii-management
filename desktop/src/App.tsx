import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/components/layout/require-auth";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { ProposalDetailPage } from "@/pages/proposal-detail-page";
import { ProposalsPage } from "@/pages/proposals-page";
import { ServiceDossierPage } from "@/pages/service-dossier-page";

/**
 * Route table of the application. Exported separately from the router so tests
 * can render it inside a MemoryRouter.
 *
 * Routes are hash-based: the desktop bundle is loaded from `tauri://localhost`,
 * where a deep browser link has no server to fall back on, so `#/...` is the
 * only form that survives a reload inside the Tauri window.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/propositions" replace />} />
        <Route path="propositions" element={<ProposalsPage />} />
        <Route path="propositions/:proposalId" element={<ProposalDetailPage />} />
        <Route path="propositions/:proposalId/dossier" element={<ServiceDossierPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
