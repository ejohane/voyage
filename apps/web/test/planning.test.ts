import { env } from "cloudflare:test";
import {
  type StayListResponse,
  type StayResponse,
  type TravelListResponse,
  type TravelResponse,
  type TripResponse,
  tripStaysEndpoint,
  tripsEndpoint,
  tripTravelEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
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
      destination: "Lisbon, Portugal",
      startDate: "2026-10-04",
      endDate: "2026-10-12",
    }),
  });
  return response.json<TripResponse>();
}

const travelInput = {
  type: "flight",
  status: "planning",
  departureLocation: "ORD · Chicago",
  arrivalLocation: "LIS · Lisbon",
  departureAt: "2026-10-04T18:30",
  arrivalAt: "2026-10-05T08:10",
  carrier: "United Airlines",
  referenceNumber: "UA 942",
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
} as const;

describe("trip planning API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("creates, lists, updates, and deletes travel", async () => {
    const { trip } = await createTrip();
    const createResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(travelInput),
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
    expect(list.travel).toHaveLength(1);
    expect(updated.travel.status).toBe("booked");
    expect(deleteResponse.status).toBe(204);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM travel_segments").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it("creates and validates stays", async () => {
    const { trip } = await createTrip();
    const createResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stayInput),
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
      body: JSON.stringify({ ...stayInput, checkOutDate: "2026-10-01" }),
    });

    expect(createResponse.status).toBe(201);
    expect(created.stay.propertyName).toBe("Memmo Alfama");
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

  it("conceals another user’s planning data", async () => {
    const { trip } = await createTrip();

    const travelResponse = await request(tripTravelEndpoint(trip.id), "user_other");
    const staysResponse = await request(tripStaysEndpoint(trip.id), "user_other");

    expect(travelResponse.status).toBe(404);
    expect(staysResponse.status).toBe(404);
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

    expect(listResponse.status).toBe(200);
    expect(createResponse.status).toBe(403);
  });
});
