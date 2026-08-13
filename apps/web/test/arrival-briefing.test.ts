import type { Stay, Travel, Trip } from "@voyage/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildArrivalBriefing, resolveLegacyArrivalAirports } from "../worker/arrival-briefing";

const tripId = "11111111-1111-4111-8111-111111111111";
const stopId = "22222222-2222-4222-8222-222222222222";
const flightId = "33333333-3333-4333-8333-333333333333";
const rentalId = "44444444-4444-4444-8444-444444444444";
const stayId = "55555555-5555-4555-8555-555555555555";

const trip: Trip = {
  id: tripId,
  name: "Puglia in late summer",
  startDate: "2026-08-30",
  endDate: "2026-09-05",
  stops: [
    {
      id: stopId,
      name: "Ostuni, Italy",
      position: 0,
      arrivalDate: "2026-08-31",
      departureDate: "2026-09-05",
      location: { provider: "google", placeId: "place-ostuni" },
    },
  ],
  accessLevel: "owner",
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const flight: Travel = {
  id: flightId,
  tripId,
  kind: "journey",
  type: "flight",
  status: "booked",
  departureStopId: null,
  arrivalStopId: stopId,
  departureAirportId: 1,
  arrivalAirportId: 2,
  departureAirport: {
    id: 1,
    ident: "KORD",
    iataCode: "ORD",
    icaoCode: "KORD",
    type: "large_airport",
    name: "Chicago O'Hare International Airport",
    municipality: "Chicago",
    isoCountry: "US",
    isoRegion: "US-IL",
    latitude: 41.9786,
    longitude: -87.9048,
  },
  arrivalAirport: {
    id: 2,
    ident: "LIBD",
    iataCode: "BRI",
    icaoCode: "LIBD",
    type: "large_airport",
    name: "Bari Karol Wojtyła Airport",
    municipality: "Bari",
    isoCountry: "IT",
    isoRegion: "IT-75",
    latitude: 41.1389,
    longitude: 16.7606,
  },
  departureLocation: "Chicago (ORD)",
  arrivalLocation: "Bari (BRI)",
  departureAt: "2026-08-30T15:35",
  arrivalAt: "2026-08-31T12:15",
  carrier: "United Airlines",
  referenceNumber: "UA 123",
  vehicleDescription: null,
  confirmationNumber: "FLIGHT123",
  bookingUrl: null,
  notes: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

const rental: Travel = {
  ...flight,
  id: rentalId,
  kind: "rental",
  type: "car",
  departureStopId: stopId,
  arrivalStopId: stopId,
  departureAirportId: null,
  arrivalAirportId: null,
  departureAirport: null,
  arrivalAirport: null,
  departureLocation: "Bari Airport",
  arrivalLocation: "Bari Airport",
  departureAt: "2026-08-31T13:00",
  arrivalAt: "2026-09-05T10:00",
  carrier: "Sicily by Car",
  referenceNumber: null,
  confirmationNumber: "788673098",
};

const stay: Stay = {
  id: stayId,
  tripId,
  status: "booked",
  tripStopId: stopId,
  propertyName: "Dama Bianca Boutique Hotel",
  address: "Via Nicolò Tommaseo 18, Ostuni, Italy",
  checkInDate: "2026-08-31",
  checkOutDate: "2026-09-05",
  confirmationNumber: "HOTEL123",
  bookingUrl: null,
  notes: null,
  propertyRef: { provider: "google", placeId: "place-dama-bianca" },
  bookingDetails: {
    checkInWindow: "3:00 PM – 10:00 PM",
    checkOutWindow: "By 10:00 AM",
    roomType: null,
    guestSummary: null,
    mealPlan: "Breakfast included",
    cancellationSummary: null,
    cancellationDeadline: null,
    totalPriceText: null,
    amenities: ["breakfast"],
  },
  createdAt: "2026-08-01T12:00:00.000Z",
  updatedAt: "2026-08-01T12:00:00.000Z",
};

describe("Arrival Briefing", () => {
  it("resolves a strict legacy arrival label through the airport catalog", async () => {
    const legacyFlight = {
      ...flight,
      arrivalAirportId: null,
      arrivalAirport: null,
      arrivalLocation: "BRI · Bari",
    };
    const resolver = vi.fn(async (iataCode: string) =>
      iataCode === "BRI" ? flight.arrivalAirport : null,
    );

    const resolved = await resolveLegacyArrivalAirports([legacyFlight, rental], resolver);
    const result = await buildArrivalBriefing({
      trip,
      travel: resolved,
      stays: [stay],
    });

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith("BRI");
    expect(resolved[0]).toMatchObject({ arrivalAirportId: 2, arrivalAirport: { iataCode: "BRI" } });
    expect(result.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "rental_pickup",
      "stay_arrival",
    ]);
  });

  it("does not resolve an unstructured location label", async () => {
    const resolver = vi.fn(async () => flight.arrivalAirport);
    const resolved = await resolveLegacyArrivalAirports(
      [{ ...flight, arrivalAirportId: null, arrivalAirport: null, arrivalLocation: "Bari" }],
      resolver,
    );

    expect(resolver).not.toHaveBeenCalled();
    expect(resolved[0].arrivalAirport).toBeNull();
  });

  it("connects booked arrival anchors for native route enrichment", async () => {
    const result = await buildArrivalBriefing({
      trip,
      travel: [flight, rental],
      stays: [stay],
    });

    expect(result.issues).toEqual([]);
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "rental_pickup",
      "stay_arrival",
    ]);
    expect(result.sections[0].items[0]).toMatchObject({
      airport: {
        iataCode: "BRI",
        latitude: 41.1389,
        longitude: 16.7606,
      },
    });
  });

  it("connects the airport directly to the stay when no rental exists", async () => {
    const result = await buildArrivalBriefing({
      trip,
      travel: [flight],
      stays: [stay],
    });

    expect(result.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "stay_arrival",
    ]);
  });

  it("does not invent a destination when the first stay is ambiguous", async () => {
    const otherStay = { ...stay, id: "66666666-6666-4666-8666-666666666666" };
    const result = await buildArrivalBriefing({
      trip,
      travel: [flight],
      stays: [stay, otherStay],
    });

    expect(result.sections[0].items.map((item) => item.kind)).toEqual(["flight_arrival"]);
    expect(result.sections[0].issues.map((item) => item.code)).toEqual(["ambiguous_stay"]);
  });

  it("marks an unresolved stay location for native routing", async () => {
    const unresolvedStay = { ...stay, propertyRef: null, address: "TBD" };
    const result = await buildArrivalBriefing({
      trip,
      travel: [flight],
      stays: [unresolvedStay],
    });

    expect(result.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "stay_arrival",
    ]);
    expect(result.sections[0].issues.map((item) => item.code)).toEqual([
      "stay_location_unresolved",
    ]);
  });

  it("omits the briefing when no authoritative arriving flight exists", async () => {
    const result = await buildArrivalBriefing({
      trip,
      travel: [{ ...flight, status: "planning" }],
      stays: [stay],
    });

    expect(result).toEqual({ sections: [], issues: [] });
  });
});
