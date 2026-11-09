import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppLayout } from "@/components/layout/app-layout";
import { RequireAuth } from "@/components/layout/require-auth";
import { ClientCreatePage } from "@/pages/client-create-page";
import { ClientDetailPage } from "@/pages/client-detail-page";
import { ClientEditPage } from "@/pages/client-edit-page";
import { ClientsPage } from "@/pages/clients-page";
import { DemandCreatePage } from "@/pages/demand-create-page";
import { DemandDetailPage } from "@/pages/demand-detail-page";
import { DemandEditPage } from "@/pages/demand-edit-page";
import { DemandsPage } from "@/pages/demands-page";
import { ExecutionDetailPage } from "@/pages/execution-detail-page";
import { ExecutionEditPage } from "@/pages/execution-edit-page";
import { ExecutionsPage } from "@/pages/executions-page";
import { LoginPage } from "@/pages/login-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PaymentCreatePage } from "@/pages/payment-create-page";
import { PaymentDetailPage } from "@/pages/payment-detail-page";
import { PaymentsPage } from "@/pages/payments-page";
import { PreparationDetailPage } from "@/pages/preparation-detail-page";
import { ProposalCreatePage } from "@/pages/proposal-create-page";
import { ProposalDetailPage } from "@/pages/proposal-detail-page";
import { ProposalEditPage } from "@/pages/proposal-edit-page";
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
        <Route path="propositions/new" element={<ProposalCreatePage />} />
        <Route path="propositions/:proposalId" element={<ProposalDetailPage />} />
        <Route path="propositions/:proposalId/edit" element={<ProposalEditPage />} />
        <Route path="propositions/:proposalId/dossier" element={<ServiceDossierPage />} />
        <Route path="propositions/:proposalId/paiements/new" element={<PaymentCreatePage />} />
        <Route path="paiements" element={<PaymentsPage />} />
        <Route path="paiements/:paymentId" element={<PaymentDetailPage />} />
        <Route path="preparations/:preparationId" element={<PreparationDetailPage />} />
        <Route path="executions" element={<ExecutionsPage />} />
        <Route path="executions/:executionId" element={<ExecutionDetailPage />} />
        <Route path="executions/:executionId/edit" element={<ExecutionEditPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="clients/new" element={<ClientCreatePage />} />
        <Route path="clients/:clientId" element={<ClientDetailPage />} />
        <Route path="clients/:clientId/edit" element={<ClientEditPage />} />
        <Route path="demandes" element={<DemandsPage />} />
        <Route path="demandes/new" element={<DemandCreatePage />} />
        <Route path="demandes/:demandId" element={<DemandDetailPage />} />
        <Route path="demandes/:demandId/edit" element={<DemandEditPage />} />
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
