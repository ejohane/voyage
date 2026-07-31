import { env } from "cloudflare:test";
import {
  apiErrorSchema,
  planEndpoint,
  type TripResponse,
  tripsEndpoint,
  type V1PlanResponse,
  v1PlanEndpoint,
  v1TripPlansEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";
import {
  deleteExpiredV1IdempotencyRecords,
  v1PlanCreateIdempotencyRetentionMilliseconds,
} from "../worker/planning-repository";

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
});

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-test-user", "user_owner");
  return testApp.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip() {
  const response = await request(tripsEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Idempotency retention",
      stops: [
        {
          name: "Lisbon, Portugal",
          arrivalDate: "2026-10-04",
          departureDate: "2026-10-12",
        },
      ],
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json<TripResponse>()).trip;
}

function planInput(tripStopId: string) {
  return {
    tripStopId,
    title: "Visit the MAAT",
    category: "sightseeing",
    status: "planned",
    scheduledDate: "2026-10-07",
    startTime: "10:30",
    endTime: "12:00",
    location: "Av. Brasilia, Lisbon",
    confirmationNumber: null,
    bookingUrl: null,
    notes: null,
  } as const;
}

async function createPlan(tripId: string, tripStopId: string, idempotencyKey: string) {
  const input = planInput(tripStopId);
  const response = await request(v1TripPlansEndpoint(tripId), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  return { input, response };
}

type IdempotencyRow = {
  response_json: string | null;
  resource_deleted_at: string | null;
  created_at: string;
  expires_at: string;
};

async function idempotencyRow(idempotencyKey: string) {
  return env.DB.prepare(
    `SELECT response_json, resource_deleted_at, created_at, expires_at
     FROM api_idempotency_records
     WHERE user_id = 'user_owner' AND operation = 'create_plan' AND idempotency_key = ?`,
  )
    .bind(idempotencyKey)
    .first<IdempotencyRow>();
}

describe("Voyage API v1 idempotency retention", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_idempotency_records"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("stores replay payloads for exactly seven days and purges expired records", async () => {
    const trip = await createTrip();
    const key = crypto.randomUUID();
    const created = await createPlan(trip.id, trip.stops[0].id, key);
    expect(created.response.status).toBe(201);

    const record = await idempotencyRow(key);
    expect(record?.response_json).toBeTruthy();
    expect(record?.resource_deleted_at).toBeNull();
    expect(
      new Date(record?.expires_at ?? 0).getTime() - new Date(record?.created_at ?? 0).getTime(),
    ).toBe(v1PlanCreateIdempotencyRetentionMilliseconds);

    await env.DB.prepare(
      "UPDATE api_idempotency_records SET created_at = ?, expires_at = ? WHERE idempotency_key = ?",
    )
      .bind("1999-12-31T00:00:00.000Z", "2000-01-07T00:00:00.000Z", key)
      .run();

    expect(
      await deleteExpiredV1IdempotencyRecords(env.DB, new Date("2000-01-08T00:00:00.000Z")),
    ).toBe(1);
    expect(await idempotencyRow(key)).toBeNull();
  });

  it("tombstones a v1-deleted plan and refuses to replay its stored payload", async () => {
    const trip = await createTrip();
    const key = crypto.randomUUID();
    const created = await createPlan(trip.id, trip.stops[0].id, key);
    const body = await created.response.json<V1PlanResponse>();

    const deleted = await request(v1PlanEndpoint(trip.id, body.plan.id), {
      method: "DELETE",
      headers: { "If-Match": '"1"' },
    });
    const replay = await createPlan(trip.id, trip.stops[0].id, key);
    const record = await idempotencyRow(key);

    expect(deleted.status).toBe(204);
    expect(record?.response_json).toBeNull();
    expect(record?.resource_deleted_at).toBeTruthy();
    expect(replay.response.status).toBe(409);
    expect(apiErrorSchema.parse(await replay.response.json()).error.code).toBe("conflict");
    expect(
      await env.DB.prepare("SELECT id FROM trip_plans WHERE id = ?").bind(body.plan.id).first(),
    ).toBeNull();
  });

  it("also tombstones replay payloads when the web endpoint deletes a plan", async () => {
    const trip = await createTrip();
    const key = crypto.randomUUID();
    const created = await createPlan(trip.id, trip.stops[0].id, key);
    const body = await created.response.json<V1PlanResponse>();

    const deleted = await request(planEndpoint(trip.id, body.plan.id), { method: "DELETE" });
    const replay = await createPlan(trip.id, trip.stops[0].id, key);
    const record = await idempotencyRow(key);

    expect(deleted.status).toBe(204);
    expect(record?.response_json).toBeNull();
    expect(record?.resource_deleted_at).toBeTruthy();
    expect(replay.response.status).toBe(409);
  });

  it("tombstones replay payloads when a destination cascade deletes its plans", async () => {
    const trip = await createTrip();
    const key = crypto.randomUUID();
    const created = await createPlan(trip.id, trip.stops[0].id, key);
    expect(created.response.status).toBe(201);

    await env.DB.prepare("DELETE FROM trip_stops WHERE id = ? AND trip_id = ?")
      .bind(trip.stops[0].id, trip.id)
      .run();
    const record = await idempotencyRow(key);

    expect(record?.response_json).toBeNull();
    expect(record?.resource_deleted_at).toBeTruthy();
    expect(
      await env.DB.prepare("SELECT id FROM trip_plans WHERE trip_id = ?").bind(trip.id).first(),
    ).toBeNull();
  });
});
