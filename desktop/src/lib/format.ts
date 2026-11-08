/**
 * Display formatting shared by every page.
 *
 * Amounts are formatted in Ariary (MGA) and dates in French, matching the
 * application language. Nothing here computes a business value: the helpers
 * only render numbers and dates the API already produced.
 */

/** Rendered instead of a missing value (never an empty cell). */
export const EMPTY_VALUE = "—";

const ARIARY_SUFFIX = "Ar";

const decimalFormatter = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** `150000` → `150 000 Ar`; missing value → `—`. */
export function formatAriary(value: number | null | undefined): string {
  if (isMissing(value)) {
    return EMPTY_VALUE;
  }
  return `${decimalFormatter.format(value)} ${ARIARY_SUFFIX}`;
}

/** `2` → `2`; `1.5` → `1,5`; missing value → `—`. */
export function formatDecimal(value: number | null | undefined): string {
  if (isMissing(value)) {
    return EMPTY_VALUE;
  }
  return decimalFormatter.format(value);
}

/** `12` → `12`; missing value → `—`. */
export function formatInteger(value: number | null | undefined): string {
  if (isMissing(value)) {
    return EMPTY_VALUE;
  }
  return integerFormatter.format(value);
}

/**
 * Parses a backend `LocalDate` (`YYYY-MM-DD`) as a *local* date. Using
 * `new Date("2026-11-08")` instead would parse it as UTC midnight and could
 * display the previous day depending on the machine time zone.
 */
function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-11-08` → `8 nov. 2026`; missing or invalid value → `—`. */
export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_VALUE;
  }
  const date = parseLocalDate(value);
  return date ? dateFormatter.format(date) : EMPTY_VALUE;
}

/** ISO instant (`2026-11-08T09:07:17Z`) → `8 nov. 2026, 12:07`. */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_VALUE;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? EMPTY_VALUE : dateTimeFormatter.format(date);
}

/** `14:30:00` → `14:30`; missing or invalid value → `—`. */
export function formatTime(value: string | null | undefined): string {
  if (!value) {
    return EMPTY_VALUE;
  }
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : EMPTY_VALUE;
}

/** Today's local date as `YYYY-MM-DD` (the backend compares local dates). */
export function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
