/**
 * Dashboard presentation (Feature 26, reworked by Feature 35).
 *
 * The indicators, the distributions and the bounded recent-activity timeline are
 * aggregated by the backend: the dashboard reads `GET /api/dashboard` once and
 * never downloads the five complete lists, and it never recomputes a count, a
 * sum or a status. Every value displayed comes from the response as-is.
 *
 * Only presentation concerns stay here: the display shape of an event, the
 * French wording, the navigation target, and the ordering of the timeline.
 */

import { formatAriary, formatDate } from "@/lib/format";
import { closureStatusLabels } from "@/lib/labels";
import type {
  DashboardActivityKind,
  DashboardActivityResponse,
} from "@/types/api";

/** The single endpoint the dashboard reads. */
export const DASHBOARD_PATH = "/api/dashboard";

/**
 * Number of events the timeline displays.
 *
 * The backend already bounds the list to this value, so the limit is not a
 * second aggregation: it only guarantees that the defensive re-ordering below
 * can never grow the list beyond what the dashboard has always shown.
 */
export const ACTIVITY_LIMIT = 8;

/** The display shape of one event of the timeline. */
export interface DashboardActivity {
  id: string;
  kind: DashboardActivityKind;
  title: string;
  /** Real reference: client name, proposal number, amount, date or status. */
  reference: string | null;
  /** ISO instant of the real event. */
  date: string;
  href: string;
}

/** Re-exported for the timeline component: the kind is the backend's contract. */
export type { DashboardActivityKind };

const ACTIVITY_TITLES: Record<DashboardActivityKind, string> = {
  demand_created: "Demande créée",
  proposal_created: "Proposition créée",
  proposal_accepted: "Proposition acceptée",
  payment_recorded: "Paiement enregistré",
  execution_completed: "Exécution terminée",
  closure_closed: "Service clôturé",
};

const ACTIVITY_PATHS: Record<DashboardActivityKind, string> = {
  demand_created: "/demandes",
  proposal_created: "/propositions",
  proposal_accepted: "/propositions",
  payment_recorded: "/paiements",
  execution_completed: "/executions",
  closure_closed: "/closures",
};

function shortId(id: string): string {
  return `${id.slice(0, 8)}...`;
}

/** The reference line of an event, built from the real values it carries. */
function referenceOf(event: DashboardActivityResponse): string | null {
  switch (event.kind) {
    case "demand_created":
      return event.clientName;
    case "proposal_created":
    case "proposal_accepted":
      return event.proposalNumber;
    case "payment_recorded":
      return `${event.proposalNumber} · ${formatAriary(event.amount)}`;
    case "execution_completed":
      return event.scheduledDate
        ? `Prestation du ${formatDate(event.scheduledDate)}`
        : `Exécution ${shortId(event.id)}`;
    case "closure_closed":
      return `${closureStatusLabels[event.closureStatus as Exclude<
        typeof event.closureStatus,
        null
      >]} · ${shortId(event.id)}`;
  }
}

function toActivity(event: DashboardActivityResponse): DashboardActivity {
  return {
    id: `${event.kind.replace(/_/g, "-")}-${event.id}`,
    kind: event.kind,
    title: ACTIVITY_TITLES[event.kind],
    reference: referenceOf(event),
    date: event.date,
    href: `${ACTIVITY_PATHS[event.kind]}/${event.id}`,
  };
}

/**
 * Newest first, ties broken by identifier ascending.
 *
 * @remarks This is the exact comparator the dashboard has always used, and the
 * backend applies the same one in SQL (date descending, then identifier
 * ascending under the `C` collation, then the historical insertion order of the
 * kinds). Re-applying it here is a presentation guard: the rendered order can
 * never change, whatever the database collation does.
 */
function compareActivities(a: DashboardActivity, b: DashboardActivity): number {
  const byDate = Date.parse(b.date) - Date.parse(a.date);
  return byDate !== 0 ? byDate : a.id.localeCompare(b.id);
}

/**
 * Turns the backend timeline into rows ready to render.
 *
 * Events whose real date is absent or unparseable are skipped rather than
 * displayed with an invented date.
 */
export function buildRecentActivity(
  events: readonly DashboardActivityResponse[],
): DashboardActivity[] {
  return events
    .filter((event) => !Number.isNaN(Date.parse(event.date)))
    .map(toActivity)
    .sort(compareActivities)
    .slice(0, ACTIVITY_LIMIT);
}
