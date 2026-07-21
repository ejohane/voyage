import { describe, expect, it } from "vitest";
import { formatTripDuration, formatTripDurationDays } from "../src/lib/format-trip";

describe("trip duration formatting", () => {
  it("counts calendar days inclusively", () => {
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: "2026-09-22" })).toBe("11 days");
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: "2026-09-12" })).toBe("1 day");
  });

  it("keeps partially planned trips flexible", () => {
    expect(formatTripDuration({ startDate: null, endDate: null })).toBe("Flexible");
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: null })).toBe("Flexible");
  });

  it("uses an honest empty state when cards cannot show a day count", () => {
    expect(formatTripDurationDays({ startDate: null, endDate: null })).toBe("Days not set");
    expect(formatTripDurationDays({ startDate: "2026-09-12", endDate: "2026-09-22" })).toBe(
      "11 days",
    );
  });
});
