import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoyageMcpWorker } from "../src";
import type { Bindings } from "../src/types";

const bindings: Bindings = {
  DB: env.DB,
  ENVIRONMENT: "staging",
  APP_URL: "https://voyageplan.app",
  MCP_RESOURCE_URL: "https://mcp-staging.voyageplan.app",
  CLERK_AUTHORIZATION_SERVER: "https://example.clerk.accounts.dev",
  CLERK_JWT_KEY: "test-public-key",
  MCP_CONFIRMATION_SECRET: "test-confirmation-secret",
  MCP_RATE_LIMITER: env.MCP_RATE_LIMITER,
};
const context = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
  props: {},
} as unknown as ExecutionContext;
const tripId = "11111111-1111-4111-8111-111111111111";
const stopId = "33333333-3333-4333-8333-333333333333";
const travelId = "44444444-4444-4444-8444-444444444444";
const stayId = "55555555-5555-4555-8555-555555555555";
const planId = "66666666-6666-4666-8666-666666666666";
const initialRevision = "2026-07-27T12:00:00.000Z";

function request(name: string, args: Record<string, unknown>) {
  return new Request(`${bindings.MCP_RESOURCE_URL}/mcp`, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
}

const authenticate = async () => ({
  userId: "user_123",
  subject: "user_123",
  clientId: "dynamic_client_123",
  scopes: ["openid"],
});

async function call(name: string, args: Record<string, unknown>) {
  const worker = createVoyageMcpWorker(authenticate);
  const response = await worker.fetch(request(name, args), bindings, context);
  return response.json() as Promise<{
    result?: {
      structuredContent?: Record<string, unknown>;
      content?: Array<{ text: string }>;
      isError?: boolean;
    };
    error?: { message: string };
  }>;
}

async function seed() {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO trips
        (id, name, destination, start_date, end_date, created_by_user_id, created_at, updated_at)
       VALUES (?, 'Japan', 'Tokyo', '2026-10-01', '2026-10-08', 'user_123', ?, ?)`,
    ).bind(tripId, initialRevision, initialRevision),
    env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_123', 'owner', ?)",
    ).bind(tripId, initialRevision),
    env.DB.prepare(
      `INSERT INTO trip_stops
        (id, trip_id, name, position, arrival_date, departure_date, created_at, updated_at)
       VALUES (?, ?, 'Tokyo', 0, '2026-10-01', '2026-10-08', ?, ?)`,
    ).bind(stopId, tripId, initialRevision, initialRevision),
    env.DB.prepare(
      `INSERT INTO travel_segments
        (id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
         departure_location, arrival_location, departure_at, arrival_at, carrier,
         reference_number, vehicle_description, confirmation_number, booking_url, notes,
         created_by_user_id, created_at, updated_at)
       VALUES (?, ?, 'journey', 'flight', 'planning', NULL, ?, 'Chicago', 'Tokyo',
         '2026-10-01T10:00', '2026-10-02T14:00', 'Test Air', 'TA123', NULL,
         NULL, NULL, NULL, 'user_123', ?, ?)`,
    ).bind(travelId, tripId, stopId, initialRevision, initialRevision),
    env.DB.prepare(
      `INSERT INTO stays
        (id, trip_id, status, trip_stop_id, property_name, address, check_in_date,
         check_out_date, confirmation_number, booking_url, notes, created_by_user_id,
         created_at, updated_at)
       VALUES (?, ?, 'planning', ?, 'Tokyo Hotel', '1 Tokyo Way', '2026-10-02',
         '2026-10-08', NULL, NULL, NULL, 'user_123', ?, ?)`,
    ).bind(stayId, tripId, stopId, initialRevision, initialRevision),
    env.DB.prepare(
      `INSERT INTO trip_plans
        (id, trip_id, trip_stop_id, title, category, status, scheduled_date,
         start_time, end_time, location, confirmation_number, booking_url, notes,
         created_by_user_id, created_at, updated_at)
       VALUES (?, ?, ?, 'Sushi dinner', 'food', 'planned', '2026-10-03', '19:00',
         '21:00', 'Ginza', NULL, NULL, NULL, 'user_123', ?, ?)`,
    ).bind(planId, tripId, stopId, initialRevision, initialRevision),
  ]);
}

describe("Voyage Phase 3 controlled updates", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM mcp_mutations"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
    await seed();
  });

  it("previews, confirms, audits, and idempotently replays a trip correction", async () => {
    const proposal = {
      tripId,
      expectedUpdatedAt: initialRevision,
      name: "Japan Anniversary",
      stops: [{ id: stopId, departureDate: "2026-10-09" }],
    };
    const preview = await call("preview_trip_update", proposal);
    const previewContent = preview.result?.structuredContent as {
      proposal: {
        before: { name: string; endDate: string };
        after: { name: string; endDate: string };
      };
      confirmationToken: string;
    };
    expect(previewContent.proposal).toMatchObject({
      before: { name: "Japan", endDate: "2026-10-08" },
      after: { name: "Japan Anniversary", endDate: "2026-10-09" },
    });

    const args = {
      ...proposal,
      confirmationToken: previewContent.confirmationToken,
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
    };
    const applied = await call("update_trip", args);
    expect(applied.result?.structuredContent).toMatchObject({
      trip: { name: "Japan Anniversary", endDate: "2026-10-09" },
      idempotentReplay: false,
    });
    await expect(
      env.DB.prepare("SELECT name, end_date FROM trips WHERE id = ?").bind(tripId).first(),
    ).resolves.toEqual({ name: "Japan Anniversary", end_date: "2026-10-09" });
    await expect(
      env.DB.prepare("SELECT tool_name, resource_type FROM mcp_mutations").first(),
    ).resolves.toEqual({ tool_name: "update_trip", resource_type: "trip" });

    const replay = await call("update_trip", args);
    expect(replay.result?.structuredContent).toMatchObject({ idempotentReplay: true });
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM mcp_mutations").first(),
    ).resolves.toEqual({ count: 1 });
  });

  it("refuses a stale trip revision without partially writing", async () => {
    const proposal = { tripId, expectedUpdatedAt: initialRevision, name: "Stale name" };
    const preview = await call("preview_trip_update", proposal);
    const previewContent = preview.result?.structuredContent as { confirmationToken: string };
    expect(previewContent).toBeDefined();
    const token = previewContent.confirmationToken;
    await env.DB.prepare("UPDATE trips SET updated_at = ? WHERE id = ?")
      .bind("2026-07-28T13:00:00.000Z", tripId)
      .run();
    const applied = await call("update_trip", {
      ...proposal,
      confirmationToken: token,
      idempotencyKey: "88888888-8888-4888-8888-888888888888",
    });
    expect(applied.error?.message).toContain("changed since it was read");
    await expect(
      env.DB.prepare("SELECT name FROM trips WHERE id = ?").bind(tripId).first(),
    ).resolves.toEqual({ name: "Japan" });
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM mcp_mutations").first(),
    ).resolves.toEqual({ count: 0 });
  });

  it("atomically corrects mixed itinerary items and records one audit", async () => {
    const proposal = {
      tripId,
      transportation: [
        { id: travelId, expectedUpdatedAt: initialRevision, changes: { status: "booked" } },
      ],
      stays: [
        {
          id: stayId,
          expectedUpdatedAt: initialRevision,
          changes: { propertyName: "Ginza Hotel" },
        },
      ],
      plans: [
        { id: planId, expectedUpdatedAt: initialRevision, changes: { title: "Omakase dinner" } },
      ],
    };
    const preview = await call("preview_itinerary_updates", proposal);
    const previewContent = preview.result?.structuredContent as {
      proposal: { counts: { total: number } };
      confirmationToken: string;
    };
    expect(previewContent.proposal.counts.total).toBe(3);
    const applied = await call("update_itinerary_items", {
      ...proposal,
      confirmationToken: previewContent.confirmationToken,
      idempotencyKey: "99999999-9999-4999-8999-999999999999",
    });
    expect(applied.result?.structuredContent).toMatchObject({
      updated: {
        transportation: [{ id: travelId }],
        stays: [{ id: stayId, label: "Ginza Hotel" }],
        plans: [{ id: planId, label: "Omakase dinner" }],
      },
      idempotentReplay: false,
    });
    await expect(
      env.DB.prepare("SELECT status FROM travel_segments WHERE id = ?").bind(travelId).first(),
    ).resolves.toEqual({ status: "booked" });
    await expect(
      env.DB.prepare("SELECT property_name FROM stays WHERE id = ?").bind(stayId).first(),
    ).resolves.toEqual({ property_name: "Ginza Hotel" });
    await expect(
      env.DB.prepare("SELECT title FROM trip_plans WHERE id = ?").bind(planId).first(),
    ).resolves.toEqual({ title: "Omakase dinner" });
    await expect(
      env.DB.prepare("SELECT tool_name, resource_type FROM mcp_mutations").first(),
    ).resolves.toEqual({
      tool_name: "update_itinerary_items",
      resource_type: "trip_itinerary_update_batch",
    });
  });

  it("refuses the whole mixed batch when one item becomes stale", async () => {
    const proposal = {
      tripId,
      transportation: [
        { id: travelId, expectedUpdatedAt: initialRevision, changes: { status: "booked" } },
      ],
      stays: [],
      plans: [
        { id: planId, expectedUpdatedAt: initialRevision, changes: { title: "Changed title" } },
      ],
    };
    const preview = await call("preview_itinerary_updates", proposal);
    const previewContent = preview.result?.structuredContent as { confirmationToken: string };
    expect(previewContent).toBeDefined();
    const token = previewContent.confirmationToken;
    await env.DB.prepare("UPDATE trip_plans SET updated_at = ? WHERE id = ?")
      .bind("2026-07-28T13:00:00.000Z", planId)
      .run();
    const applied = await call("update_itinerary_items", {
      ...proposal,
      confirmationToken: token,
      idempotencyKey: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(applied.error?.message).toContain("changed since it was read");
    await expect(
      env.DB.prepare("SELECT status FROM travel_segments WHERE id = ?").bind(travelId).first(),
    ).resolves.toEqual({ status: "planning" });
    await expect(
      env.DB.prepare("SELECT title FROM trip_plans WHERE id = ?").bind(planId).first(),
    ).resolves.toEqual({ title: "Sushi dinner" });
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM mcp_mutations").first(),
    ).resolves.toEqual({ count: 0 });
  });
});
