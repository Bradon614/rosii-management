import { describe, expect, it } from "vitest";

import {
  EMPTY_VALUE,
  formatAriary,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatInteger,
  formatTime,
} from "@/lib/format";

import { normalizeSpaces } from "@/test/fixtures";

describe("formatAriary", () => {
  it("formats whole amounts in Ariary", () => {
    expect(normalizeSpaces(formatAriary(150000))).toBe("150 000 Ar");
    expect(normalizeSpaces(formatAriary(0))).toBe("0 Ar");
    expect(normalizeSpaces(formatAriary(500000))).toBe("500 000 Ar");
  });

  it("keeps at most two decimals and uses a French decimal separator", () => {
    expect(normalizeSpaces(formatAriary(1234.5))).toBe("1 234,5 Ar");
    expect(normalizeSpaces(formatAriary(150000.25))).toBe("150 000,25 Ar");
  });

  it("renders a dash for missing values instead of an empty cell", () => {
    expect(formatAriary(null)).toBe(EMPTY_VALUE);
    expect(formatAriary(undefined)).toBe(EMPTY_VALUE);
    expect(formatAriary(Number.NaN)).toBe(EMPTY_VALUE);
  });
});

describe("number formatting", () => {
  it("formats decimals and integers", () => {
    expect(formatDecimal(2)).toBe("2");
    expect(formatDecimal(1.5)).toBe("1,5");
    expect(formatInteger(120)).toBe("120");
    expect(formatDecimal(null)).toBe(EMPTY_VALUE);
    expect(formatInteger(null)).toBe(EMPTY_VALUE);
  });
});

describe("date formatting", () => {
  it("formats a LocalDate without shifting the day", () => {
    expect(formatDate("2026-11-08")).toBe("8 nov. 2026");
    expect(formatDate("2026-01-01")).toBe("1 janv. 2026");
  });

  it("renders a dash for missing or invalid dates", () => {
    expect(formatDate(null)).toBe(EMPTY_VALUE);
    expect(formatDate("")).toBe(EMPTY_VALUE);
    expect(formatDate("not-a-date")).toBe(EMPTY_VALUE);
  });

  it("formats an ISO instant with date and time", () => {
    const formatted = formatDateTime("2026-11-08T09:07:17Z");
    expect(formatted).toContain("2026");
    expect(formatted).toMatch(/\d{2}:\d{2}/);
    expect(formatDateTime(null)).toBe(EMPTY_VALUE);
    expect(formatDateTime("garbage")).toBe(EMPTY_VALUE);
  });

  it("formats times as HH:mm", () => {
    expect(formatTime("18:00:00")).toBe("18:00");
    expect(formatTime("23:30")).toBe("23:30");
    expect(formatTime(null)).toBe(EMPTY_VALUE);
    expect(formatTime("nope")).toBe(EMPTY_VALUE);
  });
});
