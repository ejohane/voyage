import { z } from "zod";

export const healthEndpoint = "/api/health" as const;
export const tripsEndpoint = "/api/trips" as const;
export const gmailIntegrationEndpoint = "/api/integrations/gmail" as const;

export function gmailConnectEndpoint() {
  return `${gmailIntegrationEndpoint}/connect` as const;
}

export function tripGmailScanEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/imports/gmail/scan` as const;
}

export function tripGmailImportEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/imports/gmail` as const;
}

export function tripEndpoint(tripId: string) {
  return `${tripsEndpoint}/${tripId}` as const;
}

export function tripTravelEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/travel` as const;
}

export function travelEndpoint(tripId: string, travelId: string) {
  return `${tripTravelEndpoint(tripId)}/${travelId}` as const;
}

export function tripStaysEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/stays` as const;
}

export function stayEndpoint(tripId: string, stayId: string) {
  return `${tripStaysEndpoint(tripId)}/${stayId}` as const;
}

export function tripPlansEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/plans` as const;
}

export function planEndpoint(tripId: string, planId: string) {
  return `${tripPlansEndpoint(tripId)}/${planId}` as const;
}

export type HealthResponse = {
  status: "ok";
  service: "voyage-api";
  environment: string;
  checkedAt: string;
};

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date in YYYY-MM-DD format.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Use a valid calendar date.");

const nullableDateSchema = dateOnlySchema.nullable();
const timeOnlySchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Use a time in HH:MM format.")
  .refine((value) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
  }, "Use a valid local time.");
const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a local date and time.")
  .refine((value) => {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (!match) return false;

    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    );
  }, "Use a valid local date and time.");

const nullableText = (maximum: number, message: string) =>
  z.string().trim().max(maximum, message).nullable();
const nullableUrlSchema = z
  .string()
  .trim()
  .url("Enter a complete booking link.")
  .max(500, "Keep the booking link under 500 characters.")
  .nullable();

const tripBaseFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a trip name.")
    .max(80, "Keep the name under 80 characters."),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
});

const tripStopFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a destination.")
    .max(160, "Keep the destination under 160 characters."),
  arrivalDate: nullableDateSchema,
  departureDate: nullableDateSchema,
});

const tripStopInputSchema = tripStopFieldsSchema
  .extend({ id: z.string().uuid().optional() })
  .superRefine((value, context) => {
    if (value.departureDate && !value.arrivalDate) {
      context.addIssue({
        code: "custom",
        message: "Choose an arrival date before the departure date.",
        path: ["departureDate"],
      });
    }

    if (value.arrivalDate && value.departureDate && value.departureDate < value.arrivalDate) {
      context.addIssue({
        code: "custom",
        message: "Departure must be on or after arrival.",
        path: ["departureDate"],
      });
    }
  });

const tripStopsInputSchema = z
  .array(tripStopInputSchema)
  .min(1, "Add at least one destination.")
  .max(20, "Keep the itinerary to 20 destinations or fewer.")
  .superRefine((stops, context) => {
    const seenIds = new Set<string>();

    stops.forEach((stop, index) => {
      if (!stop.id) return;

      if (seenIds.has(stop.id)) {
        context.addIssue({
          code: "custom",
          message: "Each destination must be unique in the itinerary.",
          path: [index, "id"],
        });
      }

      seenIds.add(stop.id);
    });
  });

const tripInputFieldsSchema = z.object({
  name: tripBaseFieldsSchema.shape.name,
  stops: tripStopsInputSchema,
});

export const createTripInputSchema = tripInputFieldsSchema;

export const updateTripInputSchema = tripInputFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const tripAccessLevelSchema = z.enum(["owner", "editor", "viewer"]);

export const tripStopSchema = tripStopFieldsSchema.extend({
  id: z.string().uuid(),
  position: z.number().int().nonnegative(),
});

export const tripSchema = tripBaseFieldsSchema.extend({
  id: z.string().uuid(),
  stops: z.array(tripStopSchema).min(1),
  accessLevel: tripAccessLevelSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const tripResponseSchema = z.object({ trip: tripSchema });
export const tripListResponseSchema = z.object({ trips: z.array(tripSchema) });

export const reservationStatusSchema = z.enum(["planning", "booked"]);
export const travelTypeSchema = z.enum(["flight", "train", "bus", "drive", "ferry", "other"]);

const travelFieldsSchema = z.object({
  type: travelTypeSchema,
  status: reservationStatusSchema,
  departureStopId: z.string().uuid().nullable(),
  arrivalStopId: z.string().uuid().nullable(),
  departureLocation: z
    .string()
    .trim()
    .min(1, "Enter a departure location.")
    .max(160, "Keep the departure location under 160 characters."),
  arrivalLocation: z
    .string()
    .trim()
    .min(1, "Enter an arrival location.")
    .max(160, "Keep the arrival location under 160 characters."),
  departureAt: localDateTimeSchema,
  arrivalAt: localDateTimeSchema.nullable(),
  carrier: nullableText(120, "Keep the carrier under 120 characters."),
  referenceNumber: nullableText(80, "Keep the route or flight number under 80 characters."),
  confirmationNumber: nullableText(120, "Keep the confirmation number under 120 characters."),
  bookingUrl: nullableUrlSchema,
  notes: nullableText(2_000, "Keep notes under 2,000 characters."),
});

export const createTravelInputSchema = travelFieldsSchema;
export const updateTravelInputSchema = travelFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const travelSchema = travelFieldsSchema.extend({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const travelResponseSchema = z.object({ travel: travelSchema });
export const travelListResponseSchema = z.object({ travel: z.array(travelSchema) });

const stayBaseFieldsSchema = z.object({
  status: reservationStatusSchema,
  tripStopId: z.string().uuid().nullable(),
  propertyName: z
    .string()
    .trim()
    .min(1, "Enter the property name.")
    .max(160, "Keep the property name under 160 characters."),
  address: z
    .string()
    .trim()
    .min(1, "Enter the address.")
    .max(300, "Keep the address under 300 characters."),
  checkInDate: dateOnlySchema,
  checkOutDate: dateOnlySchema,
  confirmationNumber: nullableText(120, "Keep the confirmation number under 120 characters."),
  bookingUrl: nullableUrlSchema,
  notes: nullableText(2_000, "Keep notes under 2,000 characters."),
});

export const stayFieldsSchema = stayBaseFieldsSchema.refine(
  (value) => value.checkOutDate >= value.checkInDate,
  {
    message: "Checkout must be on or after check-in.",
    path: ["checkOutDate"],
  },
);

export const createStayInputSchema = stayFieldsSchema.refine((value) => value.tripStopId !== null, {
  message: "Choose the destination for this stay.",
  path: ["tripStopId"],
});
export const updateStayInputSchema = stayBaseFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const staySchema = stayBaseFieldsSchema.extend({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const stayResponseSchema = z.object({ stay: staySchema });
export const stayListResponseSchema = z.object({ stays: z.array(staySchema) });

export const planCategorySchema = z.enum(["activity", "food", "event", "sightseeing", "other"]);
export const planStatusSchema = z.enum(["idea", "planned", "booked"]);

const planBaseFieldsSchema = z.object({
  tripStopId: z.string().uuid("Choose a destination."),
  title: z
    .string()
    .trim()
    .min(1, "Enter a title.")
    .max(160, "Keep the title under 160 characters."),
  category: planCategorySchema,
  status: planStatusSchema,
  scheduledDate: nullableDateSchema,
  startTime: timeOnlySchema.nullable(),
  endTime: timeOnlySchema.nullable(),
  location: nullableText(300, "Keep the location under 300 characters."),
  confirmationNumber: nullableText(120, "Keep the confirmation number under 120 characters."),
  bookingUrl: nullableUrlSchema,
  notes: nullableText(2_000, "Keep notes under 2,000 characters."),
});

function validatePlan(value: z.infer<typeof planBaseFieldsSchema>, context: z.RefinementCtx) {
  if (!value.scheduledDate && (value.startTime || value.endTime)) {
    context.addIssue({
      code: "custom",
      message: "Choose a date before adding a time.",
      path: ["scheduledDate"],
    });
  }

  if (value.endTime && !value.startTime) {
    context.addIssue({
      code: "custom",
      message: "Choose a start time before the end time.",
      path: ["endTime"],
    });
  }

  if (value.startTime && value.endTime && value.endTime < value.startTime) {
    context.addIssue({
      code: "custom",
      message: "End time must be on or after the start time.",
      path: ["endTime"],
    });
  }

  if (!value.scheduledDate && value.status !== "idea") {
    context.addIssue({
      code: "custom",
      message: "Choose a date for a planned or booked item.",
      path: ["scheduledDate"],
    });
  }

  if (value.scheduledDate && value.status === "idea") {
    context.addIssue({
      code: "custom",
      message: "Scheduled items must be planned or booked.",
      path: ["status"],
    });
  }
}

export const planFieldsSchema = planBaseFieldsSchema.superRefine(validatePlan);
export const createPlanInputSchema = planFieldsSchema;
export const updatePlanInputSchema = planBaseFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const tripPlanSchema = planBaseFieldsSchema.extend({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const planResponseSchema = z.object({ plan: tripPlanSchema });
export const planListResponseSchema = z.object({ plans: z.array(tripPlanSchema) });

export const gmailConnectionSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    email: z.string().email(),
    connectedAt: z.string(),
  }),
]);

export const gmailConnectInputSchema = z.object({
  returnTo: z
    .string()
    .startsWith("/")
    .max(500)
    .refine((value) => !value.startsWith("//"), "Use a Voyage page."),
});

export const gmailConnectResponseSchema = z.object({
  authorizationUrl: z.string().url(),
});

export const gmailCandidateSourceSchema = z.object({
  key: z.string().min(1).max(300),
  messageId: z.string().min(1).max(200),
  threadId: z.string().min(1).max(200),
  subject: z.string().max(500),
  sender: z.string().max(500),
  receivedAt: z.string(),
  messageUrl: z.string().url(),
});

const gmailCandidateBaseSchema = z.object({
  source: gmailCandidateSourceSchema,
  sources: z.array(gmailCandidateSourceSchema).min(1).max(20).optional(),
  confidence: z.enum(["high", "medium"]),
});

export const gmailTravelCandidateSchema = gmailCandidateBaseSchema.extend({
  kind: z.literal("travel"),
  input: createTravelInputSchema,
});

export const gmailStayCandidateSchema = gmailCandidateBaseSchema.extend({
  kind: z.literal("stay"),
  input: createStayInputSchema,
});

export const gmailImportCandidateSchema = z.discriminatedUnion("kind", [
  gmailTravelCandidateSchema,
  gmailStayCandidateSchema,
]);

export const gmailScanResponseSchema = z.object({
  candidates: z.array(gmailImportCandidateSchema),
  alreadyImported: z.number().int().nonnegative(),
  messagesScanned: z.number().int().nonnegative(),
  search: z.object({
    rangeStart: dateOnlySchema,
    rangeEnd: dateOnlySchema,
    windowsSearched: z.number().int().positive(),
    queriesRun: z.number().int().nonnegative(),
    limitReached: z.boolean(),
  }),
});

export const gmailImportInputSchema = z.object({
  candidates: z.array(gmailImportCandidateSchema).min(1).max(20),
});

export const gmailImportResponseSchema = z.object({
  imported: z.array(
    z.object({
      sourceKey: z.string(),
      kind: z.enum(["travel", "stay"]),
      itemId: z.string().uuid(),
    }),
  ),
  skipped: z.array(
    z.object({
      sourceKey: z.string(),
      reason: z.enum(["already_imported", "duplicate"]),
    }),
  ),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "unauthorized",
      "forbidden",
      "not_found",
      "validation_error",
      "gmail_not_connected",
      "internal_error",
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type CreateTripInput = z.infer<typeof createTripInputSchema>;
export type UpdateTripInput = z.infer<typeof updateTripInputSchema>;
export type Trip = z.infer<typeof tripSchema>;
export type TripStop = z.infer<typeof tripStopSchema>;
export type TripAccessLevel = z.infer<typeof tripAccessLevelSchema>;
export type TripListResponse = z.infer<typeof tripListResponseSchema>;
export type TripResponse = z.infer<typeof tripResponseSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type TravelType = z.infer<typeof travelTypeSchema>;
export type CreateTravelInput = z.infer<typeof createTravelInputSchema>;
export type UpdateTravelInput = z.infer<typeof updateTravelInputSchema>;
export type Travel = z.infer<typeof travelSchema>;
export type TravelResponse = z.infer<typeof travelResponseSchema>;
export type TravelListResponse = z.infer<typeof travelListResponseSchema>;
export type CreateStayInput = z.infer<typeof createStayInputSchema>;
export type UpdateStayInput = z.infer<typeof updateStayInputSchema>;
export type Stay = z.infer<typeof staySchema>;
export type StayResponse = z.infer<typeof stayResponseSchema>;
export type StayListResponse = z.infer<typeof stayListResponseSchema>;
export type PlanCategory = z.infer<typeof planCategorySchema>;
export type PlanStatus = z.infer<typeof planStatusSchema>;
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;
export type TripPlan = z.infer<typeof tripPlanSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PlanListResponse = z.infer<typeof planListResponseSchema>;
export type GmailConnection = z.infer<typeof gmailConnectionSchema>;
export type GmailConnectInput = z.infer<typeof gmailConnectInputSchema>;
export type GmailConnectResponse = z.infer<typeof gmailConnectResponseSchema>;
export type GmailCandidateSource = z.infer<typeof gmailCandidateSourceSchema>;
export type GmailTravelCandidate = z.infer<typeof gmailTravelCandidateSchema>;
export type GmailStayCandidate = z.infer<typeof gmailStayCandidateSchema>;
export type GmailImportCandidate = z.infer<typeof gmailImportCandidateSchema>;
export type GmailScanResponse = z.infer<typeof gmailScanResponseSchema>;
export type GmailImportInput = z.infer<typeof gmailImportInputSchema>;
export type GmailImportResponse = z.infer<typeof gmailImportResponseSchema>;
