import { env } from "cloudflare:test";
import {
  type PlanListResponse,
  type PlanResponse,
  type StayListResponse,
  type StayPropertyBackfillResponse,
  type StayResponse,
  stayPropertyBackfillEndpoint,
  stayPropertyEndpoint,
  stayPropertyPhotoEndpoint,
  type TravelListResponse,
  type TravelResponse,
  type TripResponse,
  tripPlansEndpoint,
  tripStaysEndpoint,
  tripsEndpoint,
  tripTravelEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";
import type { PlacesClient } from "../worker/google-places";

const placesClient: PlacesClient = {
  suggest: async () => [],
  resolve: async (placeId) => ({ provider: "google", placeId }),
  matchStay: async (propertyName) =>
    propertyName === "Memmo Alfama" ? { provider: "google", placeId: "place-memmo" } : null,
  getStayProperty: async (placeId) => ({
    provider: "google",
    placeId,
    displayName: "Memmo Alfama",
    formattedAddress: "Travessa das Merceeiras 27, Lisbon, Portugal",
    primaryType: "hotel",
    primaryTypeDisplayName: "Hotel",
    websiteUri: "https://memmoalfama.example/",
    nationalPhoneNumber: null,
    internationalPhoneNumber: "+351 210 495 660",
    rating: 4.7,
    userRatingCount: 420,
    googleMapsUri: "https://maps.google.com/?cid=memmo",
    hasPhoto: true,
    photo: {
      attributionDisplayName: "Memmo Alfama",
      attributionUri: "https://maps.google.com/author/memmo",
      googleMapsUri: "https://maps.google.com/photo/memmo",
    },
  }),
  renderStayPhoto: async () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "image/jpeg" } }),
};

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  placesClient,
});

async function request(
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return testApp.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip(userId = "user_owner") {
  const response = await request(tripsEndpoint, userId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Autumn in Lisbon",
      stops: [
        {
          name: "Lisbon, Portugal",
          arrivalDate: "2026-10-04",
          departureDate: "2026-10-12",
        },
      ],
    }),
  });
  return response.json<TripResponse>();
}

const travelInput = {
  kind: "journey",
  type: "flight",
  status: "planning",
  departureStopId: null,
  arrivalStopId: null,
  departureLocation: "ORD · Chicago",
  arrivalLocation: "LIS · Lisbon",
  departureAt: "2026-10-04T18:30",
  arrivalAt: "2026-10-05T08:10",
  carrier: "United Airlines",
  referenceNumber: "UA 942",
  vehicleDescription: null,
  confirmationNumber: "ABC123",
  bookingUrl: "https://example.com/booking",
  notes: "Overnight flight",
} as const;

const stayInput = {
  status: "planning",
  propertyName: "Memmo Alfama",
  address: "Travessa das Merceeiras 27, Lisbon",
  checkInDate: "2026-10-05",
  checkOutDate: "2026-10-12",
  confirmationNumber: "STAY123",
  bookingUrl: "https://example.com/stay",
  notes: "Late arrival",
  propertyRef: { provider: "google", placeId: "place-memmo" },
  bookingDetails: {
    checkInWindow: "15:00 – midnight",
    checkOutWindow: "By 11:00",
    roomType: "Deluxe double room",
    guestSummary: "2 adults",
    mealPlan: "Breakfast included",
    cancellationSummary: "Free cancellation until September 28",
    cancellationDeadline: "2026-09-28",
    totalPriceText: "EUR 1240.00",
    amenities: ["wifi", "breakfast"],
  },
} as const;

function planInput(tripStopId: string) {
  return {
    tripStopId,
    title: "Visit the MAAT",
    category: "sightseeing",
    status: "idea",
    scheduledDate: null,
    startTime: null,
    endTime: null,
    location: "Av. Brasília, Lisbon",
    confirmationNumber: null,
    bookingUrl: "https://example.com/maat",
    notes: "Go near sunset",
  } as const;
}

describe("trip planning API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM airports"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("creates, lists, updates, and deletes travel", async () => {
    const { trip } = await createTrip();
    const createResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...travelInput, arrivalStopId: trip.stops[0].id }),
    });
    const created = await createResponse.json<TravelResponse>();

    const listResponse = await request(tripTravelEndpoint(trip.id), "user_owner");
    const list = await listResponse.json<TravelListResponse>();
    const updateResponse = await request(
      `${tripTravelEndpoint(trip.id)}/${created.travel.id}`,
      "user_owner",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "booked" }),
      },
    );
    const updated = await updateResponse.json<TravelResponse>();
    const deleteResponse = await request(
      `${tripTravelEndpoint(trip.id)}/${created.travel.id}`,
      "user_owner",
      { method: "DELETE" },
    );

    expect(createResponse.status).toBe(201);
    expect(created.travel.arrivalStopId).toBe(trip.stops[0].id);
    expect(list.travel).toHaveLength(1);
    expect(updated.travel.status).toBe("booked");
    expect(deleteResponse.status).toBe(204);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM travel_segments").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it("stores catalog airports and returns their coordinates with a flight", async () => {
    await env.DB.prepare(
      `INSERT INTO airports (
        id, ident, iata_code, icao_code, type, name, municipality, iso_country, iso_region,
        latitude, longitude, keywords, search_text
      ) VALUES
        (3830, 'KORD', 'ORD', 'KORD', 'large_airport', 'Chicago O''Hare International Airport',
         'Chicago', 'US', 'US-IL', 41.9786, -87.9048, 'O''Hare', 'ord chicago o''hare'),
        (1636, 'LPPT', 'LIS', 'LPPT', 'large_airport', 'Humberto Delgado Airport',
         'Lisbon', 'PT', 'PT-11', 38.7813, -9.1359, NULL, 'lis lisbon humberto delgado')`,
    ).run();
    const { trip } = await createTrip();
    const createResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...travelInput,
        departureAirportId: 3830,
        arrivalAirportId: 1636,
      }),
    });
    const created = await createResponse.json<TravelResponse>();

    expect(createResponse.status).toBe(201);
    expect(created.travel).toMatchObject({
      departureAirportId: 3830,
      arrivalAirportId: 1636,
      departureAirport: { iataCode: "ORD", latitude: 41.9786, longitude: -87.9048 },
      arrivalAirport: { iataCode: "LIS", latitude: 38.7813, longitude: -9.1359 },
    });
  });

  it("stores vehicle rentals as transportation without treating them as journey segments", async () => {
    const { trip } = await createTrip();
    const rental = {
      kind: "rental",
      type: "car",
      status: "booked",
      departureStopId: trip.stops[0].id,
      arrivalStopId: trip.stops[0].id,
      departureLocation: "Lisbon Airport rental center",
      arrivalLocation: "Lisbon Airport rental return",
      departureAt: "2026-10-05T09:00",
      arrivalAt: "2026-10-11T17:00",
      carrier: "Europcar",
      referenceNumber: null,
      vehicleDescription: "Economy car · automatic",
      confirmationNumber: "CAR123",
      bookingUrl: "https://example.com/rental/CAR123",
      notes: null,
    } as const;
    const createResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rental),
    });
    const created = await createResponse.json<TravelResponse>();
    const missingReturn = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rental, confirmationNumber: "CAR456", arrivalAt: null }),
    });
    const journeyCar = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rental, kind: "journey", confirmationNumber: "CAR789" }),
    });

    expect(createResponse.status).toBe(201);
    expect(created.travel).toMatchObject({
      kind: "rental",
      type: "car",
      carrier: "Europcar",
      vehicleDescription: "Economy car · automatic",
    });
    expect(missingReturn.status).toBe(422);
    expect(journeyCar.status).toBe(422);
  });

  it("creates and validates stays", async () => {
    const { trip } = await createTrip();
    const createResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...stayInput, tripStopId: trip.stops[0].id }),
    });
    const created = await createResponse.json<StayResponse>();
    const listResponse = await request(tripStaysEndpoint(trip.id), "user_owner");
    const list = await listResponse.json<StayListResponse>();
    const updateResponse = await request(
      `${tripStaysEndpoint(trip.id)}/${created.stay.id}`,
      "user_owner",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "booked" }),
      },
    );
    const updated = await updateResponse.json<StayResponse>();
    const invalidResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...stayInput,
        tripStopId: trip.stops[0].id,
        checkOutDate: "2026-10-01",
      }),
    });

    expect(createResponse.status).toBe(201);
    expect(created.stay.propertyName).toBe("Memmo Alfama");
    expect(created.stay.tripStopId).toBe(trip.stops[0].id);
    expect(created.stay.propertyRef).toEqual({ provider: "google", placeId: "place-memmo" });
    expect(created.stay.bookingDetails).toMatchObject({
      roomType: "Deluxe double room",
      amenities: ["wifi", "breakfast"],
    });
    expect(list.stays).toHaveLength(1);
    expect(updated.stay.status).toBe("booked");
    expect(invalidResponse.status).toBe(422);

    const deleteResponse = await request(
      `${tripStaysEndpoint(trip.id)}/${created.stay.id}`,
      "user_owner",
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("serves dynamic property details and a no-store photo only to trip members", async () => {
    const { trip } = await createTrip();
    const created = await (
      await request(tripStaysEndpoint(trip.id), "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...stayInput, tripStopId: trip.stops[0].id }),
      })
    ).json<StayResponse>();
    const propertyResponse = await request(
      stayPropertyEndpoint(trip.id, created.stay.id),
      "user_owner",
    );
    const photoResponse = await request(
      stayPropertyPhotoEndpoint(trip.id, created.stay.id),
      "user_owner",
    );
    const outsiderResponse = await request(
      stayPropertyEndpoint(trip.id, created.stay.id),
      "user_other",
    );

    expect(propertyResponse.status).toBe(200);
    expect(propertyResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(await propertyResponse.json()).toMatchObject({
      property: { placeId: "place-memmo", websiteUri: "https://memmoalfama.example/" },
    });
    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("Content-Type")).toBe("image/jpeg");
    expect(photoResponse.headers.get("Cache-Control")).toBe("no-store");
    expect(outsiderResponse.status).toBe(404);
  });

  it("dry-runs and idempotently applies high-confidence property backfill matches", async () => {
    const { trip } = await createTrip();
    const created = await (
      await request(tripStaysEndpoint(trip.id), "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...stayInput,
          tripStopId: trip.stops[0].id,
          propertyRef: null,
        }),
      })
    ).json<StayResponse>();
    const endpoint = stayPropertyBackfillEndpoint(trip.id);
    const dryRun = await (
      await request(endpoint, "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      })
    ).json<StayPropertyBackfillResponse>();
    const afterDryRun = await (
      await request(tripStaysEndpoint(trip.id), "user_owner")
    ).json<StayListResponse>();
    const applied = await (
      await request(endpoint, "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      })
    ).json<StayPropertyBackfillResponse>();
    const afterApply = await (
      await request(tripStaysEndpoint(trip.id), "user_owner")
    ).json<StayListResponse>();
    const repeated = await (
      await request(endpoint, "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      })
    ).json<StayPropertyBackfillResponse>();

    expect(dryRun).toMatchObject({ mode: "dry-run", scanned: 1, matched: 1 });
    expect(dryRun.results[0]).toMatchObject({ stayId: created.stay.id, placeId: "place-memmo" });
    expect(afterDryRun.stays[0].propertyRef).toBeNull();
    expect(applied).toMatchObject({ mode: "apply", scanned: 1, matched: 1 });
    expect(afterApply.stays[0].propertyRef).toEqual({
      provider: "google",
      placeId: "place-memmo",
    });
    expect(repeated).toMatchObject({ mode: "apply", scanned: 0, matched: 0 });
  });

  it("moves ideas into the itinerary and supports full plan CRUD", async () => {
    const { trip } = await createTrip();
    const createResponse = await request(tripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planInput(trip.stops[0].id)),
    });
    const created = await createResponse.json<PlanResponse>();
    const ideasResponse = await request(tripPlansEndpoint(trip.id), "user_owner");
    const ideas = await ideasResponse.json<PlanListResponse>();
    const updateResponse = await request(
      `${tripPlansEndpoint(trip.id)}/${created.plan.id}`,
      "user_owner",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "planned",
          scheduledDate: "2026-10-07",
          startTime: "10:30",
          endTime: "12:00",
        }),
      },
    );
    const updated = await updateResponse.json<PlanResponse>();
    const invalidResponse = await request(
      `${tripPlansEndpoint(trip.id)}/${created.plan.id}`,
      "user_owner",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endTime: "09:00" }),
      },
    );
    const deleteResponse = await request(
      `${tripPlansEndpoint(trip.id)}/${created.plan.id}`,
      "user_owner",
      { method: "DELETE" },
    );

    expect(createResponse.status).toBe(201);
    expect(created.plan).toMatchObject({ status: "idea", scheduledDate: null });
    expect(ideas.plans).toHaveLength(1);
    expect(updateResponse.status).toBe(200);
    expect(updated.plan).toMatchObject({
      status: "planned",
      scheduledDate: "2026-10-07",
      startTime: "10:30",
      endTime: "12:00",
    });
    expect(invalidResponse.status).toBe(422);
    expect(deleteResponse.status).toBe(204);
  });

  it("conceals another user’s planning data", async () => {
    const { trip } = await createTrip();

    const travelResponse = await request(tripTravelEndpoint(trip.id), "user_other");
    const staysResponse = await request(tripStaysEndpoint(trip.id), "user_other");
    const plansResponse = await request(tripPlansEndpoint(trip.id), "user_other");

    expect(travelResponse.status).toBe(404);
    expect(staysResponse.status).toBe(404);
    expect(plansResponse.status).toBe(404);
  });

  it("rejects destination ids from another trip", async () => {
    const { trip } = await createTrip();
    const { trip: otherTrip } = await createTrip("user_other");
    const travelResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...travelInput, arrivalStopId: otherTrip.stops[0].id }),
    });
    const stayResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...stayInput, tripStopId: otherTrip.stops[0].id }),
    });
    const planResponse = await request(tripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planInput(otherTrip.stops[0].id)),
    });

    expect(travelResponse.status).toBe(422);
    expect(stayResponse.status).toBe(422);
    expect(planResponse.status).toBe(422);
  });

  it("allows viewers to read but not change planning data", async () => {
    const { trip } = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, ?, 'viewer', ?)",
    )
      .bind(trip.id, "user_viewer", new Date().toISOString())
      .run();

    const listResponse = await request(tripTravelEndpoint(trip.id), "user_viewer");
    const createResponse = await request(tripTravelEndpoint(trip.id), "user_viewer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(travelInput),
    });
    const plansResponse = await request(tripPlansEndpoint(trip.id), "user_viewer");
    const createPlanResponse = await request(tripPlansEndpoint(trip.id), "user_viewer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(planInput(trip.stops[0].id)),
    });

    expect(listResponse.status).toBe(200);
    expect(createResponse.status).toBe(403);
    expect(plansResponse.status).toBe(200);
    expect(createPlanResponse.status).toBe(403);
  });
});
