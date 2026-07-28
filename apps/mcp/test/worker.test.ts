import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVoyageMcpWorker } from "../src";
import type { AuthenticateOAuthRequest, Bindings } from "../src/types";

const bindings: Bindings = {
  DB: env.DB,
  ENVIRONMENT: "staging",
  APP_URL: "https://voyageplan.app",
  MCP_RESOURCE_URL: "https://mcp-staging.voyageplan.app",
  CLERK_AUTHORIZATION_SERVER: "https://example.clerk.accounts.dev",
  CLERK_JWT_KEY: "test-public-key",
  MCP_CONFIRMATION_SECRET: "test-confirmation-secret",
};

const context = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

function mcpRequest(method: string, params: Record<string, unknown> = {}, id = 1): Request {
  return new Request("https://mcp-staging.voyageplan.app/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

const tripId = "11111111-1111-4111-8111-111111111111";
const hiddenTripId = "22222222-2222-4222-8222-222222222222";
const stopId = "33333333-3333-4333-8333-333333333333";

async function seedTrips() {
  const now = "2026-07-27T12:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO trips
          (id, name, destination, start_date, end_date, created_by_user_id, created_at, updated_at)
         VALUES (?, 'Japan', 'Tokyo', '2026-10-01', '2026-10-08', 'user_123', ?, ?)`,
    ).bind(tripId, now, now),
    env.DB.prepare(
      `INSERT INTO trips
          (id, name, destination, start_date, end_date, created_by_user_id, created_at, updated_at)
         VALUES (?, 'Hidden', 'Oslo', NULL, NULL, 'user_other', ?, ?)`,
    ).bind(hiddenTripId, now, now),
    env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_123', 'owner', ?)",
    ).bind(tripId, now),
    env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, 'user_other', 'owner', ?)",
    ).bind(hiddenTripId, now),
    env.DB.prepare(
      `INSERT INTO trip_stops
          (id, trip_id, name, position, arrival_date, departure_date, created_at, updated_at)
         VALUES (?, ?, 'Tokyo', 0, '2026-10-01', '2026-10-08', ?, ?)`,
    ).bind(stopId, tripId, now, now),
    env.DB.prepare(
      `INSERT INTO travel_segments
          (id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
           departure_location, arrival_location, departure_at, arrival_at, carrier,
           reference_number, confirmation_number, booking_url, notes,
           created_by_user_id, created_at, updated_at)
         VALUES ('44444444-4444-4444-8444-444444444444', ?, 'journey', 'flight', 'booked',
           NULL, ?, 'Chicago', 'Tokyo', '2026-10-01T10:00', '2026-10-02T14:00',
           'Test Air', 'TA123', 'CONFIRM', 'https://example.com/booking', 'Window seat',
           'user_123', ?, ?)`,
    ).bind(tripId, stopId, now, now),
    env.DB.prepare(
      `INSERT INTO stays
          (id, trip_id, status, trip_stop_id, property_name, address, check_in_date,
           check_out_date, confirmation_number, booking_url, notes, created_by_user_id,
           created_at, updated_at)
         VALUES ('55555555-5555-4555-8555-555555555555', ?, 'booked', ?, 'Tokyo Hotel',
           '1 Tokyo Way', '2026-10-02', '2026-10-08', 'STAY123', NULL, NULL,
           'user_123', ?, ?)`,
    ).bind(tripId, stopId, now, now),
    env.DB.prepare(
      `INSERT INTO trip_plans
          (id, trip_id, trip_stop_id, title, category, status, scheduled_date,
           start_time, end_time, location, confirmation_number, booking_url, notes,
           created_by_user_id, created_at, updated_at)
         VALUES ('66666666-6666-4666-8666-666666666666', ?, ?, 'Sushi dinner', 'food',
           'planned', '2026-10-03', '19:00', '21:00', 'Ginza', NULL, NULL, 'Counter seats',
           'user_123', ?, ?)`,
    ).bind(tripId, stopId, now, now),
  ]);
}

describe("Voyage Phase 2A MCP worker", () => {
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
  });

  it("publishes protected resource metadata for the OpenID grant", async () => {
    const worker = createVoyageMcpWorker(async () => null);
    const response = await worker.fetch(
      new Request("https://mcp-staging.voyageplan.app/.well-known/oauth-protected-resource"),
      bindings,
      context,
    );

    await expect(response.json()).resolves.toEqual({
      resource: bindings.MCP_RESOURCE_URL,
      authorization_servers: [bindings.CLERK_AUTHORIZATION_SERVER],
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://voyageplan.app",
    });
  });

  it("initializes and advertises read tools plus an additive idempotent write", async () => {
    const authenticate = vi.fn<AuthenticateOAuthRequest>(async () => null);
    const worker = createVoyageMcpWorker(authenticate);

    const initializeResponse = await worker.fetch(
      mcpRequest("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "voyage-test", version: "1.0.0" },
      }),
      bindings,
      context,
    );
    const initialize = (await initializeResponse.json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(initialize.result.serverInfo.name).toBe("voyage-trip-planner");

    const listResponse = await worker.fetch(mcpRequest("tools/list"), bindings, context);
    const list = (await listResponse.json()) as {
      result: {
        tools: Array<{
          name: string;
          annotations: Record<string, boolean>;
          securitySchemes: unknown[];
        }>;
      };
    };

    expect(list.result.tools.map((tool) => tool.name)).toEqual([
      "get_connection_status",
      "list_trips",
      "get_trip",
      "preview_trip",
      "create_trip",
    ]);
    for (const tool of list.result.tools.slice(0, 4)) {
      expect(tool).toMatchObject({
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          openWorldHint: false,
        },
        securitySchemes: [{ type: "oauth2", scopes: ["openid"] }],
      });
    }
    expect(list.result.tools[4]).toMatchObject({
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
        idempotentHint: true,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["openid"] }],
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("challenges ChatGPT's empty OAuth discovery probe", async () => {
    const worker = createVoyageMcpWorker(async () => null);
    const response = await worker.fetch(
      new Request("https://mcp-staging.voyageplan.app/mcp", {
        method: "POST",
        headers: {
          Accept: "*/*",
          "Content-Length": "0",
          "Content-Type": "application/octet-stream",
        },
      }),
      bindings,
      context,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `${bindings.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`,
    );
    await expect(response.json()).resolves.toEqual({
      error: "unauthorized",
      error_description: "Connect your Voyage account to continue",
    });
  });

  it("returns an MCP OAuth challenge instead of account data when unauthenticated", async () => {
    const worker = createVoyageMcpWorker(async () => null);
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_connection_status", arguments: {} }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { isError: boolean; _meta: Record<string, string[]> };
    };

    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain(
      `${bindings.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`,
    );
  });

  it("reports additive trip creation access for the linked account", async () => {
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_connection_status", arguments: {} }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(body.result.structuredContent).toEqual({
      accountSubject: "user_123",
      environment: "staging",
      tripDataAccess: true,
      tripWriteAccess: true,
    });
  });

  it("lists only trips where the linked account is a member", async () => {
    await seedTrips();
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "list_trips", arguments: {} }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(body.result.structuredContent).toMatchObject({
      total: 1,
      offset: 0,
      hasMore: false,
      trips: [
        {
          id: tripId,
          name: "Japan",
          accessLevel: "owner",
          url: `${bindings.APP_URL}/trips/${tripId}`,
          stops: [{ id: stopId, name: "Tokyo", position: 0 }],
        },
      ],
    });
  });

  it("reads the complete workspace for an accessible trip", async () => {
    await seedTrips();
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_trip", arguments: { tripId } }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(body.result.structuredContent).toMatchObject({
      trip: { id: tripId, name: "Japan" },
      transportation: [
        {
          type: "flight",
          carrier: "Test Air",
          referenceNumber: "TA123",
          confirmationNumber: "CONFIRM",
        },
      ],
      stays: [{ propertyName: "Tokyo Hotel", confirmationNumber: "STAY123" }],
      plans: [{ title: "Sushi dinner", scheduledDate: "2026-10-03" }],
    });
  });

  it("previews without writing, then creates and audits the confirmed trip atomically", async () => {
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const proposal = {
      name: "  Portugal 2027  ",
      stops: [
        {
          name: " Lisbon ",
          arrivalDate: "2027-04-02",
          departureDate: "2027-04-06",
        },
        {
          name: "Porto",
          arrivalDate: "2027-04-06",
          departureDate: "2027-04-10",
        },
      ],
    };

    const previewResponse = await worker.fetch(
      mcpRequest("tools/call", { name: "preview_trip", arguments: proposal }),
      bindings,
      context,
    );
    const previewBody = (await previewResponse.json()) as {
      result: {
        structuredContent: {
          proposal: Record<string, unknown>;
          confirmationToken: string;
        };
      };
    };

    expect(previewBody.result.structuredContent.proposal).toEqual({
      name: "Portugal 2027",
      startDate: "2027-04-02",
      endDate: "2027-04-10",
      stops: [
        {
          name: "Lisbon",
          position: 0,
          arrivalDate: "2027-04-02",
          departureDate: "2027-04-06",
        },
        {
          name: "Porto",
          position: 1,
          arrivalDate: "2027-04-06",
          departureDate: "2027-04-10",
        },
      ],
    });
    expect(previewBody.result.structuredContent.confirmationToken).toMatch(
      /^voyage-create-trip-v1:\d{13}:[a-f0-9]{64}$/,
    );
    await expect(env.DB.prepare("SELECT count(*) AS count FROM trips").first()).resolves.toEqual({
      count: 0,
    });

    const createArguments = {
      ...proposal,
      confirmationToken: previewBody.result.structuredContent.confirmationToken,
      idempotencyKey: "77777777-7777-4777-8777-777777777777",
    };
    const createResponse = await worker.fetch(
      mcpRequest("tools/call", { name: "create_trip", arguments: createArguments }),
      bindings,
      context,
    );
    const createBody = (await createResponse.json()) as {
      result: {
        structuredContent: {
          trip: { id: string; name: string; stops: Array<{ name: string }> };
          idempotentReplay: boolean;
        };
      };
    };
    const createdTripId = createBody.result.structuredContent.trip.id;

    expect(createBody.result.structuredContent).toMatchObject({
      trip: {
        name: "Portugal 2027",
        startDate: "2027-04-02",
        endDate: "2027-04-10",
        accessLevel: "owner",
        url: `${bindings.APP_URL}/trips/${createdTripId}`,
        stops: [{ name: "Lisbon" }, { name: "Porto" }],
      },
      idempotentReplay: false,
    });
    await expect(
      env.DB.prepare(
        `SELECT user_id, access_level
           FROM trip_memberships
           WHERE trip_id = ?`,
      )
        .bind(createdTripId)
        .first(),
    ).resolves.toEqual({ user_id: "user_123", access_level: "owner" });
    await expect(
      env.DB.prepare(
        `SELECT user_id, oauth_client_id, tool_name, idempotency_key, status,
                  resource_type, resource_id
           FROM mcp_mutations
           WHERE resource_id = ?`,
      )
        .bind(createdTripId)
        .first(),
    ).resolves.toEqual({
      user_id: "user_123",
      oauth_client_id: "dynamic_client_123",
      tool_name: "create_trip",
      idempotency_key: createArguments.idempotencyKey,
      status: "succeeded",
      resource_type: "trip",
      resource_id: createdTripId,
    });

    const replayResponse = await worker.fetch(
      mcpRequest("tools/call", { name: "create_trip", arguments: createArguments }),
      bindings,
      context,
    );
    const replayBody = (await replayResponse.json()) as {
      result: {
        structuredContent: {
          trip: { id: string };
          idempotentReplay: boolean;
        };
      };
    };
    expect(replayBody.result.structuredContent).toEqual({
      trip: createBody.result.structuredContent.trip,
      idempotentReplay: true,
    });
    await expect(env.DB.prepare("SELECT count(*) AS count FROM trips").first()).resolves.toEqual({
      count: 1,
    });
    await expect(
      env.DB.prepare("SELECT count(*) AS count FROM mcp_mutations").first(),
    ).resolves.toEqual({ count: 1 });
  });

  it("rejects a changed proposal token and an idempotency key reused for another trip", async () => {
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const firstProposal = {
      name: "Iceland",
      stops: [
        {
          name: "Reykjavik",
          arrivalDate: "2027-06-01",
          departureDate: "2027-06-05",
        },
      ],
    };
    const firstPreviewResponse = await worker.fetch(
      mcpRequest("tools/call", { name: "preview_trip", arguments: firstProposal }),
      bindings,
      context,
    );
    const firstPreview = (await firstPreviewResponse.json()) as {
      result: { structuredContent: { confirmationToken: string } };
    };
    const idempotencyKey = "88888888-8888-4888-8888-888888888888";

    const tamperedResponse = await worker.fetch(
      mcpRequest("tools/call", {
        name: "create_trip",
        arguments: {
          ...firstProposal,
          name: "Changed after preview",
          confirmationToken: firstPreview.result.structuredContent.confirmationToken,
          idempotencyKey,
        },
      }),
      bindings,
      context,
    );
    const tamperedBody = (await tamperedResponse.json()) as { error: { message: string } };
    expect(tamperedBody.error.message).toContain("no longer matches");
    await expect(env.DB.prepare("SELECT count(*) AS count FROM trips").first()).resolves.toEqual({
      count: 0,
    });

    await worker.fetch(
      mcpRequest("tools/call", {
        name: "create_trip",
        arguments: {
          ...firstProposal,
          confirmationToken: firstPreview.result.structuredContent.confirmationToken,
          idempotencyKey,
        },
      }),
      bindings,
      context,
    );

    const secondProposal = {
      ...firstProposal,
      name: "Norway",
      stops: [{ ...firstProposal.stops[0], name: "Oslo" }],
    };
    const secondPreviewResponse = await worker.fetch(
      mcpRequest("tools/call", { name: "preview_trip", arguments: secondProposal }),
      bindings,
      context,
    );
    const secondPreview = (await secondPreviewResponse.json()) as {
      result: { structuredContent: { confirmationToken: string } };
    };
    const conflictResponse = await worker.fetch(
      mcpRequest("tools/call", {
        name: "create_trip",
        arguments: {
          ...secondProposal,
          confirmationToken: secondPreview.result.structuredContent.confirmationToken,
          idempotencyKey,
        },
      }),
      bindings,
      context,
    );
    const conflictBody = (await conflictResponse.json()) as { error: { message: string } };

    expect(conflictBody.error.message).toContain("already used for a different trip");
    await expect(env.DB.prepare("SELECT count(*) AS count FROM trips").first()).resolves.toEqual({
      count: 1,
    });
  });

  it("does not reveal whether an inaccessible trip exists", async () => {
    await seedTrips();
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid"],
    }));
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_trip", arguments: { tripId: hiddenTripId } }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { isError: boolean; content: Array<{ text: string }> };
    };

    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toBe(
      "Trip not found or the connected account does not have access.",
    );
  });
});
