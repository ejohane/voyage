import type { TripStop } from "@voyage/contracts";
import { describe, expect, it } from "vitest";
import {
  destinationNamesForDate,
  initialStopIdForDate,
  itineraryDates,
} from "../src/lib/itinerary-timeline";

const stops = [
  {
    id: "rome",
    name: "Rome",
    arrivalDate: "2026-09-12",
    departureDate: "2026-09-14",
  },
  {
    id: "florence",
    name: "Florence",
    arrivalDate: "2026-09-14",
    departureDate: "2026-09-16",
  },
] as TripStop[];

describe("itinerary timeline", () => {
  it("includes every trip day so empty days remain available for planning", () => {
    expect(
      itineraryDates({ startDate: "2026-09-12", endDate: "2026-09-16", stops }, [
        "2026-09-11",
        "2026-09-14",
      ]),
    ).toEqual(["2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16"]);
  });

  it("shows destinations that overlap a day and picks the first for quick-add", () => {
    expect(destinationNamesForDate(stops, "2026-09-14")).toEqual(["Rome", "Florence"]);
    expect(initialStopIdForDate(stops, "2026-09-15")).toBe("florence");
  });
});
