import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  buildClient,
  buildDemand,
  buildProposal,
  CLIENT_ID,
  DEMAND_ID,
} from "@/test/fixtures";
import { renderApp } from "@/test/render-app";
import type { MockHandler } from "@/test/mock-api";

const DEMAND = buildDemand({ clientId: CLIENT_ID, clientName: "Alice Rakoto" });
const CREATED = buildProposal({
  id: "99999999-9999-9999-9999-999999999999",
  number: "PROP-2026-0002",
  status: "DRAFT",
});

const SERVICES = [
  {
    id: "service-1",
    name: "Traiteur mariage",
    category: "CATERING",
    description: null,
    defaultUnit: "personne",
    referencePrice: 4500,
    active: true,
    createdAt: "2026-09-01T06:00:00Z",
    updatedAt: "2026-09-01T06:00:00Z",
    version: 0,
  },
];

function baseRoutes(extra: Record<string, MockHandler> = {}): Record<string, MockHandler> {
  return {
    "GET /api/demands": () => ({ body: [DEMAND] }),
    "GET /api/services": () => ({ body: SERVICES }),
    "POST /api/proposals": () => ({ status: 201, body: CREATED }),
    [`GET /api/proposals/${CREATED.id}`]: () => ({ body: CREATED }),
    [`GET /api/clients/${CLIENT_ID}`]: () => ({ body: buildClient() }),
    [`GET /api/demands/${DEMAND_ID}`]: () => ({ body: DEMAND }),
    ...extra,
  };
}

async function pickDemand(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("option", { name: /Alice Rakoto — Événement/ });
  await user.selectOptions(screen.getByLabelText(/^Demande/), DEMAND_ID);
}

async function fillFirstLine(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/^Description/), "Traiteur mariage");
  await user.type(screen.getByLabelText(/^Unité/), "personne");
  await user.clear(screen.getByLabelText(/^Quantité/));
  await user.type(screen.getByLabelText(/^Quantité/), "80");
  await user.type(screen.getByLabelText(/^Prix unitaire/), "4500");
}

describe("ProposalCreatePage — demande obligatoire", () => {
  it("blocks the creation without a demand", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions/new", baseRoutes());

    await user.click(await screen.findByRole("button", { name: "Créer la proposition" }));

    expect(screen.getByText("Sélectionnez une demande.")).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows the useful information of the selected demand", async () => {
    const user = userEvent.setup();
    renderApp("/propositions/new", baseRoutes());

    await pickDemand(user);

    expect(screen.getByText("Alice Rakoto")).toBeInTheDocument();
    expect(screen.getByText(/Type : Événement/)).toBeInTheDocument();
    expect(screen.getByText(/Date souhaitée : 12 déc\. 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Voir la demande/ })).toHaveAttribute(
      "href",
      `/demandes/${DEMAND_ID}`,
    );
  });
});

describe("ProposalCreatePage — lignes", () => {
  it("adds and removes lines", async () => {
    const user = userEvent.setup();
    renderApp("/propositions/new", baseRoutes());

    await screen.findByRole("heading", { name: "Nouvelle proposition" });
    expect(screen.getAllByLabelText(/^Description/)).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Ajouter une ligne" }));
    expect(screen.getAllByLabelText(/^Description/)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Supprimer la ligne 2" }));
    expect(screen.getAllByLabelText(/^Description/)).toHaveLength(1);
  });

  it("seeds the snapshot values from a catalogue service and keeps them editable", async () => {
    const user = userEvent.setup();
    renderApp("/propositions/new", baseRoutes());

    await screen.findByRole("option", { name: "Traiteur mariage" });
    await user.selectOptions(screen.getByLabelText(/^Service du catalogue/), "service-1");

    expect(screen.getByLabelText(/^Description/)).toHaveValue("Traiteur mariage");
    expect(screen.getByLabelText(/^Unité/)).toHaveValue("personne");
    expect(screen.getByLabelText(/^Prix unitaire/)).toHaveValue("4500");

    // Snapshot: the value can be adjusted after the selection.
    await user.clear(screen.getByLabelText(/^Prix unitaire/));
    await user.type(screen.getByLabelText(/^Prix unitaire/), "5000");
    expect(screen.getByLabelText(/^Prix unitaire/)).toHaveValue("5000");
  });

  it("computes an indicative line total and total", async () => {
    const user = userEvent.setup();
    renderApp("/propositions/new", baseRoutes());

    await fillFirstLine(user);

    expect(screen.getByTestId("line-total-0").textContent).toMatch(/360\s000\sAr/);
    expect(screen.getByTestId("proposal-estimate").textContent).toMatch(/360\s000\sAr/);
  });

  it("accepts a line without any catalogue service", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions/new", baseRoutes());

    await pickDemand(user);
    await fillFirstLine(user);
    await user.type(screen.getByLabelText(/^Dépôt demandé/), "100000");
    await user.click(screen.getByRole("button", { name: "Créer la proposition" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    const body = mock.calls.find((call) => call.method === "POST")?.body as {
      lines: Array<{ serviceId: string | null }>;
    };
    expect(body.lines[0].serviceId).toBeNull();
  });
});

describe("ProposalCreatePage — création", () => {
  it("posts the F07 payload and opens the created proposal", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions/new", baseRoutes());

    await pickDemand(user);
    await user.type(screen.getByLabelText("Titre"), "Mariage Rakoto");
    fireEvent.change(screen.getByLabelText("Date de validité"), {
      target: { value: "2026-12-31" },
    });
    await user.type(screen.getByLabelText("Notes"), "Devis initial");
    await fillFirstLine(user);
    await user.type(screen.getByLabelText(/^Dépôt demandé/), "100000");
    await user.click(screen.getByRole("button", { name: "Créer la proposition" }));

    await waitFor(() => expect(mock.calls.some((call) => call.method === "POST")).toBe(true));
    expect(mock.calls.find((call) => call.method === "POST")?.body).toEqual({
      clientId: CLIENT_ID,
      demandId: DEMAND_ID,
      title: "Mariage Rakoto",
      validUntil: "2026-12-31",
      requiredDeposit: 100000,
      notes: "Devis initial",
      lines: [
        {
          serviceId: null,
          description: "Traiteur mariage",
          unit: "personne",
          quantity: 80,
          unitPrice: 4500,
          notes: null,
        },
      ],
    });

    expect(
      await screen.findByRole("heading", { name: "Mariage Rakoto", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/La proposition PROP-2026-0002 a été créée/)).toBeInTheDocument();
  });

  it("refuses a deposit above the estimated total without calling the API", async () => {
    const user = userEvent.setup();
    const { mock } = renderApp("/propositions/new", baseRoutes());

    await pickDemand(user);
    await fillFirstLine(user);
    await user.type(screen.getByLabelText(/^Dépôt demandé/), "999999");
    await user.click(screen.getByRole("button", { name: "Créer la proposition" }));

    expect(screen.getByText(/ne peut pas dépasser le total de la proposition/)).toBeInTheDocument();
    expect(mock.calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("shows the backend refusal and stays on the form", async () => {
    const user = userEvent.setup();
    renderApp(
      "/propositions/new",
      baseRoutes({
        "POST /api/proposals": () => ({ status: 400, body: { error: "Bad Request" } }),
      }),
    );

    await pickDemand(user);
    await fillFirstLine(user);
    await user.type(screen.getByLabelText(/^Dépôt demandé/), "100000");
    await user.click(screen.getByRole("button", { name: "Créer la proposition" }));

    expect(
      await screen.findByText(
        "Certaines informations sont invalides. Vérifiez les champs puis réessayez.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Créer la proposition" })).toBeInTheDocument();
  });
});
