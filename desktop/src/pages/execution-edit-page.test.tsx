import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { formatDate } from "@/lib/format";
import {
  buildExecution,
  buildPreparation,
  buildProposal,
  EXECUTION_ID,
  PREPARATION_ID,
  PROPOSAL_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";
import type { Execution } from "@/types/api";

const PATH = `/executions/${EXECUTION_ID}/edit`;
const EXECUTION_PATH = `/api/executions/${EXECUTION_ID}`;
const PREPARATION_PATH = `/api/preparations/${PREPARATION_ID}`;
const PROPOSAL_PATH = `/api/proposals/${PROPOSAL_ID}`;
const CLOSURES_PATH = `/api/closures?preparationId=${PREPARATION_ID}`;

function editRoutes(
  execution: Execution,
  extra: Record<string, MockHandler> = {},
): Record<string, MockHandler> {
  return {
    [`GET ${EXECUTION_PATH}`]: () => ({ body: execution }),
    [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
    [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
    [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
    ...extra,
  };
}

/** Routes required by the execution detail after a successful PUT. */
const DETAIL_ROUTES: Record<string, MockHandler> = {
  [`GET ${PREPARATION_PATH}`]: () => ({ body: buildPreparation() }),
  [`GET ${PROPOSAL_PATH}`]: () => ({ body: buildProposal() }),
  [`GET ${CLOSURES_PATH}`]: () => ({ body: [] }),
};

function plannedExecution(overrides: Partial<Execution> = {}): Execution {
  return buildExecution({
    status: "PLANNED",
    scheduledDate: "2026-12-12",
    startTime: "18:00:00",
    endTime: "23:30:00",
    location: "Salle des fêtes",
    notes: "Montage le matin",
    version: 1,
    ...overrides,
  });
}

async function openEdit(name = "Modifier l'exécution"): Promise<void> {
  await screen.findByRole("heading", { level: 1, name });
}

describe("ExecutionEditPage — PLANNED (F24)", () => {
  it("prefills the form and sends the exact full PUT payload", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(
      PATH,
      editRoutes(plannedExecution(), {
        [`PUT ${EXECUTION_PATH}`]: () => ({ body: plannedExecution({ version: 2 }) }),
        ...DETAIL_ROUTES,
      }),
    );

    await openEdit();

    const date = screen.getByLabelText(/Date programmée/);
    expect(date).toHaveValue("2026-12-12");
    expect(screen.getByLabelText("Heure de début")).toHaveValue("18:00");
    expect(screen.getByLabelText("Heure de fin")).toHaveValue("23:30");
    expect(screen.getByLabelText("Lieu")).toHaveValue("Salle des fêtes");
    expect(screen.getByLabelText("Notes")).toHaveValue("Montage le matin");

    await user.clear(screen.getByLabelText("Lieu"));
    await user.type(screen.getByLabelText("Lieu"), "Nouvelle salle");
    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Notes mises à jour");
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(EXECUTION_PATH);
    expect(put?.body).toEqual({
      version: 1,
      scheduledDate: "2026-12-12",
      startTime: "18:00",
      endTime: "23:30",
      location: "Nouvelle salle",
      notes: "Notes mises à jour",
    });

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: `Exécution du ${formatDate("2026-12-12")}`,
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Les informations de l'exécution ont été enregistrées."),
    ).toBeInTheDocument();
  });

  it("requires a scheduled date and never invents one", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, editRoutes(plannedExecution()));

    await openEdit();
    fireEvent.change(screen.getByLabelText(/Date programmée/), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText("La date programmée est obligatoire."),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("refuses an end time before the start time", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp(PATH, editRoutes(plannedExecution()));

    await openEdit();
    fireEvent.change(screen.getByLabelText("Heure de fin"), { target: { value: "08:00" } });
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText("L'heure de fin ne peut pas précéder l'heure de début."),
    ).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "PUT")).toBe(false);
  });

  it("reports a 409 and reloads the current version", async () => {
    const user = userEvent.setup();
    let reads = 0;
    let current = plannedExecution();
    renderApp(
      PATH,
      editRoutes(current, {
        [`GET ${EXECUTION_PATH}`]: () => {
          reads += 1;
          if (reads > 1) {
            current = plannedExecution({ version: 2, location: "Salle B" });
          }
          return { body: current };
        },
        [`PUT ${EXECUTION_PATH}`]: () => ({ status: 409, body: { error: "stale" } }),
      }),
    );

    await openEdit();
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText(/L'exécution a été modifiée entre-temps \(version obsolète\)/),
    ).toBeInTheDocument();
    const before = reads;
    await user.click(screen.getByRole("button", { name: "Recharger l'exécution" }));

    await waitFor(() => expect(reads).toBeGreaterThan(before));
    await waitFor(() => expect(screen.getByLabelText("Lieu")).toHaveValue("Salle B"));
    await waitFor(() =>
      expect(
        screen.queryByText(/L'exécution a été modifiée entre-temps \(version obsolète\)/),
      ).not.toBeInTheDocument(),
    );
  });

  it("reports a 400 without leaving the form", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      editRoutes(plannedExecution(), {
        [`PUT ${EXECUTION_PATH}`]: () => ({ status: 400, body: { error: "bad" } }),
      }),
    );

    await openEdit();
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText(
        "Les informations sont invalides : vérifiez la date programmée et les horaires.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Modifier l'exécution" })).toBeInTheDocument();
  });

  it("reports a 404", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      editRoutes(plannedExecution(), {
        [`PUT ${EXECUTION_PATH}`]: () => ({ status: 404, body: { error: "missing" } }),
      }),
    );

    await openEdit();
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(
      await screen.findByText("Cette exécution n'existe plus ou a été supprimée."),
    ).toBeInTheDocument();
  });

  it("reports a 403", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      editRoutes(plannedExecution(), {
        [`PUT ${EXECUTION_PATH}`]: () => ({ status: 403, body: { error: "forbidden" } }),
      }),
    );

    await openEdit();
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(await screen.findByText("Accès refusé.")).toBeInTheDocument();
  });

  it("ends the session on 401", async () => {
    const user = userEvent.setup();
    renderApp(
      PATH,
      editRoutes(plannedExecution(), {
        [`PUT ${EXECUTION_PATH}`]: () => ({ status: 401 }),
      }),
    );

    await openEdit();
    await user.click(screen.getByRole("button", { name: "Enregistrer les modifications" }));

    expect(await screen.findByRole("button", { name: /Se connecter/ })).toBeInTheDocument();
  });
});

describe("ExecutionEditPage — IN_PROGRESS (F24)", () => {
  it("only edits location and notes, and re-sends the locked schedule unchanged", async () => {
    const user = userEvent.setup();
    const execution = plannedExecution({ status: "IN_PROGRESS", version: 3 });
    const { mock } = renderApp(
      PATH,
      editRoutes(execution, {
        [`PUT ${EXECUTION_PATH}`]: () => ({
          body: { ...execution, location: "Salle B", notes: "Retard sonorisation" },
        }),
        ...DETAIL_ROUTES,
      }),
    );

    await openEdit("Corriger l'exécution");

    expect(screen.getByText("Date et horaires verrouillés")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Date programmée/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Heure de début")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Heure de fin")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Lieu"));
    await user.type(screen.getByLabelText("Lieu"), "Salle B");
    await user.clear(screen.getByLabelText("Notes"));
    await user.type(screen.getByLabelText("Notes"), "Retard sonorisation");
    await user.click(screen.getByRole("button", { name: "Enregistrer les corrections" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "PUT")).toBe(true));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.body).toEqual({
      version: 3,
      scheduledDate: "2026-12-12",
      startTime: "18:00",
      endTime: "23:30",
      location: "Salle B",
      notes: "Retard sonorisation",
    });
  });

  it("blocks the correction when no scheduled date exists", async () => {
    renderApp(
      PATH,
      editRoutes(plannedExecution({ status: "IN_PROGRESS", scheduledDate: null })),
    );

    expect(await screen.findByText("Modification impossible")).toBeInTheDocument();
    expect(screen.getByText(/Aucune date n'est inventée par l'interface/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enregistrer les corrections" }),
    ).not.toBeInTheDocument();
  });
});

describe("ExecutionEditPage — statuts terminaux (F24)", () => {
  it("refuses the modification of a COMPLETED execution", async () => {
    renderApp(PATH, editRoutes(plannedExecution({ status: "COMPLETED" })));

    expect(await screen.findByText("Modification impossible")).toBeInTheDocument();
    expect(screen.getByText(/Cette exécution est « Terminée »/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enregistrer les modifications" }),
    ).not.toBeInTheDocument();
  });

  it("refuses the modification of a CANCELLED execution", async () => {
    renderApp(PATH, editRoutes(plannedExecution({ status: "CANCELLED" })));

    expect(await screen.findByText("Modification impossible")).toBeInTheDocument();
    expect(screen.getByText(/Cette exécution est « Annulée »/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Enregistrer les modifications" }),
    ).not.toBeInTheDocument();
  });
});
