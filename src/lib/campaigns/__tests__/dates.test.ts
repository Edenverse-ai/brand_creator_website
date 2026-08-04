import { describe, it, expect } from "vitest";
import {
  isDateOnlyString,
  dateOnlyStringToUtcDate,
  formatDateOnly,
  isValidCalendarDateOnly,
} from "../dates";

describe("isDateOnlyString", () => {
  it("accepts a YYYY-MM-DD string", () => {
    expect(isDateOnlyString("2026-12-31")).toBe(true);
  });

  it("rejects a full ISO datetime string", () => {
    expect(isDateOnlyString("2026-12-31T00:00:00.000Z")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isDateOnlyString(null)).toBe(false);
    expect(isDateOnlyString(undefined)).toBe(false);
    expect(isDateOnlyString(12345)).toBe(false);
  });
});

describe("dateOnlyStringToUtcDate (write boundary)", () => {
  it("converts a date-only string into a UTC-midnight Date", () => {
    const result = dateOnlyStringToUtcDate("2026-12-31");
    expect(result).toEqual(new Date("2026-12-31T00:00:00.000Z"));
    expect(result.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("formatDateOnly (read boundary)", () => {
  it("formats a Date back to YYYY-MM-DD using UTC getters", () => {
    expect(formatDateOnly(new Date("2026-12-31T00:00:00.000Z"))).toBe("2026-12-31");
  });

  it("does not shift the day for a Date with a non-midnight UTC time", () => {
    // Prisma always returns midnight UTC for a @db.Date column, but this guards the
    // slice(0, 10) approach against any non-midnight input too.
    expect(formatDateOnly(new Date("2026-01-01T23:59:59.000Z"))).toBe("2026-01-01");
  });

  it("returns null for null or undefined", () => {
    expect(formatDateOnly(null)).toBeNull();
    expect(formatDateOnly(undefined)).toBeNull();
  });

  it("round-trips write -> read back to the original string", () => {
    const original = "2026-08-04";
    const written = dateOnlyStringToUtcDate(original);
    expect(formatDateOnly(written)).toBe(original);
  });
});

describe("isValidCalendarDateOnly (mirrors Python's strptime success/failure)", () => {
  it("accepts a real calendar date", () => {
    expect(isValidCalendarDateOnly("2026-01-15")).toBe(true);
    expect(isValidCalendarDateOnly("2026-12-31")).toBe(true);
  });

  it("accepts a leap-day date in a leap year", () => {
    expect(isValidCalendarDateOnly("2028-02-29")).toBe(true);
  });

  it("rejects a leap-day date in a non-leap year (strptime would raise ValueError)", () => {
    expect(isValidCalendarDateOnly("2026-02-29")).toBe(false);
  });

  it("rejects a calendar-invalid day-of-month (Feb 30 does not exist)", () => {
    expect(isValidCalendarDateOnly("2026-02-30")).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isValidCalendarDateOnly("2026-13-01")).toBe(false);
  });

  it("rejects a non-date-shaped string", () => {
    expect(isValidCalendarDateOnly("notadate")).toBe(false);
    expect(isValidCalendarDateOnly("")).toBe(false);
  });

  it("rejects a full ISO datetime string (not the bare YYYY-MM-DD shape strptime('%Y-%m-%d') expects)", () => {
    expect(isValidCalendarDateOnly("2026-12-31T00:00:00.000Z")).toBe(false);
  });
});
