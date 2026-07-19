import { env } from "cloudflare:test";
import { type TripListResponse, type TripResponse, tripsEndpoint } from "@voyage/contracts";
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

  if (userId) {
    headers.set("x-test-user", userId);
  }

  return testApp.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip(userId = "user_owner") {
  const response = await request(tripsEndpoint, userId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Summer in Japan",
      stops: [
        { name: "Tokyo, Japan", arrivalDate: null, departureDate: null },
        { name: "Kyoto, Japan", arrivalDate: null, departureDate: null },
      ],
    }),
  });

  expect(response.status).toBe(201);
  return response.json<TripResponse>();
}

describe("trip API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("requires an authenticated user", async () => {
    const response = await request(tripsEndpoint);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: "Sign in to continue." },
    });
  });

  it("creates a trip and its owner membership atomically", async () => {
    const { trip } = await createTrip();
    const membership = await env.DB.prepare(
      "SELECT user_id, access_level FROM trip_memberships WHERE trip_id = ?",
    )
      .bind(trip.id)
      .first<{ user_id: string; access_level: string }>();
    const stops = await env.DB.prepare(
      "SELECT name, position FROM trip_stops WHERE trip_id = ? ORDER BY position",
    )
      .bind(trip.id)
      .all<{ name: string; position: number }>();

    expect(trip).toMatchObject({
      name: "Summer in Japan",
      accessLevel: "owner",
    });
    expect(trip.stops.map((stop) => stop.name)).toEqual(["Tokyo, Japan", "Kyoto, Japan"]);
    expect(membership).toEqual({ user_id: "user_owner", access_level: "owner" });
    expect(stops.results).toEqual([
      { name: "Tokyo, Japan", position: 0 },
      { name: "Kyoto, Japan", position: 1 },
    ]);
  });

  it("lists and reads only trips that belong to the current user", async () => {
    const { trip } = await createTrip();
    await createTrip("user_other");

    const listResponse = await request(tripsEndpoint, "user_owner");
    const list = await listResponse.json<TripListResponse>();
    const hiddenResponse = await request(`${tripsEndpoint}/${trip.id}`, "user_other");

    expect(listResponse.status).toBe(200);
    expect(list.trips).toHaveLength(1);
    expect(list.trips[0]?.id).toBe(trip.id);
    expect(hiddenResponse.status).toBe(404);
  });

  it("derives trip dates from destinations and preserves them on name updates", async () => {
    const { trip } = await createTrip();
    const [tokyo, kyoto] = trip.stops;
    const updateResponse = await request(`${tripsEndpoint}/${trip.id}`, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stops: [
          {
            id: tokyo.id,
            name: tokyo.name,
            arrivalDate: "2026-09-12",
            departureDate: "2026-09-17",
          },
          {
            id: kyoto.id,
            name: kyoto.name,
            arrivalDate: "2026-09-17",
            departureDate: "2026-09-22",
          },
        ],
      }),
    });
    const updated = await updateResponse.json<TripResponse>();
    const nameUpdateResponse = await request(`${tripsEndpoint}/${trip.id}`, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Japan by rail" }),
    });
    const renamed = await nameUpdateResponse.json<TripResponse>();
    const invalidResponse = await request(`${tripsEndpoint}/${trip.id}`, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stops: [
          {
            id: tokyo.id,
            name: tokyo.name,
            arrivalDate: "2026-09-12",
            departureDate: "2026-09-01",
          },
        ],
      }),
    });

    expect(updateResponse.status).toBe(200);
    expect(updated.trip).toMatchObject({
      startDate: "2026-09-12",
      endDate: "2026-09-22",
    });
    expect(nameUpdateResponse.status).toBe(200);
    expect(renamed.trip).toMatchObject({
      name: "Japan by rail",
      startDate: "2026-09-12",
      endDate: "2026-09-22",
    });
    expect(invalidResponse.status).toBe(422);
  });

  it("reorders destinations while preserving existing stop ids", async () => {
    const { trip } = await createTrip();
    const [tokyo, kyoto] = trip.stops;
    const response = await request(`${tripsEndpoint}/${trip.id}`, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stops: [
          {
            id: kyoto.id,
            name: kyoto.name,
            arrivalDate: "2026-09-15",
            departureDate: "2026-09-18",
          },
          {
            id: tokyo.id,
            name: tokyo.name,
            arrivalDate: "2026-09-18",
            departureDate: "2026-09-22",
          },
          {
            name: "Osaka, Japan",
            arrivalDate: null,
            departureDate: null,
          },
        ],
      }),
    });
    const updated = await response.json<TripResponse>();

    expect(response.status).toBe(200);
    expect(updated.trip.stops.map((stop) => stop.name)).toEqual([
      "Kyoto, Japan",
      "Tokyo, Japan",
      "Osaka, Japan",
    ]);
    expect(updated.trip.stops[0]?.id).toBe(kyoto.id);
    expect(updated.trip.stops[1]?.id).toBe(tokyo.id);
    expect(updated.trip.stops[2]?.id).toBeTypeOf("string");
    expect(updated.trip).toMatchObject({
      startDate: "2026-09-15",
      endDate: "2026-09-22",
    });
  });

  it("rejects malformed trip data", async () => {
    const response = await request(tripsEndpoint, "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "",
        stops: [{ name: "", arrivalDate: "2026-02-30", departureDate: null }],
      }),
    });

    expect(response.status).toBe(422);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trips").first<{ count: number }>(),
    ).toEqual({ count: 0 });
  });
});
