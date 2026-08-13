import { env } from "cloudflare:test";
import {
  type StayResponse,
  stayEndpoint,
  type TravelResponse,
  type TripResponse,
  tripStaysEndpoint,
  tripsEndpoint,
  tripTravelEndpoint,
  v1TripBriefingEndpoint,
  v1TripBriefingResponseSchema,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";

const now = new Date("2026-08-10T12:00:00.000Z");

const app = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  now: () => now,
});

async function request(
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
  target = app,
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return target.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createArrivalTrip() {
  const tripResponse = await request(tripsEndpoint, "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Puglia in late summer",
      stops: [
        {
          name: "Ostuni, Italy",
          arrivalDate: "2026-08-31",
          departureDate: "2026-09-05",
        },
      ],
    }),
  });
  const trip = (await tripResponse.json<TripResponse>()).trip;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO airports (
        id, ident, iata_code, icao_code, type, name, municipality,
        iso_country, iso_region, latitude, longitude, keywords, search_text
      ) VALUES (1, 'KORD', 'ORD', 'KORD', 'large_airport', 'Chicago O Hare International Airport',
        'Chicago', 'US', 'US-IL', 41.9786, -87.9048, '', 'ord chicago')`,
    ),
    env.DB.prepare(
      `INSERT INTO airports (
        id, ident, iata_code, icao_code, type, name, municipality,
        iso_country, iso_region, latitude, longitude, keywords, search_text
      ) VALUES (2, 'LIBD', 'BRI', 'LIBD', 'large_airport', 'Bari Karol Wojtyla Airport',
        'Bari', 'IT', 'IT-75', 41.1389, 16.7606, '', 'bri bari')`,
    ),
  ]);

  const flightResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "journey",
      type: "flight",
      status: "booked",
      departureStopId: null,
      arrivalStopId: trip.stops[0].id,
      departureAirportId: 1,
      arrivalAirportId: 2,
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
    }),
  });
  expect(flightResponse.status).toBe(201);
  const flight = (await flightResponse.json<TravelResponse>()).travel;

  const rentalResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "rental",
      type: "car",
      status: "booked",
      departureStopId: trip.stops[0].id,
      arrivalStopId: trip.stops[0].id,
      departureAirportId: null,
      arrivalAirportId: null,
      departureLocation: "Bari Airport",
      arrivalLocation: "Bari Airport",
      departureAt: "2026-08-31T13:00",
      arrivalAt: "2026-09-05T10:00",
      carrier: "Sicily by Car",
      referenceNumber: null,
      vehicleDescription: "Compact automatic",
      confirmationNumber: "788673098",
      bookingUrl: null,
      notes: null,
    }),
  });
  expect(rentalResponse.status).toBe(201);
  const rental = (await rentalResponse.json<TravelResponse>()).travel;

  const stayResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "booked",
      tripStopId: trip.stops[0].id,
      propertyName: "Dama Bianca Boutique Hotel",
      address: "Via Nicolo Tommaseo 18, Ostuni, Italy",
      checkInDate: "2026-08-31",
      checkOutDate: "2026-09-05",
      confirmationNumber: "HOTEL123",
      bookingUrl: null,
      notes: null,
      propertyRef: { provider: "google", placeId: "place-dama-bianca" },
      bookingDetails: {
        checkInWindow: "3:00 PM - 10:00 PM",
        checkOutWindow: "By 10:00 AM",
        roomType: null,
        guestSummary: null,
        mealPlan: "Breakfast included",
        cancellationSummary: null,
        cancellationDeadline: null,
        totalPriceText: null,
        amenities: ["breakfast"],
      },
    }),
  });
  expect(stayResponse.status).toBe(201);
  const stay = (await stayResponse.json<StayResponse>()).stay;

  return { trip, flight, rental, stay };
}

describe("Arrival Briefing API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_idempotency_records"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM airports"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("returns a membership-scoped structured arrival chain and regenerates after source changes", async () => {
    const { trip, flight, rental, stay } = await createArrivalTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_viewer', 'viewer', ?)",
    )
      .bind(trip.id, now.toISOString())
      .run();

    const first = await request(v1TripBriefingEndpoint(trip.id), "user_owner");
    const firstBody = v1TripBriefingResponseSchema.parse(await first.json());
    const viewer = await request(v1TripBriefingEndpoint(trip.id), "user_viewer");
    const hidden = await request(v1TripBriefingEndpoint(trip.id), "user_other");
    const update = await request(stayEndpoint(trip.id, stay.id), "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "Via Nicolo Tommaseo 20, Ostuni, Italy" }),
    });
    const refreshed = await request(v1TripBriefingEndpoint(trip.id), "user_owner");
    const refreshedBody = v1TripBriefingResponseSchema.parse(await refreshed.json());

    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    expect(firstBody.generatedAt).toBe(now.toISOString());
    expect(firstBody.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(firstBody.generatorVersion).toBe("arrival-v1");
    expect(firstBody.inputFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(firstBody.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "rental_pickup",
      "stay_arrival",
    ]);
    expect(firstBody.sections[0].items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceTravelId: flight.id }),
        expect.objectContaining({ sourceTravelId: rental.id }),
        expect.objectContaining({ sourceStayId: stay.id }),
      ]),
    );
    expect(viewer.status).toBe(200);
    expect(hidden.status).toBe(404);
    expect(update.status).toBe(200);
    expect(refreshedBody.revision).not.toBe(firstBody.revision);
    expect(refreshedBody.inputFingerprint).not.toBe(firstBody.inputFingerprint);
  });

  it("returns booked anchors without invoking an external route provider", async () => {
    const { trip } = await createArrivalTrip();
    const response = await request(v1TripBriefingEndpoint(trip.id), "user_owner");
    const body = v1TripBriefingResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "rental_pickup",
      "stay_arrival",
    ]);
    expect(body.sections[0].issues).toEqual([]);
  });

  it("resolves legacy flight labels against the airport catalog", async () => {
    const { trip, flight } = await createArrivalTrip();
    await env.DB.prepare(
      "UPDATE travel_segments SET arrival_airport_id = NULL, arrival_location = 'BRI · Bari', arrival_stop_id = NULL WHERE id = ?",
    )
      .bind(flight.id)
      .run();

    const response = await request(v1TripBriefingEndpoint(trip.id), "user_owner");
    const body = v1TripBriefingResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.sections[0].items.map((item) => item.kind)).toEqual([
      "flight_arrival",
      "rental_pickup",
      "stay_arrival",
    ]);
    expect(body.sections[0].items[0]).toMatchObject({
      kind: "flight_arrival",
      airport: {
        iataCode: "BRI",
        latitude: 41.1389,
        longitude: 16.7606,
      },
    });
  });
});
