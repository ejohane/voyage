import { env } from "cloudflare:test";
import {
  apiErrorSchema,
  planEndpoint,
  type StayResponse,
  type TripResponse,
  tripPlansEndpoint,
  tripStaysEndpoint,
  tripsEndpoint,
  tripTravelEndpoint,
  type V1PlanResponse,
  type V1TripPeopleResponse,
  v1PlanEndpoint,
  v1TripListResponseSchema,
  v1TripPeopleEndpoint,
  v1TripPeopleResponseSchema,
  v1TripPlansEndpoint,
  v1TripsEndpoint,
  v1TripWorkspaceEndpoint,
  v1TripWorkspaceResponseSchema,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import listFixture from "../../../packages/contracts/fixtures/v1/trip-list.json";
import peopleFixture from "../../../packages/contracts/fixtures/v1/trip-people.json";
import workspaceFixture from "../../../packages/contracts/fixtures/v1/trip-workspace.json";
import { createApp } from "../worker";
import type { UserDirectory, UserIdentity } from "../worker/user-directory";

const now = new Date("2026-08-01T12:00:00.000Z");
const identities = new Map<string, UserIdentity>([
  [
    "user_owner",
    {
      userId: "user_owner",
      verifiedEmails: ["owner@example.com"],
      primaryEmail: "owner@example.com",
      displayName: "Olivia Owner",
      imageUrl: null,
    },
  ],
  [
    "user_viewer",
    {
      userId: "user_viewer",
      verifiedEmails: ["viewer@example.com"],
      primaryEmail: "viewer@example.com",
      displayName: "Vera Viewer",
      imageUrl: null,
    },
  ],
]);

const userDirectory: UserDirectory = {
  async getUser(userId) {
    const identity = identities.get(userId);
    if (!identity) throw new Error("Missing test identity");
    return identity;
  },
};

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  userDirectory,
  now: () => now,
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
  expect(response.status).toBe(201);
  return (await response.json<TripResponse>()).trip;
}

function scheduledPlanInput(tripStopId: string, title = "Visit the MAAT") {
  return {
    tripStopId,
    title,
    category: "sightseeing",
    status: "planned",
    scheduledDate: "2026-10-07",
    startTime: "10:30",
    endTime: "12:00",
    location: "Av. Brasília, Lisbon",
    confirmationNumber: null,
    bookingUrl: "https://example.com/maat",
    notes: "Go near sunset",
  } as const;
}

async function createV1Plan(
  tripId: string,
  tripStopId: string,
  idempotencyKey = crypto.randomUUID(),
) {
  const response = await request(v1TripPlansEndpoint(tripId), "user_owner", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(scheduledPlanInput(tripStopId)),
  });
  return { response, body: await response.json<V1PlanResponse>() };
}

describe("Voyage API v1", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM api_idempotency_records"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("keeps sanitized fixtures aligned with every native read schema", () => {
    expect(v1TripListResponseSchema.parse(listFixture)).toEqual(listFixture);
    expect(v1TripWorkspaceResponseSchema.parse(workspaceFixture)).toEqual(workspaceFixture);
    expect(v1TripPeopleResponseSchema.parse(peopleFixture)).toEqual(peopleFixture);
  });

  it("requires authentication and returns version and request correlation headers", async () => {
    const unauthenticated = await request(v1TripsEndpoint, undefined, {
      headers: { "X-Request-ID": "native-test-request" },
    });

    expect(unauthenticated.status).toBe(401);
    expect(apiErrorSchema.parse(await unauthenticated.json()).error.code).toBe("unauthorized");
    expect(unauthenticated.headers.get("X-Voyage-API-Version")).toBe("1");
    expect(unauthenticated.headers.get("X-Request-ID")).toBe("native-test-request");
  });

  it("lists only membership-scoped trips and supports conditional refresh", async () => {
    const ownerTrip = await createTrip();
    await createTrip("user_other");

    const response = await request(v1TripsEndpoint, "user_owner");
    const body = v1TripListResponseSchema.parse(await response.json());
    const etag = response.headers.get("ETag");
    const conditional = await request(v1TripsEndpoint, "user_owner", {
      headers: { "If-None-Match": etag ?? "" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(body).toMatchObject({
      schemaVersion: 1,
      generatedAt: now.toISOString(),
      trips: [{ id: ownerTrip.id }],
    });
    expect(body.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(etag).toBe(`"${body.revision}"`);
    expect(conditional.status).toBe(304);
    expect(conditional.headers.get("ETag")).toBe(etag);
    expect(await conditional.text()).toBe("");
  });

  it("returns a complete aggregate workspace, excludes ideas, and invalidates its ETag", async () => {
    const trip = await createTrip();
    const travelResponse = await request(tripTravelEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "journey",
        type: "flight",
        status: "planning",
        departureStopId: null,
        arrivalStopId: trip.stops[0].id,
        departureLocation: "ORD · Chicago",
        arrivalLocation: "LIS · Lisbon",
        departureAt: "2026-10-04T18:30",
        arrivalAt: "2026-10-05T08:10",
        carrier: "United Airlines",
        referenceNumber: "UA 942",
        vehicleDescription: null,
        confirmationNumber: "ABC123",
        bookingUrl: null,
        notes: null,
      }),
    });
    expect(travelResponse.status).toBe(201);
    const stayResponse = await request(tripStaysEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "booked",
        tripStopId: trip.stops[0].id,
        propertyName: "Memmo Alfama",
        address: "Travessa das Merceeiras 27, Lisbon",
        checkInDate: "2026-10-05",
        checkOutDate: "2026-10-12",
        confirmationNumber: "STAY123",
        bookingUrl: null,
        notes: null,
      }),
    });
    expect((await stayResponse.json<StayResponse>()).stay.propertyName).toBe("Memmo Alfama");
    const ideaResponse = await request(tripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...scheduledPlanInput(trip.stops[0].id, "Pastéis idea"),
        status: "idea",
        scheduledDate: null,
        startTime: null,
        endTime: null,
      }),
    });
    expect(ideaResponse.status).toBe(201);
    const { body: plan } = await createV1Plan(trip.id, trip.stops[0].id);

    const first = await request(v1TripWorkspaceEndpoint(trip.id), "user_owner");
    const firstBody = v1TripWorkspaceResponseSchema.parse(await first.json());
    const conditional = await request(v1TripWorkspaceEndpoint(trip.id), "user_owner", {
      headers: { "If-None-Match": first.headers.get("ETag") ?? "" },
    });
    const legacyUpdate = await request(planEndpoint(trip.id, plan.plan.id), "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "MAAT at sunset" }),
    });
    const refreshed = await request(v1TripWorkspaceEndpoint(trip.id), "user_owner");
    const refreshedBody = v1TripWorkspaceResponseSchema.parse(await refreshed.json());
    const hidden = await request(v1TripWorkspaceEndpoint(trip.id), "user_other");

    expect(firstBody.travel).toHaveLength(1);
    expect(firstBody.stays).toHaveLength(1);
    expect(firstBody.plans).toHaveLength(1);
    expect(firstBody.plans[0]).toMatchObject({ id: plan.plan.id, revision: 1 });
    expect(conditional.status).toBe(304);
    expect(legacyUpdate.status).toBe(200);
    expect(refreshedBody.plans[0]).toMatchObject({ title: "MAAT at sunset", revision: 2 });
    expect(refreshedBody.revision).not.toBe(firstBody.revision);
    expect(refreshed.headers.get("ETag")).not.toBe(first.headers.get("ETag"));
    expect(hidden.status).toBe(404);
  });

  it("preserves existing owner-only email privacy on the separate people read", async () => {
    const trip = await createTrip();
    await env.DB.prepare(
      `INSERT INTO trip_memberships (
        trip_id, user_id, access_level, joined_at, email, display_name
      ) VALUES (?, 'user_viewer', 'viewer', ?, 'stored-viewer@example.com', 'Stored Viewer')`,
    )
      .bind(trip.id, now.toISOString())
      .run();

    const ownerResponse = await request(v1TripPeopleEndpoint(trip.id), "user_owner");
    const owner = ownerResponse.json<V1TripPeopleResponse>();
    const viewerResponse = await request(v1TripPeopleEndpoint(trip.id), "user_viewer");
    const viewer = viewerResponse.json<V1TripPeopleResponse>();
    const hidden = await request(v1TripPeopleEndpoint(trip.id), "user_other");

    expect(ownerResponse.status).toBe(200);
    expect((await owner).members.map((member) => member.email)).toEqual([
      "owner@example.com",
      "viewer@example.com",
    ]);
    expect((await viewer).members.map((member) => member.email)).toEqual([null, null]);
    expect(hidden.status).toBe(404);
  });

  it("requires a UUID idempotency key and accepts scheduled plans only", async () => {
    const trip = await createTrip();
    const missingKey = await request(v1TripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(scheduledPlanInput(trip.stops[0].id)),
    });
    const idea = await request(v1TripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        ...scheduledPlanInput(trip.stops[0].id),
        status: "idea",
        scheduledDate: null,
        startTime: null,
        endTime: null,
      }),
    });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM trip_plans").first<{
      count: number;
    }>();

    expect(missingKey.status).toBe(422);
    expect(apiErrorSchema.parse(await missingKey.json()).error.fieldErrors).toHaveProperty(
      "Idempotency-Key",
    );
    expect(idea.status).toBe(422);
    expect(count).toEqual({ count: 0 });
  });

  it("replays identical creates exactly once and conflicts on key reuse", async () => {
    const trip = await createTrip();
    const key = crypto.randomUUID();
    const input = scheduledPlanInput(trip.stops[0].id);
    const create = () =>
      request(v1TripPlansEndpoint(trip.id), "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify(input),
      });

    const [first, second] = await Promise.all([create(), create()]);
    const firstBody = await first.json<V1PlanResponse>();
    const secondBody = await second.json<V1PlanResponse>();
    const reused = await request(v1TripPlansEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ ...input, title: "Different plan" }),
    });
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM trip_plans").first<{
      count: number;
    }>();

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(firstBody).toEqual(secondBody);
    expect(
      [first, second].filter((response) => response.headers.get("Idempotency-Replayed")),
    ).toHaveLength(1);
    expect(first.headers.get("ETag")).toBe('"1"');
    expect(second.headers.get("ETag")).toBe('"1"');
    expect(reused.status).toBe(409);
    expect(apiErrorSchema.parse(await reused.json()).error.code).toBe("conflict");
    expect(count).toEqual({ count: 1 });
  });

  it("allows editors to create, update, and delete scheduled plans", async () => {
    const trip = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_editor', 'editor', ?)",
    )
      .bind(trip.id, now.toISOString())
      .run();

    const created = await request(v1TripPlansEndpoint(trip.id), "user_editor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify(scheduledPlanInput(trip.stops[0].id)),
    });
    const createdBody = await created.json<V1PlanResponse>();
    const endpoint = v1PlanEndpoint(trip.id, createdBody.plan.id);
    const updated = await request(endpoint, "user_editor", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "MAAT with the group" }),
    });
    const updatedBody = await updated.json<V1PlanResponse>();
    const creator = await env.DB.prepare("SELECT created_by_user_id FROM trip_plans WHERE id = ?")
      .bind(createdBody.plan.id)
      .first<{ created_by_user_id: string }>();
    const deleted = await request(endpoint, "user_editor", {
      method: "DELETE",
      headers: { "If-Match": '"2"' },
    });

    expect(created.status).toBe(201);
    expect(createdBody.plan).toMatchObject({ revision: 1, title: "Visit the MAAT" });
    expect(creator).toEqual({ created_by_user_id: "user_editor" });
    expect(updated.status).toBe(200);
    expect(updatedBody.plan).toMatchObject({ revision: 2, title: "MAAT with the group" });
    expect(deleted.status).toBe(204);
    expect(
      await env.DB.prepare("SELECT id FROM trip_plans WHERE id = ?")
        .bind(createdBody.plan.id)
        .first(),
    ).toBeNull();
  });

  it("preserves local schedule values byte-for-byte across create, update, and read", async () => {
    const trip = await createTrip();
    const created = await createV1Plan(trip.id, trip.stops[0].id);
    const createdSchedule = {
      scheduledDate: created.body.plan.scheduledDate,
      startTime: created.body.plan.startTime,
      endTime: created.body.plan.endTime,
    };
    const createdRow = await env.DB.prepare(
      "SELECT scheduled_date, start_time, end_time FROM trip_plans WHERE id = ?",
    )
      .bind(created.body.plan.id)
      .first<{ scheduled_date: string; start_time: string; end_time: string }>();

    const updatedSchedule = {
      scheduledDate: "2026-10-08",
      startTime: "09:05",
      endTime: "09:45",
    } as const;
    const updated = await request(v1PlanEndpoint(trip.id, created.body.plan.id), "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify(updatedSchedule),
    });
    const updatedBody = await updated.json<V1PlanResponse>();
    const workspace = v1TripWorkspaceResponseSchema.parse(
      await (await request(v1TripWorkspaceEndpoint(trip.id), "user_owner")).json(),
    );
    const updatedRow = await env.DB.prepare(
      "SELECT scheduled_date, start_time, end_time FROM trip_plans WHERE id = ?",
    )
      .bind(created.body.plan.id)
      .first<{ scheduled_date: string; start_time: string; end_time: string }>();

    expect(createdSchedule).toEqual({
      scheduledDate: "2026-10-07",
      startTime: "10:30",
      endTime: "12:00",
    });
    expect(createdRow).toEqual({
      scheduled_date: "2026-10-07",
      start_time: "10:30",
      end_time: "12:00",
    });
    expect(updated.status).toBe(200);
    expect({
      scheduledDate: updatedBody.plan.scheduledDate,
      startTime: updatedBody.plan.startTime,
      endTime: updatedBody.plan.endTime,
    }).toEqual(updatedSchedule);
    expect(workspace.plans[0]).toMatchObject(updatedSchedule);
    expect(updatedRow).toEqual({
      scheduled_date: updatedSchedule.scheduledDate,
      start_time: updatedSchedule.startTime,
      end_time: updatedSchedule.endTime,
    });
  });

  it("rejects malformed If-Match values for updates and deletes", async () => {
    const trip = await createTrip();
    const created = await createV1Plan(trip.id, trip.stops[0].id);
    const endpoint = v1PlanEndpoint(trip.id, created.body.plan.id);
    const malformedValues = ["1", 'W/"1"', '"01"', '"0"', '"1", "2"'];

    for (const ifMatch of malformedValues) {
      const update = await request(endpoint, "user_owner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": ifMatch },
        body: JSON.stringify({ title: "Must not be written" }),
      });
      const deletion = await request(endpoint, "user_owner", {
        method: "DELETE",
        headers: { "If-Match": ifMatch },
      });

      expect(update.status).toBe(428);
      expect(apiErrorSchema.parse(await update.json()).error.code).toBe("precondition_required");
      expect(deletion.status).toBe(428);
      expect(apiErrorSchema.parse(await deletion.json()).error.code).toBe("precondition_required");
    }

    expect(
      await env.DB.prepare("SELECT title, revision FROM trip_plans WHERE id = ?")
        .bind(created.body.plan.id)
        .first(),
    ).toEqual({ title: "Visit the MAAT", revision: 1 });
  });

  it("protects updates and deletes with strong revision preconditions", async () => {
    const trip = await createTrip();
    const created = await createV1Plan(trip.id, trip.stops[0].id);
    const endpoint = v1PlanEndpoint(trip.id, created.body.plan.id);
    const missingPrecondition = await request(endpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "MAAT at sunset" }),
    });
    const updated = await request(endpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "MAAT at sunset" }),
    });
    const updatedBody = await updated.json<V1PlanResponse>();
    const staleUpdate = await request(endpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "Overwrite from stale phone" }),
    });
    const staleDelete = await request(endpoint, "user_owner", {
      method: "DELETE",
      headers: { "If-Match": '"1"' },
    });
    const deleted = await request(endpoint, "user_owner", {
      method: "DELETE",
      headers: { "If-Match": '"2"' },
    });

    expect(missingPrecondition.status).toBe(428);
    expect(apiErrorSchema.parse(await missingPrecondition.json()).error.code).toBe(
      "precondition_required",
    );
    expect(updated.status).toBe(200);
    expect(updated.headers.get("ETag")).toBe('"2"');
    expect(updatedBody.plan).toMatchObject({ title: "MAAT at sunset", revision: 2 });
    expect(staleUpdate.status).toBe(409);
    expect(apiErrorSchema.parse(await staleUpdate.json()).error.currentRevision).toBe(2);
    expect(staleDelete.status).toBe(409);
    expect(deleted.status).toBe(204);
    expect(await env.DB.prepare("SELECT id FROM trip_plans").first()).toBeNull();
  });

  it("lets viewers read but conceals and forbids versioned mutations", async () => {
    const trip = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_viewer', 'viewer', ?)",
    )
      .bind(trip.id, now.toISOString())
      .run();
    const created = await createV1Plan(trip.id, trip.stops[0].id);
    const endpoint = v1PlanEndpoint(trip.id, created.body.plan.id);

    const viewerWorkspace = await request(v1TripWorkspaceEndpoint(trip.id), "user_viewer");
    const forbiddenCreate = await request(v1TripPlansEndpoint(trip.id), "user_viewer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(scheduledPlanInput(trip.stops[0].id)),
    });
    const forbiddenUpdate = await request(endpoint, "user_viewer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "Viewer overwrite" }),
    });
    const forbiddenDelete = await request(endpoint, "user_viewer", {
      method: "DELETE",
      headers: { "If-Match": '"1"' },
    });
    const hiddenWorkspace = await request(v1TripWorkspaceEndpoint(trip.id), "user_other");
    const hiddenUpdate = await request(endpoint, "user_other", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "Outsider overwrite" }),
    });
    const hiddenDelete = await request(endpoint, "user_other", {
      method: "DELETE",
      headers: { "If-Match": '"1"' },
    });

    expect(viewerWorkspace.status).toBe(200);
    expect(forbiddenCreate.status).toBe(403);
    expect(forbiddenUpdate.status).toBe(403);
    expect(forbiddenDelete.status).toBe(403);
    expect(hiddenWorkspace.status).toBe(404);
    expect(hiddenUpdate.status).toBe(404);
    expect(hiddenDelete.status).toBe(404);
    expect(
      await env.DB.prepare("SELECT title, revision FROM trip_plans WHERE id = ?")
        .bind(created.body.plan.id)
        .first(),
    ).toEqual({ title: "Visit the MAAT", revision: 1 });
  });

  it("maps backend failures to a stable service-unavailable error", async () => {
    const failingDatabase = {
      prepare() {
        throw new Error("database unavailable");
      },
    } as unknown as D1Database;
    const response = await testApp.request(
      `https://voyage.test${v1TripsEndpoint}`,
      { headers: { "x-test-user": "user_owner" } },
      { ...env, DB: failingDatabase },
    );

    expect(response.status).toBe(503);
    expect(apiErrorSchema.parse(await response.json()).error).toMatchObject({
      code: "service_unavailable",
      message: "Voyage is temporarily unavailable.",
    });
    expect(response.headers.get("X-Voyage-API-Version")).toBe("1");
    expect(response.headers.get("X-Request-ID")).toBeTruthy();
  });
});
