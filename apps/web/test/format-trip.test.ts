import { describe, expect, it } from "vitest";
import { formatTripDuration } from "../src/lib/format-trip";

describe("trip duration formatting", () => {
  it("counts calendar days inclusively", () => {
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: "2026-09-22" })).toBe("11 days");
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: "2026-09-12" })).toBe("1 day");
  });

  it("keeps partially planned trips flexible", () => {
    expect(formatTripDuration({ startDate: null, endDate: null })).toBe("Flexible");
    expect(formatTripDuration({ startDate: "2026-09-12", endDate: null })).toBe("Flexible");
  });
});
