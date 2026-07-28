import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createPlanInputSchema,
  createStayInputSchema,
  createTravelInputSchema,
} from "@voyage/contracts";
import { z } from "zod";
import {
  addItineraryItemsFromMcp,
  ItineraryAccessError,
  ItineraryReferenceError,
  previewItineraryItems,
} from "./itinerary-mutations";
import { requiredOAuthScopes } from "./oauth-scopes";
import {
  ConfirmationTokenError,
  createTripFromMcp,
  IdempotencyConflictError,
  previewTripCreation,
} from "./trip-mutations";
import { getTripWorkspace, listTrips } from "./trips-repository";
import type { AuthenticateOAuthRequest, Bindings } from "./types";

const oauthSecuritySchemes = [{ type: "oauth2" as const, scopes: requiredOAuthScopes }];
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
const additiveWriteAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
  idempotentHint: true,
} as const;

const nullableString = {
  anyOf: [{ type: "string" as const }, { type: "null" as const }],
};
const nullableUri = {
  anyOf: [{ type: "string" as const, format: "uri", maxLength: 500 }, { type: "null" as const }],
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

const tripCreationStopSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const, minLength: 1, maxLength: 160 },
    arrivalDate: nullableString,
    departureDate: nullableString,
  },
  required: ["name", "arrivalDate", "departureDate"],
  additionalProperties: false,
};

const tripCreationProperties = {
  name: { type: "string" as const, minLength: 1, maxLength: 80 },
  stops: {
    type: "array" as const,
    minItems: 1,
    maxItems: 20,
    items: tripCreationStopSchema,
  },
};

const tripCreationPreviewSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    startDate: nullableString,
    endDate: nullableString,
    stops: {
      type: "array" as const,
      items: {
        ...tripCreationStopSchema,
        properties: {
          ...tripCreationStopSchema.properties,
          position: { type: "integer" as const, minimum: 0 },
        },
        required: [...tripCreationStopSchema.required, "position"],
      },
    },
  },
  required: ["name", "startDate", "endDate", "stops"],
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

const itineraryTransportationInputSchema = {
  type: "object" as const,
  properties: {
    kind: { type: "string" as const, enum: ["journey", "rental"] },
    type: {
      type: "string" as const,
      enum: ["flight", "train", "bus", "drive", "ferry", "car", "other"],
    },
    status: { type: "string" as const, enum: ["planning", "booked"] },
    departureStopId: nullableString,
    arrivalStopId: nullableString,
    departureLocation: { type: "string" as const, minLength: 1, maxLength: 160 },
    arrivalLocation: { type: "string" as const, minLength: 1, maxLength: 160 },
    departureAt: {
      type: "string" as const,
      pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$",
    },
    arrivalAt: {
      anyOf: [
        {
          type: "string" as const,
          pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$",
        },
        { type: "null" as const },
      ],
    },
    carrier: nullableString,
    referenceNumber: nullableString,
    vehicleDescription: nullableString,
    confirmationNumber: nullableString,
    bookingUrl: nullableUri,
    notes: nullableString,
  },
  required: [
    "kind",
    "type",
    "status",
    "departureStopId",
    "arrivalStopId",
    "departureLocation",
    "arrivalLocation",
    "departureAt",
    "arrivalAt",
    "carrier",
    "referenceNumber",
    "vehicleDescription",
    "confirmationNumber",
    "bookingUrl",
    "notes",
  ],
  additionalProperties: false,
};

const itineraryStayInputSchema = {
  type: "object" as const,
  properties: {
    status: { type: "string" as const, enum: ["planning", "booked"] },
    tripStopId: { type: "string" as const, format: "uuid" },
    propertyName: { type: "string" as const, minLength: 1, maxLength: 160 },
    address: { type: "string" as const, minLength: 1, maxLength: 300 },
    checkInDate: { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    checkOutDate: { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    confirmationNumber: nullableString,
    bookingUrl: nullableUri,
    notes: nullableString,
  },
  required: [
    "status",
    "tripStopId",
    "propertyName",
    "address",
    "checkInDate",
    "checkOutDate",
    "confirmationNumber",
    "bookingUrl",
    "notes",
  ],
  additionalProperties: false,
};

const itineraryPlanInputSchema = {
  type: "object" as const,
  properties: {
    tripStopId: { type: "string" as const, format: "uuid" },
    title: { type: "string" as const, minLength: 1, maxLength: 160 },
    category: {
      type: "string" as const,
      enum: ["activity", "food", "event", "sightseeing", "other"],
    },
    status: { type: "string" as const, enum: ["idea", "planned", "booked"] },
    scheduledDate: {
      anyOf: [
        { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        { type: "null" as const },
      ],
    },
    startTime: {
      anyOf: [{ type: "string" as const, pattern: "^\\d{2}:\\d{2}$" }, { type: "null" as const }],
    },
    endTime: {
      anyOf: [{ type: "string" as const, pattern: "^\\d{2}:\\d{2}$" }, { type: "null" as const }],
    },
    location: nullableString,
    confirmationNumber: nullableString,
    bookingUrl: nullableUri,
    notes: nullableString,
  },
  required: [
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
  ],
  additionalProperties: false,
};

const itineraryBatchProperties = {
  tripId: { type: "string" as const, format: "uuid" },
  transportation: {
    type: "array" as const,
    maxItems: 20,
    items: itineraryTransportationInputSchema,
  },
  stays: { type: "array" as const, maxItems: 20, items: itineraryStayInputSchema },
  plans: { type: "array" as const, maxItems: 50, items: itineraryPlanInputSchema },
};

const editableTripSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    name: { type: "string" as const },
    url: { type: "string" as const, format: "uri" },
  },
  required: ["id", "name", "url"],
  additionalProperties: false,
};

const itineraryCountsSchema = {
  type: "object" as const,
  properties: {
    transportation: { type: "integer" as const, minimum: 0 },
    stays: { type: "integer" as const, minimum: 0 },
    plans: { type: "integer" as const, minimum: 0 },
    total: { type: "integer" as const, minimum: 1, maximum: 50 },
  },
  required: ["transportation", "stays", "plans", "total"],
  additionalProperties: false,
};

const itineraryProposalSchema = {
  type: "object" as const,
  properties: {
    trip: editableTripSchema,
    destinations: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          id: { type: "string" as const, format: "uuid" },
          name: { type: "string" as const },
        },
        required: ["id", "name"],
        additionalProperties: false,
      },
    },
    items: {
      type: "object" as const,
      properties: {
        transportation: itineraryBatchProperties.transportation,
        stays: itineraryBatchProperties.stays,
        plans: itineraryBatchProperties.plans,
      },
      required: ["transportation", "stays", "plans"],
      additionalProperties: false,
    },
    counts: itineraryCountsSchema,
  },
  required: ["trip", "destinations", "items", "counts"],
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
      environment: { type: "string" as const, enum: ["staging", "production"] },
      tripDataAccess: { type: "boolean" as const, const: true },
      tripWriteAccess: { type: "boolean" as const, const: true },
      itineraryWriteAccess: { type: "boolean" as const, const: true },
    },
    required: [
      "accountSubject",
      "environment",
      "tripDataAccess",
      "tripWriteAccess",
      "itineraryWriteAccess",
    ],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const previewTripTool = {
  name: "preview_trip",
  title: "Preview a new Voyage trip",
  description:
    "Validate and preview an additive-only trip proposal without saving it. Show the exact returned proposal to the user and ask for explicit confirmation before calling create_trip with the same fields and confirmation token.",
  inputSchema: {
    type: "object" as const,
    properties: tripCreationProperties,
    required: ["name", "stops"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      proposal: tripCreationPreviewSchema,
      confirmationToken: { type: "string" as const },
      confirmationExpiresAt: { type: "string" as const },
    },
    required: ["proposal", "confirmationToken", "confirmationExpiresAt"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const createTripTool = {
  name: "create_trip",
  title: "Create a Voyage trip",
  description:
    "Create one new private Voyage trip for the connected account. Call only after preview_trip and the user explicitly confirms that exact proposal. Use a new UUID idempotency key for a new user-confirmed operation; reuse it only when retrying the same operation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...tripCreationProperties,
      confirmationToken: { type: "string" as const },
      idempotencyKey: { type: "string" as const, format: "uuid" },
    },
    required: ["name", "stops", "confirmationToken", "idempotencyKey"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trip: tripSummarySchema,
      idempotentReplay: { type: "boolean" as const },
    },
    required: ["trip", "idempotentReplay"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: additiveWriteAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const previewItineraryItemsTool = {
  name: "preview_itinerary_items",
  title: "Preview additions to a Voyage itinerary",
  description:
    "Validate a mixed batch of transportation, stays, and plans for one editable Voyage trip without saving it. Use destination IDs from get_trip. Show the exact returned proposal to the user and ask for explicit confirmation before calling add_itinerary_items with unchanged fields and the confirmation token.",
  inputSchema: {
    type: "object" as const,
    properties: itineraryBatchProperties,
    required: ["tripId", "transportation", "stays", "plans"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      proposal: itineraryProposalSchema,
      confirmationToken: { type: "string" as const },
      confirmationExpiresAt: { type: "string" as const },
    },
    required: ["proposal", "confirmationToken", "confirmationExpiresAt"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: readOnlyAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const createdItemSchema = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    label: { type: "string" as const },
  },
  required: ["id", "label"],
  additionalProperties: false,
};

const addItineraryItemsTool = {
  name: "add_itinerary_items",
  title: "Add items to a Voyage itinerary",
  description:
    "Atomically add the explicitly confirmed transportation, stays, and plans to one editable private Voyage trip. Call only after preview_itinerary_items and explicit user confirmation. Use a new UUID idempotency key for a new confirmed batch and reuse it only when retrying that same operation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...itineraryBatchProperties,
      confirmationToken: { type: "string" as const },
      idempotencyKey: { type: "string" as const, format: "uuid" },
    },
    required: ["tripId", "transportation", "stays", "plans", "confirmationToken", "idempotencyKey"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trip: editableTripSchema,
      created: {
        type: "object" as const,
        properties: {
          transportation: { type: "array" as const, items: createdItemSchema },
          stays: { type: "array" as const, items: createdItemSchema },
          plans: { type: "array" as const, items: createdItemSchema },
        },
        required: ["transportation", "stays", "plans"],
        additionalProperties: false,
      },
      idempotentReplay: { type: "boolean" as const },
    },
    required: ["trip", "created", "idempotentReplay"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: additiveWriteAnnotations,
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

const tools = [
  connectionTool,
  listTripsTool,
  getTripTool,
  previewTripTool,
  createTripTool,
  previewItineraryItemsTool,
  addItineraryItemsTool,
];
const listTripsInput = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
  })
  .strict();
const getTripInput = z.object({ tripId: z.string().uuid() }).strict();
const dateOnlyInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });
const tripCreationInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    stops: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(160),
            arrivalDate: dateOnlyInput.nullable(),
            departureDate: dateOnlyInput.nullable(),
          })
          .strict()
          .superRefine((stop, context) => {
            if (stop.departureDate && !stop.arrivalDate) {
              context.addIssue({
                code: "custom",
                path: ["departureDate"],
                message: "Arrival date is required when departure date is set.",
              });
            }
            if (stop.arrivalDate && stop.departureDate && stop.departureDate < stop.arrivalDate) {
              context.addIssue({
                code: "custom",
                path: ["departureDate"],
                message: "Departure date must be on or after arrival date.",
              });
            }
          }),
      )
      .min(1)
      .max(20),
  })
  .strict();
const createTripInput = tripCreationInput.extend({
  confirmationToken: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});
const mcpTransportationInput = createTravelInputSchema.transform(
  ({ departureAirportId: _departureAirportId, arrivalAirportId: _arrivalAirportId, ...item }) =>
    item,
);
const mcpStayInput = createStayInputSchema.transform((item) => ({
  ...item,
  tripStopId: item.tripStopId as string,
}));
const itineraryItemsFields = {
  tripId: z.string().uuid(),
  transportation: z.array(mcpTransportationInput).max(20),
  stays: z.array(mcpStayInput).max(20),
  plans: z.array(createPlanInputSchema).max(50),
};
function validateItineraryItemCount(
  value: {
    transportation: unknown[];
    stays: unknown[];
    plans: unknown[];
  },
  context: z.RefinementCtx,
) {
  const total = value.transportation.length + value.stays.length + value.plans.length;
  if (total < 1 || total > 50) {
    context.addIssue({
      code: "custom",
      message: "Provide between 1 and 50 total itinerary items.",
    });
  }
}
const previewItineraryItemsInput = z
  .object(itineraryItemsFields)
  .strict()
  .superRefine(validateItineraryItemCount);
const addItineraryItemsInput = z
  .object({
    ...itineraryItemsFields,
    confirmationToken: z.string().min(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine(validateItineraryItemCount);

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
    { name: "voyage-trip-planner", version: "0.5.0-phase-2c" },
    {
      instructions:
        "Read Voyage trips with list_trips and get_trip. For a new trip, call preview_trip, show its exact proposal, obtain explicit confirmation, then call create_trip with unchanged fields, the token, and a fresh UUID idempotency key. To add transportation, stays, or plans to an existing editable trip, first call get_trip for current destination IDs, then preview_itinerary_items, show the exact mixed batch, obtain explicit confirmation, and call add_itinerary_items with unchanged fields, the token, and a fresh UUID idempotency key. All writes are additive-only; this server cannot update, delete, invite collaborators, or import Gmail data.",
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
        environment: bindings.ENVIRONMENT,
        tripDataAccess: true as const,
        tripWriteAccess: true as const,
        itineraryWriteAccess: true as const,
      };
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `Voyage ${bindings.ENVIRONMENT} is connected with trip reading, trip creation, and additive itinerary writing.`,
          },
        ],
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

    if (params.name === previewTripTool.name) {
      const parsed = tripCreationInput.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Provide a valid trip name and 1–20 ordered destinations with valid dates.",
        );
      }

      const result = await previewTripCreation(parsed.data, bindings.MCP_CONFIRMATION_SECRET);
      return {
        structuredContent: result,
        content: [
          {
            type: "text",
            text: `Preview ready for ${result.proposal.name}: ${result.proposal.stops.length} destinations from ${result.proposal.startDate ?? "unscheduled"} to ${result.proposal.endDate ?? "unscheduled"}. Show this exact proposal and ask the user to confirm before saving.`,
          },
        ],
      };
    }

    if (params.name === createTripTool.name) {
      const parsed = createTripInput.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Provide the exact previewed trip, its confirmation token, and a UUID idempotency key.",
        );
      }

      const { confirmationToken, idempotencyKey, ...tripInput } = parsed.data;
      try {
        const result = await createTripFromMcp(
          bindings.DB,
          identity.userId,
          identity.clientId,
          bindings.APP_URL,
          tripInput,
          confirmationToken,
          idempotencyKey,
          bindings.MCP_CONFIRMATION_SECRET,
        );
        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: result.idempotentReplay
                ? `This request was already completed. ${result.trip.name} is available in Voyage: ${result.trip.url}`
                : `Created ${result.trip.name} in Voyage: ${result.trip.url}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof ConfirmationTokenError || error instanceof IdempotencyConflictError) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        }
        throw error;
      }
    }

    if (params.name === previewItineraryItemsTool.name) {
      const parsed = previewItineraryItemsInput.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Provide an editable trip ID and 1–50 valid transportation, stay, or plan items.",
        );
      }

      try {
        const result = await previewItineraryItems(
          bindings.DB,
          identity.userId,
          bindings.APP_URL,
          parsed.data,
          bindings.MCP_CONFIRMATION_SECRET,
        );
        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: `Preview ready for ${result.proposal.trip.name}: ${result.proposal.counts.transportation} transportation, ${result.proposal.counts.stays} stays, and ${result.proposal.counts.plans} plans. Nothing was saved. Show this exact proposal and ask the user to confirm before saving.`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof ItineraryAccessError) {
          return { content: [{ type: "text", text: error.message }], isError: true };
        }
        if (error instanceof ItineraryReferenceError) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        }
        throw error;
      }
    }

    if (params.name === addItineraryItemsTool.name) {
      const parsed = addItineraryItemsInput.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Provide the exact previewed itinerary batch, its confirmation token, and a UUID idempotency key.",
        );
      }

      const { confirmationToken, idempotencyKey, ...itineraryInput } = parsed.data;
      try {
        const result = await addItineraryItemsFromMcp(
          bindings.DB,
          identity.userId,
          identity.clientId,
          bindings.APP_URL,
          itineraryInput,
          confirmationToken,
          idempotencyKey,
          bindings.MCP_CONFIRMATION_SECRET,
        );
        const total =
          result.created.transportation.length +
          result.created.stays.length +
          result.created.plans.length;
        return {
          structuredContent: result,
          content: [
            {
              type: "text",
              text: result.idempotentReplay
                ? `This request was already completed. The ${total} itinerary additions are in ${result.trip.name}: ${result.trip.url}`
                : `Added ${total} itinerary items to ${result.trip.name}: ${result.trip.url}`,
            },
          ],
        };
      } catch (error) {
        if (error instanceof ItineraryAccessError) {
          return { content: [{ type: "text", text: error.message }], isError: true };
        }
        if (
          error instanceof ItineraryReferenceError ||
          error instanceof ConfirmationTokenError ||
          error instanceof IdempotencyConflictError
        ) {
          throw new McpError(ErrorCode.InvalidParams, error.message);
        }
        throw error;
      }
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
