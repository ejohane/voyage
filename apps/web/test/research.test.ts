import { env } from "cloudflare:test";
import {
  type ResearchItemResponse,
  type ResearchListResponse,
  type ResearchPlanPromotionResponse,
  researchItemEndpoint,
  researchPlanPromotionEndpoint,
  type TripResponse,
  tripPlansEndpoint,
  tripResearchEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";

const app = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
});

async function request(
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return app.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip(userId = "user_owner", name = "Puglia and Sardinia") {
  const response = await request(tripsEndpoint, userId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      stops: [
        {
          name: "Puglia, Italy",
          arrivalDate: "2026-08-31",
          departureDate: "2026-09-05",
        },
        {
          name: "Sardinia, Italy",
          arrivalDate: "2026-09-05",
          departureDate: "2026-09-10",
        },
      ],
    }),
  });
  return response.json<TripResponse>();
}

function capture(
  tripId: string,
  body: unknown,
  userId = "user_owner",
  idempotencyKey = crypto.randomUUID(),
) {
  return request(tripResearchEndpoint(tripId), userId, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
}

describe("Research and provenance API", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM research_capture_idempotency"),
      env.DB.prepare("DELETE FROM promotion_links"),
      env.DB.prepare("DELETE FROM candidate_evidence"),
      env.DB.prepare("DELETE FROM artifact_candidates"),
      env.DB.prepare("DELETE FROM extraction_runs"),
      env.DB.prepare("DELETE FROM research_item_sources"),
      env.DB.prepare("DELETE FROM artifact_versions"),
      env.DB.prepare("DELETE FROM source_artifacts"),
      env.DB.prepare("DELETE FROM research_item_price_quotes"),
      env.DB.prepare("DELETE FROM research_items"),
      env.DB.prepare("DELETE FROM plan_price_quotes"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("captures a URL in one request and derives a low-friction title", async () => {
    const { trip } = await createTrip();
    const response = await capture(trip.id, {
      source: { originalUrl: "https://www.ipastini.it/", visibility: "planners" },
    });
    const body = await response.json<ResearchItemResponse>();

    expect(response.status).toBe(201);
    expect(body.researchItem).toMatchObject({
      tripId: trip.id,
      title: "ipastini.it",
      state: "inbox",
      category: null,
      tripStopId: null,
      revision: 1,
    });
    expect(body.researchItem.sources).toHaveLength(1);
    expect(body.researchItem.sources[0]).toMatchObject({
      originalUrl: "https://www.ipastini.it/",
      processingState: "captured",
      visibility: "planners",
    });
    expect(body.researchItem.sources[0].latestVersion).toMatchObject({ sequence: 1 });
  });

  it("captures a note without requiring category, destination, or title", async () => {
    const { trip } = await createTrip();
    const response = await capture(trip.id, {
      body: "Regional foods to try\nOrecchiette, burrata, and focaccia barese",
    });
    const body = await response.json<ResearchItemResponse>();

    expect(response.status).toBe(201);
    expect(body.researchItem).toMatchObject({
      title: "Regional foods to try",
      body: "Regional foods to try\nOrecchiette, burrata, and focaccia barese",
      category: null,
      tripStopId: null,
    });
  });

  it("purges an exclusively attached source when its Research item is deleted", async () => {
    const { trip } = await createTrip();
    const created = await (
      await capture(trip.id, {
        source: { originalUrl: "https://private.example/trip-notes", visibility: "planners" },
      })
    ).json<ResearchItemResponse>();
    const sourceId = created.researchItem.sources[0].id;
    const response = await request(
      researchItemEndpoint(trip.id, created.researchItem.id),
      "user_owner",
      { method: "DELETE", headers: { "If-Match": '"1"' } },
    );

    expect(response.status).toBe(204);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM artifact_versions WHERE artifact_id = ?")
        .bind(sourceId)
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare(
        "SELECT original_url, captured_title, deleted_at FROM source_artifacts WHERE id = ?",
      )
        .bind(sourceId)
        .first<{
          original_url: string | null;
          captured_title: string | null;
          deleted_at: string | null;
        }>(),
    ).toEqual({ original_url: null, captured_title: null, deleted_at: expect.any(String) });
  });

  it("replays identical captures and rejects idempotency-key reuse", async () => {
    const { trip } = await createTrip();
    const key = crypto.randomUUID();
    const first = await capture(trip.id, { body: "Walk the old town" }, "user_owner", key);
    const replay = await capture(trip.id, { body: "Walk the old town" }, "user_owner", key);
    const conflict = await capture(trip.id, { body: "Different idea" }, "user_owner", key);
    const firstBody = await first.json<ResearchItemResponse>();
    const replayBody = await replay.json<ResearchItemResponse>();

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replayBody.researchItem.id).toBe(firstBody.researchItem.id);
    expect(conflict.status).toBe(409);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM research_items").first<{
        count: number;
      }>(),
    ).toEqual({ count: 1 });
  });

  it("tombstones a deleted capture and refuses to recreate it by replay", async () => {
    const { trip } = await createTrip();
    const key = crypto.randomUUID();
    const input = { body: "A temporary research note" };
    const created = await (
      await capture(trip.id, input, "user_owner", key)
    ).json<ResearchItemResponse>();

    const deleted = await request(
      researchItemEndpoint(trip.id, created.researchItem.id),
      "user_owner",
      { method: "DELETE", headers: { "If-Match": '"1"' } },
    );
    const replay = await capture(trip.id, input, "user_owner", key);

    expect(deleted.status).toBe(204);
    expect(replay.status).toBe(409);
    expect(
      await env.DB.prepare(
        `SELECT response_json, resource_deleted_at
         FROM research_capture_idempotency
         WHERE user_id = ? AND idempotency_key = ?`,
      )
        .bind("user_owner", key)
        .first<{ response_json: string | null; resource_deleted_at: string | null }>(),
    ).toEqual({ response_json: null, resource_deleted_at: expect.any(String) });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM research_items").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it("protects updates and deletes with strong revisions", async () => {
    const { trip } = await createTrip();
    const created = await (
      await capture(trip.id, { body: "Dinner options" })
    ).json<ResearchItemResponse>();
    const endpoint = researchItemEndpoint(trip.id, created.researchItem.id);
    const updated = await request(endpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({
        state: "shortlisted",
        category: "food",
        tripStopId: trip.stops[0].id,
        priceQuotes: [
          { amount: "125.00", currency: "EUR", unit: "couple", displayText: "€125 per couple" },
          { amount: "10.00", currency: "EUR", unit: "bottle", displayText: "€10 per bottle" },
        ],
      }),
    });
    const updatedBody = await updated.json<ResearchItemResponse>();
    const stale = await request(endpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ title: "Stale write" }),
    });
    const missingPrecondition = await request(endpoint, "user_owner", {
      method: "DELETE",
    });
    const deleted = await request(endpoint, "user_owner", {
      method: "DELETE",
      headers: { "If-Match": '"2"' },
    });

    expect(updated.status).toBe(200);
    expect(updatedBody.researchItem).toMatchObject({
      state: "shortlisted",
      category: "food",
      tripStopId: trip.stops[0].id,
      revision: 2,
    });
    expect(updatedBody.researchItem.priceQuotes).toHaveLength(2);
    expect(stale.status).toBe(409);
    expect(missingPrecondition.status).toBe(428);
    expect(deleted.status).toBe(204);
  });

  it("lets viewers read Research while concealing planner-only sources", async () => {
    const { trip } = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_viewer', 'viewer', ?)",
    )
      .bind(trip.id, new Date().toISOString())
      .run();
    const created = await (
      await capture(trip.id, {
        body: "Winery tour",
        source: { originalUrl: "https://www.ipastini.it/", visibility: "planners" },
      })
    ).json<ResearchItemResponse>();
    const viewerList = await request(tripResearchEndpoint(trip.id), "user_viewer");
    const viewerBody = await viewerList.json<ResearchListResponse>();
    const viewerMutation = await request(
      researchItemEndpoint(trip.id, created.researchItem.id),
      "user_viewer",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "If-Match": '"1"' },
        body: JSON.stringify({ state: "shortlisted" }),
      },
    );

    expect(viewerList.status).toBe(200);
    expect(viewerBody.researchItems[0]).toMatchObject({ title: "Winery tour", sources: [] });
    expect(viewerMutation.status).toBe(403);
  });

  it("shows a private source only to its capturer, including among planners", async () => {
    const { trip } = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_editor', 'editor', ?)",
    )
      .bind(trip.id, new Date().toISOString())
      .run();
    const created = await (
      await capture(
        trip.id,
        { source: { originalUrl: "https://private.example/editor-note", visibility: "private" } },
        "user_editor",
      )
    ).json<ResearchItemResponse>();

    const editor = await (
      await request(researchItemEndpoint(trip.id, created.researchItem.id), "user_editor")
    ).json<ResearchItemResponse>();
    const owner = await (
      await request(researchItemEndpoint(trip.id, created.researchItem.id), "user_owner")
    ).json<ResearchItemResponse>();
    expect(editor.researchItem.sources).toEqual([
      expect.objectContaining({ originalUrl: "https://private.example/editor-note" }),
    ]);
    expect(owner.researchItem.sources).toEqual([]);
  });

  it("rejects destinations from another trip", async () => {
    const { trip } = await createTrip();
    const { trip: other } = await createTrip("user_owner", "Another trip");
    const response = await capture(trip.id, {
      body: "Wrong destination",
      tripStopId: other.stops[0].id,
    });
    expect(response.status).toBe(422);
  });

  it("promotes explicitly to a scheduled plan and keeps reciprocal provenance", async () => {
    const { trip } = await createTrip();
    const created = await (
      await capture(trip.id, {
        title: "I Pastini winery tour",
        body: "3pm tour, one hour, €15 per adult",
        category: "activity",
        tripStopId: trip.stops[0].id,
      })
    ).json<ResearchItemResponse>();
    const endpoint = researchPlanPromotionEndpoint(trip.id, created.researchItem.id);
    const key = crypto.randomUUID();
    const promotionInput = {
      tripStopId: trip.stops[0].id,
      title: "I Pastini winery tour",
      category: "activity",
      status: "planned",
      scheduledDate: "2026-09-03",
      startTime: "15:00",
      endTime: "16:00",
      timeZone: "Europe/Rome",
      location: "I Pastini, Martina Franca",
      placeRef: null,
      priceQuotes: [
        { amount: "15.00", currency: "EUR", unit: "adult", displayText: "€15 per adult" },
      ],
      confirmationNumber: null,
      bookingUrl: "https://www.ipastini.it/",
      notes: "Explicitly reviewed from Research",
    };
    const promote = () =>
      request(endpoint, "user_owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          "If-Match": '"1"',
        },
        body: JSON.stringify(promotionInput),
      });
    const first = await promote();
    const firstBody = await first.json<ResearchPlanPromotionResponse>();
    const replay = await promote();
    const replayBody = await replay.json<ResearchPlanPromotionResponse>();

    expect(first.status).toBe(201);
    expect(firstBody.plan).toMatchObject({
      scheduledDate: "2026-09-03",
      timeZone: "Europe/Rome",
      priceQuotes: promotionInput.priceQuotes,
    });
    expect(firstBody.researchItem.promotions).toEqual([
      expect.objectContaining({ targetKind: "plan", targetId: firstBody.plan.id }),
    ]);
    expect(replay.status).toBe(200);
    expect(replayBody).toMatchObject({ idempotentReplay: true, plan: { id: firstBody.plan.id } });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trip_plans").first<{ count: number }>(),
    ).toEqual({ count: 1 });
  });

  it("allows only one target when two promotion requests race", async () => {
    const { trip } = await createTrip();
    const created = await (
      await capture(trip.id, { body: "Winery race" })
    ).json<ResearchItemResponse>();
    const input = {
      tripStopId: trip.stops[0].id,
      title: "Winery race",
      category: "activity",
      status: "planned",
      scheduledDate: "2026-09-03",
      startTime: null,
      endTime: null,
      location: null,
      confirmationNumber: null,
      bookingUrl: null,
      notes: null,
    };
    const promote = (key: string) =>
      request(researchPlanPromotionEndpoint(trip.id, created.researchItem.id), "user_owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
          "If-Match": '"1"',
        },
        body: JSON.stringify(input),
      });
    const responses = await Promise.all([
      promote(crypto.randomUUID()),
      promote(crypto.randomUUID()),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trip_plans WHERE trip_id = ?")
        .bind(trip.id)
        .first<{ count: number }>(),
    ).toEqual({ count: 1 });
  });

  it("does not promote dismissed Research and keeps Research after target deletion", async () => {
    const { trip } = await createTrip();
    const created = await (
      await capture(trip.id, { body: "Maybe winery" })
    ).json<ResearchItemResponse>();
    const itemEndpoint = researchItemEndpoint(trip.id, created.researchItem.id);
    await request(itemEndpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"1"' },
      body: JSON.stringify({ state: "dismissed" }),
    });
    const blocked = await request(
      researchPlanPromotionEndpoint(trip.id, created.researchItem.id),
      "user_owner",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": '"2"',
        },
        body: JSON.stringify({
          tripStopId: trip.stops[0].id,
          title: "Winery",
          category: "activity",
          status: "planned",
          scheduledDate: "2026-09-03",
          startTime: null,
          endTime: null,
          location: null,
          confirmationNumber: null,
          bookingUrl: null,
          notes: null,
        }),
      },
    );
    expect(blocked.status).toBe(409);

    await request(itemEndpoint, "user_owner", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "If-Match": '"2"' },
      body: JSON.stringify({ state: "inbox" }),
    });
    const promoted = await request(
      researchPlanPromotionEndpoint(trip.id, created.researchItem.id),
      "user_owner",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
          "If-Match": '"3"',
        },
        body: JSON.stringify({
          tripStopId: trip.stops[0].id,
          title: "Winery",
          category: "activity",
          status: "planned",
          scheduledDate: "2026-09-03",
          startTime: null,
          endTime: null,
          location: null,
          confirmationNumber: null,
          bookingUrl: null,
          notes: null,
        }),
      },
    );
    const promotedBody = await promoted.json<ResearchPlanPromotionResponse>();
    await request(`${tripPlansEndpoint(trip.id)}/${promotedBody.plan.id}`, "user_owner", {
      method: "DELETE",
    });
    const researchAfterDelete = await request(itemEndpoint, "user_owner");

    expect(promoted.status).toBe(201);
    expect(researchAfterDelete.status).toBe(200);
  });
});
