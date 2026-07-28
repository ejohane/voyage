import { z } from "zod";
import { requiredOAuthScopes } from "./oauth-scopes";

const oauthSecuritySchemes = [{ type: "oauth2" as const, scopes: requiredOAuthScopes }];
const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;
const controlledUpdateAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
  idempotentHint: true,
} as const;

const nullableString = {
  anyOf: [{ type: "string" as const }, { type: "null" as const }],
};
const nullableUri = {
  anyOf: [{ type: "string" as const, format: "uri", maxLength: 500 }, { type: "null" as const }],
};
const dateOnlyJson = {
  anyOf: [
    { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    { type: "null" as const },
  ],
};
const localDateTimeJson = {
  anyOf: [
    { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$" },
    { type: "null" as const },
  ],
};
const timeOnlyJson = {
  anyOf: [{ type: "string" as const, pattern: "^\\d{2}:\\d{2}$" }, { type: "null" as const }],
};
const revisionJson = { type: "string" as const, minLength: 1 };

const stopFieldsJson = {
  name: { type: "string" as const, minLength: 1, maxLength: 160 },
  arrivalDate: dateOnlyJson,
  departureDate: dateOnlyJson,
};
const stopStateJson = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    position: { type: "integer" as const, minimum: 0 },
    ...stopFieldsJson,
  },
  required: ["id", "position", "name", "arrivalDate", "departureDate"],
  additionalProperties: false,
};
const tripStateJson = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    startDate: dateOnlyJson,
    endDate: dateOnlyJson,
    stops: { type: "array" as const, items: stopStateJson },
  },
  required: ["name", "startDate", "endDate", "stops"],
  additionalProperties: false,
};
const tripLinkJson = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    name: { type: "string" as const },
    url: { type: "string" as const, format: "uri" },
  },
  required: ["id", "name", "url"],
  additionalProperties: false,
};
const tripSummaryJson = {
  type: "object" as const,
  properties: {
    ...tripStateJson.properties,
    id: { type: "string" as const, format: "uuid" },
    accessLevel: { type: "string" as const, enum: ["owner", "editor", "viewer"] },
    updatedAt: revisionJson,
    url: { type: "string" as const, format: "uri" },
  },
  required: ["id", "name", "startDate", "endDate", "accessLevel", "updatedAt", "url", "stops"],
  additionalProperties: false,
};

const transportationFieldsJson = {
  kind: { type: "string" as const, enum: ["journey", "rental"] },
  type: {
    type: "string" as const,
    enum: ["flight", "train", "bus", "drive", "ferry", "car", "other"],
  },
  status: { type: "string" as const, enum: ["planning", "booked"] },
  departureStopId: {
    anyOf: [{ type: "string" as const, format: "uuid" }, { type: "null" as const }],
  },
  arrivalStopId: {
    anyOf: [{ type: "string" as const, format: "uuid" }, { type: "null" as const }],
  },
  departureLocation: { type: "string" as const, minLength: 1, maxLength: 160 },
  arrivalLocation: { type: "string" as const, minLength: 1, maxLength: 160 },
  departureAt: { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$" },
  arrivalAt: localDateTimeJson,
  carrier: nullableString,
  referenceNumber: nullableString,
  vehicleDescription: nullableString,
  confirmationNumber: nullableString,
  bookingUrl: nullableUri,
  notes: nullableString,
};
const stayFieldsJson = {
  status: { type: "string" as const, enum: ["planning", "booked"] },
  tripStopId: {
    anyOf: [{ type: "string" as const, format: "uuid" }, { type: "null" as const }],
  },
  propertyName: { type: "string" as const, minLength: 1, maxLength: 160 },
  address: { type: "string" as const, minLength: 1, maxLength: 300 },
  checkInDate: { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  checkOutDate: { type: "string" as const, pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  confirmationNumber: nullableString,
  bookingUrl: nullableUri,
  notes: nullableString,
};
const planFieldsJson = {
  tripStopId: { type: "string" as const, format: "uuid" },
  title: { type: "string" as const, minLength: 1, maxLength: 160 },
  category: {
    type: "string" as const,
    enum: ["activity", "food", "event", "sightseeing", "other"],
  },
  status: { type: "string" as const, enum: ["idea", "planned", "booked"] },
  scheduledDate: dateOnlyJson,
  startTime: timeOnlyJson,
  endTime: timeOnlyJson,
  location: nullableString,
  confirmationNumber: nullableString,
  bookingUrl: nullableUri,
  notes: nullableString,
};

function fullStateJson(properties: Record<string, unknown>) {
  return {
    type: "object" as const,
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function updateInputJson(changes: Record<string, unknown>) {
  return {
    type: "object" as const,
    properties: {
      id: { type: "string" as const, format: "uuid" },
      expectedUpdatedAt: revisionJson,
      changes: {
        type: "object" as const,
        properties: changes,
        minProperties: 1,
        additionalProperties: false,
      },
    },
    required: ["id", "expectedUpdatedAt", "changes"],
    additionalProperties: false,
  };
}

function proposedUpdateJson(fields: Record<string, unknown>) {
  return {
    type: "object" as const,
    properties: {
      id: { type: "string" as const, format: "uuid" },
      expectedUpdatedAt: revisionJson,
      before: fullStateJson(fields),
      after: fullStateJson(fields),
    },
    required: ["id", "expectedUpdatedAt", "before", "after"],
    additionalProperties: false,
  };
}

const tripUpdateProperties = {
  tripId: { type: "string" as const, format: "uuid" },
  expectedUpdatedAt: revisionJson,
  name: { type: "string" as const, minLength: 1, maxLength: 80 },
  stops: {
    type: "array" as const,
    minItems: 1,
    maxItems: 20,
    items: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const, format: "uuid" },
        ...stopFieldsJson,
      },
      required: ["id"],
      minProperties: 2,
      additionalProperties: false,
    },
  },
};

const tripUpdateProposalJson = {
  type: "object" as const,
  properties: {
    trip: tripLinkJson,
    expectedUpdatedAt: revisionJson,
    before: tripStateJson,
    after: tripStateJson,
  },
  required: ["trip", "expectedUpdatedAt", "before", "after"],
  additionalProperties: false,
};

export const previewTripUpdateTool = {
  name: "preview_trip_update",
  title: "Preview corrections to a Voyage trip",
  description:
    "Preview correction-only changes to a trip name or existing destination names and dates. Start from get_trip and pass its exact trip.updatedAt revision. This tool never adds, removes, or reorders destinations. Show the exact before/after proposal and obtain explicit confirmation before update_trip.",
  inputSchema: {
    type: "object" as const,
    properties: tripUpdateProperties,
    required: ["tripId", "expectedUpdatedAt"],
    minProperties: 3,
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      proposal: tripUpdateProposalJson,
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

export const updateTripTool = {
  name: "update_trip",
  title: "Apply confirmed corrections to a Voyage trip",
  description:
    "Overwrite selected trip or destination fields with an explicitly confirmed preview. Call only after preview_trip_update with unchanged fields and revision. Uses optimistic concurrency and will refuse stale edits. It cannot add, remove, or reorder destinations.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...tripUpdateProperties,
      confirmationToken: { type: "string" as const },
      idempotencyKey: { type: "string" as const, format: "uuid" },
    },
    required: ["tripId", "expectedUpdatedAt", "confirmationToken", "idempotencyKey"],
    minProperties: 5,
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trip: tripSummaryJson,
      idempotentReplay: { type: "boolean" as const },
    },
    required: ["trip", "idempotentReplay"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: controlledUpdateAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const itineraryUpdateProperties = {
  tripId: { type: "string" as const, format: "uuid" },
  transportation: {
    type: "array" as const,
    maxItems: 20,
    items: updateInputJson(transportationFieldsJson),
  },
  stays: { type: "array" as const, maxItems: 20, items: updateInputJson(stayFieldsJson) },
  plans: { type: "array" as const, maxItems: 50, items: updateInputJson(planFieldsJson) },
};
const countsJson = {
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
const itineraryProposalJson = {
  type: "object" as const,
  properties: {
    trip: tripLinkJson,
    updates: {
      type: "object" as const,
      properties: {
        transportation: {
          type: "array" as const,
          items: proposedUpdateJson(transportationFieldsJson),
        },
        stays: { type: "array" as const, items: proposedUpdateJson(stayFieldsJson) },
        plans: { type: "array" as const, items: proposedUpdateJson(planFieldsJson) },
      },
      required: ["transportation", "stays", "plans"],
      additionalProperties: false,
    },
    counts: countsJson,
  },
  required: ["trip", "updates", "counts"],
  additionalProperties: false,
};

export const previewItineraryUpdatesTool = {
  name: "preview_itinerary_updates",
  title: "Preview corrections to Voyage itinerary items",
  description:
    "Preview an atomic correction batch for existing transportation, stays, or plans. Start from get_trip and pass every item's exact updatedAt revision. Show the exact before/after values and obtain explicit confirmation before update_itinerary_items.",
  inputSchema: {
    type: "object" as const,
    properties: itineraryUpdateProperties,
    required: ["tripId", "transportation", "stays", "plans"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      proposal: itineraryProposalJson,
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

const updatedItemJson = {
  type: "object" as const,
  properties: {
    id: { type: "string" as const, format: "uuid" },
    label: { type: "string" as const },
    updatedAt: revisionJson,
  },
  required: ["id", "label", "updatedAt"],
  additionalProperties: false,
};

export const updateItineraryItemsTool = {
  name: "update_itinerary_items",
  title: "Apply confirmed corrections to Voyage itinerary items",
  description:
    "Atomically overwrite selected fields on existing itinerary items using an explicitly confirmed preview. Call only after preview_itinerary_updates with unchanged fields and revisions. Optimistic concurrency refuses the whole batch if any item is stale. This tool never deletes items.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...itineraryUpdateProperties,
      confirmationToken: { type: "string" as const },
      idempotencyKey: { type: "string" as const, format: "uuid" },
    },
    required: ["tripId", "transportation", "stays", "plans", "confirmationToken", "idempotencyKey"],
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      trip: tripLinkJson,
      updated: {
        type: "object" as const,
        properties: {
          transportation: { type: "array" as const, items: updatedItemJson },
          stays: { type: "array" as const, items: updatedItemJson },
          plans: { type: "array" as const, items: updatedItemJson },
        },
        required: ["transportation", "stays", "plans"],
        additionalProperties: false,
      },
      idempotentReplay: { type: "boolean" as const },
    },
    required: ["trip", "updated", "idempotentReplay"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: controlledUpdateAnnotations,
  _meta: { securitySchemes: oauthSecuritySchemes },
};

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
const timeOnly = z.string().regex(/^\d{2}:\d{2}$/);
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(500).nullable();
const nonEmptyPatch = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .strict()
    .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

const stopUpdateInput = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(160).optional(),
    arrivalDate: dateOnly.nullable().optional(),
    departureDate: dateOnly.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, "Provide a destination field to update.");

export const tripUpdateInput = z
  .object({
    tripId: z.string().uuid(),
    expectedUpdatedAt: z.string().min(1),
    name: z.string().trim().min(1).max(80).optional(),
    stops: z.array(stopUpdateInput).min(1).max(20).optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.stops !== undefined, {
    message: "Provide a trip name or at least one destination correction.",
  });

export const applyTripUpdateInput = tripUpdateInput.extend({
  confirmationToken: z.string().min(1),
  idempotencyKey: z.string().uuid(),
});

const transportationChanges = nonEmptyPatch({
  kind: z.enum(["journey", "rental"]).optional(),
  type: z.enum(["flight", "train", "bus", "drive", "ferry", "car", "other"]).optional(),
  status: z.enum(["planning", "booked"]).optional(),
  departureStopId: z.string().uuid().nullable().optional(),
  arrivalStopId: z.string().uuid().nullable().optional(),
  departureLocation: z.string().trim().min(1).max(160).optional(),
  arrivalLocation: z.string().trim().min(1).max(160).optional(),
  departureAt: localDateTime.optional(),
  arrivalAt: localDateTime.nullable().optional(),
  carrier: nullableText(120).optional(),
  referenceNumber: nullableText(80).optional(),
  vehicleDescription: nullableText(200).optional(),
  confirmationNumber: nullableText(120).optional(),
  bookingUrl: nullableUrl.optional(),
  notes: nullableText(2_000).optional(),
});
const stayChanges = nonEmptyPatch({
  status: z.enum(["planning", "booked"]).optional(),
  tripStopId: z.string().uuid().nullable().optional(),
  propertyName: z.string().trim().min(1).max(160).optional(),
  address: z.string().trim().min(1).max(300).optional(),
  checkInDate: dateOnly.optional(),
  checkOutDate: dateOnly.optional(),
  confirmationNumber: nullableText(120).optional(),
  bookingUrl: nullableUrl.optional(),
  notes: nullableText(2_000).optional(),
});
const planChanges = nonEmptyPatch({
  tripStopId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160).optional(),
  category: z.enum(["activity", "food", "event", "sightseeing", "other"]).optional(),
  status: z.enum(["idea", "planned", "booked"]).optional(),
  scheduledDate: dateOnly.nullable().optional(),
  startTime: timeOnly.nullable().optional(),
  endTime: timeOnly.nullable().optional(),
  location: nullableText(300).optional(),
  confirmationNumber: nullableText(120).optional(),
  bookingUrl: nullableUrl.optional(),
  notes: nullableText(2_000).optional(),
});

function revisioned<T extends z.ZodType>(changes: T) {
  return z
    .object({ id: z.string().uuid(), expectedUpdatedAt: z.string().min(1), changes })
    .strict();
}

const itineraryUpdateFields = {
  tripId: z.string().uuid(),
  transportation: z.array(revisioned(transportationChanges)).max(20),
  stays: z.array(revisioned(stayChanges)).max(20),
  plans: z.array(revisioned(planChanges)).max(50),
};
function validateItemCount(
  value: { transportation: unknown[]; stays: unknown[]; plans: unknown[] },
  context: z.RefinementCtx,
) {
  const total = value.transportation.length + value.stays.length + value.plans.length;
  if (total < 1 || total > 50) {
    context.addIssue({
      code: "custom",
      message: "Provide between 1 and 50 itinerary corrections.",
    });
  }
}

export const itineraryUpdatesInput = z
  .object(itineraryUpdateFields)
  .strict()
  .superRefine(validateItemCount);
export const applyItineraryUpdatesInput = z
  .object({
    ...itineraryUpdateFields,
    confirmationToken: z.string().min(1),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .superRefine(validateItemCount);
