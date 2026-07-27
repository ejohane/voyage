import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { getTripWorkspace, listTrips } from "./trips-repository";
import type { AuthenticateOAuthRequest, Bindings } from "./types";

const oauthSecuritySchemes = [{ type: "oauth2" as const, scopes: ["openid"] }];
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const nullableString = {
  anyOf: [{ type: "string" as const }, { type: "null" as const }],
};

const tripStopSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    name: { type: "string" as const },
    position: { type: "integer" as const, minimum: 0 },
    arrivalDate: nullableString,
    departureDate: nullableString,
  },
  required: ["id", "name", "position", "arrivalDate", "departureDate"],
  additionalProperties: false,
};

const tripSummarySchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    name: { type: "string" as const },
    startDate: nullableString,
    endDate: nullableString,
    accessLevel: { type: "string" as const, enum: ["owner", "editor", "viewer"] },
    updatedAt: { type: "string" as const },
    url: { type: "string" as const, format: "uri" },
    stops: { type: "array" as const, items: tripStopSchema },
  },
  required: ["id", "name", "startDate", "endDate", "accessLevel", "updatedAt", "url", "stops"],
  additionalProperties: false,
};

const airportSchema = {
  anyOf: [
    {
      type: "object" as const,
      properties: {
        id: { type: "integer" as const },
        iataCode: { type: "string" as const },
        icaoCode: nullableString,
        name: { type: "string" as const },
        municipality: nullableString,
        countryCode: { type: "string" as const },
      },
      required: ["id", "iataCode", "icaoCode", "name", "municipality", "countryCode"],
      additionalProperties: false,
    },
    { type: "null" as const },
  ],
};

const transportationSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    kind: { type: "string" as const, enum: ["journey", "rental"] },
    type: {
      type: "string" as const,
      enum: ["flight", "train", "bus", "drive", "ferry", "car", "other"],
    },
    status: { type: "string" as const, enum: ["planning", "booked"] },
    departureStopId: nullableString,
    arrivalStopId: nullableString,
    departureLocation: { type: "string" as const },
    arrivalLocation: { type: "string" as const },
    departureAt: { type: "string" as const },
    arrivalAt: nullableString,
    departureAirport: airportSchema,
    arrivalAirport: airportSchema,
    carrier: nullableString,
    referenceNumber: nullableString,
    vehicleDescription: nullableString,
    confirmationNumber: nullableString,
    bookingUrl: nullableString,
    notes: nullableString,
    updatedAt: { type: "string" as const },
  },
  required: [
    "id",
    "kind",
    "type",
    "status",
    "departureStopId",
    "arrivalStopId",
    "departureLocation",
    "arrivalLocation",
    "departureAt",
    "arrivalAt",
    "departureAirport",
    "arrivalAirport",
    "carrier",
    "referenceNumber",
    "vehicleDescription",
    "confirmationNumber",
    "bookingUrl",
    "notes",
    "updatedAt",
  ],
  additionalProperties: false,
};

const staySchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    status: { type: "string" as const, enum: ["planning", "booked"] },
    tripStopId: nullableString,
    propertyName: { type: "string" as const },
    address: { type: "string" as const },
    checkInDate: { type: "string" as const },
    checkOutDate: { type: "string" as const },
    confirmationNumber: nullableString,
    bookingUrl: nullableString,
    notes: nullableString,
    updatedAt: { type: "string" as const },
  },
  required: [
    "id",
    "status",
    "tripStopId",
    "propertyName",
    "address",
    "checkInDate",
    "checkOutDate",
    "confirmationNumber",
    "bookingUrl",
    "notes",
    "updatedAt",
  ],
  additionalProperties: false,
};

const planSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    tripStopId: { type: "string" as const, format: "uuid" },
    title: { type: "string" as const },
    category: {
      type: "string" as const,
      enum: ["activity", "food", "event", "sightseeing", "other"],
    },
    status: { type: "string" as const, enum: ["idea", "planned", "booked"] },
    scheduledDate: nullableString,
    startTime: nullableString,
    endTime: nullableString,
    location: nullableString,
    confirmationNumber: nullableString,
    bookingUrl: nullableString,
    notes: nullableString,
    updatedAt: { type: "string" as const },
  },
  required: [
    "id",
    "tripStopId",
    "title",
    "category",
    "status",
    "scheduledDate",
    "startTime",
    "endTime",
    "location",
    "confirmationNumber",
    "bookingUrl",
    "notes",
    "updatedAt",
  ],
  additionalProperties: false,
};

const connectionTool = {
  name: "get_connection_status",
  title: "Check Voyage connection",
  description:
    "Confirm which Voyage account is connected and whether trip reading or writing is available.",
  inputSchema: { type: "object" as const, properties: {}, additionalProperties: false },
  outputSchema: {
    type: "object" as const,
    properties: {
      accountSubject: { type: "string" as const },
      environment: { type: "string" as const, const: "staging" },
      tripDataAccess: { type: "boolean" as const, const: true },
      tripWriteAccess: { type: "boolean" as const, const: false },
    },
    required: ["accountSubject", "environment", "tripDataAccess", "tripWriteAccess"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const listTripsTool = {
  name: "list_trips",
  title: "List Voyage trips",
  description:
    "List trips the connected Voyage account can access. Use this to identify the correct trip before reading its itinerary.",
  inputSchema: {
    type: "object" as const,
    properties: {
      limit: { type: "integer" as const, minimum: 1, maximum: 100, default: 50 },
      offset: { type: "integer" as const, minimum: 0, default: 0 },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trips: { type: "array" as const, items: tripSummarySchema },
      total: { type: "integer" as const, minimum: 0 },
      offset: { type: "integer" as const, minimum: 0 },
      hasMore: { type: "boolean" as const },
    },
    required: ["trips", "total", "offset", "hasMore"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const getTripTool = {
  name: "get_trip",
  title: "Get a Voyage trip",
  description:
    "Read one Voyage trip workspace by ID, including destinations, transportation, stays, and itinerary plans. Never use this to claim a change was saved.",
  inputSchema: {
    type: "object" as const,
    properties: { tripId: { type: "string" as const, format: "uuid" } },
    required: ["tripId"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trip: tripSummarySchema,
      transportation: { type: "array" as const, items: transportationSchema },
      stays: { type: "array" as const, items: staySchema },
      plans: { type: "array" as const, items: planSchema },
    },
    required: ["trip", "transportation", "stays", "plans"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const tools = [connectionTool, listTripsTool, getTripTool];
const listTripsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
const getTripInput = z.object({ tripId: z.string().uuid() }).strict();

export function authenticationChallenge(bindings: Bindings): string {
  const metadataUrl = `${bindings.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="Connect your Voyage account to continue"`;
}

function authenticationError(bindings: Bindings) {
  return {
    content: [{ type: "text" as const, text: "Authentication required: connect Voyage." }],
    _meta: { "mcp/www_authenticate": [authenticationChallenge(bindings)] },
    isError: true,
  };
}

export function createVoyageMcpServer(
  request: Request,
  bindings: Bindings,
  authenticateOAuthRequest: AuthenticateOAuthRequest,
): McpServer {
  const server = new McpServer(
    { name: "voyage-trip-planner", version: "0.2.0-phase-1" },
    {
      instructions:
        "Read-only Voyage trip access. Call list_trips to identify a trip, then get_trip for its full workspace. Enforce the linked user's memberships. This server cannot create, update, or delete anything; never claim a proposed change was saved.",
    },
  );

  server.server.registerCapabilities({ tools: { listChanged: false } });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const tool = tools.find((candidate) => candidate.name === params.name);
    if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${params.name}`);

    const identity = await authenticateOAuthRequest(request, bindings);
    if (!identity) return authenticationError(bindings);

    if (params.name === connectionTool.name) {
      const result = {
        accountSubject: identity.subject,
        environment: "staging" as const,
        tripDataAccess: true as const,
        tripWriteAccess: false as const,
      };
      return {
        structuredContent: result,
        content: [{ type: "text", text: "Voyage is connected with read-only trip access." }],
      };
    }

    if (params.name === listTripsTool.name) {
      const parsed = listTripsInput.safeParse(params.arguments ?? {});
      if (!parsed.success) throw new McpError(ErrorCode.InvalidParams, "Invalid pagination.");

      const result = await listTrips(
        bindings.DB,
        identity.userId,
        bindings.APP_URL,
        parsed.data.limit ?? 50,
        parsed.data.offset ?? 0,
      );
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: result.trips.length
              ? `Found ${result.trips.length} of ${result.total} accessible Voyage trips.`
              : "No accessible Voyage trips found.",
          },
        ],
      };
    }

    const parsed = getTripInput.safeParse(params.arguments ?? {});
    if (!parsed.success) throw new McpError(ErrorCode.InvalidParams, "Provide a valid trip ID.");

    const result = await getTripWorkspace(
      bindings.DB,
      identity.userId,
      parsed.data.tripId,
      bindings.APP_URL,
    );
    if (!result) {
      return {
        content: [
          {
            type: "text",
            text: "Trip not found or the connected account does not have access.",
          },
        ],
        isError: true,
      };
    }

    return {
      structuredContent: result,
      content: [
        {
          type: "text",
          text: `Loaded ${result.trip.name}: ${result.trip.stops.length} destinations, ${result.transportation.length} transportation items, ${result.stays.length} stays, and ${result.plans.length} plans.`,
        },
      ],
    };
  });

  return server;
}
