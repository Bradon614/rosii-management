/**
 * Decimal parsing shared by the money/quantity forms.
 *
 * Amounts are typed by hand (spaces as thousand separators, French comma), so
 * they are normalized then validated against the backend's numeric precision.
 */

export type ParsedDecimal =
  | { valid: true; value: number | null }
  | { valid: false; value: null };

/** Accepts spaces and a French decimal comma, then enforces numeric(14,x). */
export function parseDecimal(
  raw: string,
  integerDigits: number,
  fractionDigits: number,
): ParsedDecimal {
  const normalized = raw.replace(/[\s\u202f\u00a0]/g, "").replace(",", ".");
  if (normalized.length === 0) {
    return { valid: true, value: null };
  }
  const pattern = new RegExp(`^\\d{1,${integerDigits}}(\\.\\d{1,${fractionDigits}})?$`);
  if (!pattern.test(normalized)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Number(normalized) };
}

/** HALF_UP at 2 decimals, like the backend's line totals. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
