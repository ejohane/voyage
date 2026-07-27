import { z } from "zod";

export const healthEndpoint = "/api/health" as const;
export const tripsEndpoint = "/api/trips" as const;
export const gmailIntegrationEndpoint = "/api/integrations/gmail" as const;
export const locationsEndpoint = "/api/locations" as const;
export const airportsEndpoint = "/api/airports" as const;
export const invitationsEndpoint = "/api/invitations" as const;

export const locationSuggestionsEndpoint = `${locationsEndpoint}/suggestions` as const;
export const resolveLocationEndpoint = `${locationsEndpoint}/resolve` as const;

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

export function tripPeopleEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/people` as const;
}

export function tripInvitationsEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/invitations` as const;
}

export function tripInvitationEndpoint(tripId: string, invitationId: string) {
  return `${tripInvitationsEndpoint(tripId)}/${invitationId}` as const;
}

export function resendTripInvitationEndpoint(tripId: string, invitationId: string) {
  return `${tripInvitationEndpoint(tripId, invitationId)}/resend` as const;
}

export function copyTripInvitationLinkEndpoint(tripId: string, invitationId: string) {
  return `${tripInvitationEndpoint(tripId, invitationId)}/link` as const;
}

export function tripMemberEndpoint(tripId: string, userId: string) {
  return `${tripPeopleEndpoint(tripId)}/${encodeURIComponent(userId)}` as const;
}

export function invitationEndpoint(token: string) {
  return `${invitationsEndpoint}/${encodeURIComponent(token)}` as const;
}

export function acceptInvitationEndpoint(token: string) {
  return `${invitationEndpoint(token)}/accept` as const;
}

export function declineInvitationEndpoint(token: string) {
  return `${invitationEndpoint(token)}/decline` as const;
}

export function tripMapEndpoint(tripId: string, locations: string[] = []) {
  const endpoint = `${tripEndpoint(tripId)}/map` as const;
  const visibleLocations = locations
    .map((location) => location.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (visibleLocations.length === 0) return endpoint;

  const search = new URLSearchParams();
  visibleLocations.forEach((location) => {
    search.append("location", location);
  });
  return `${endpoint}?${search.toString()}`;
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

export const locationKindSchema = z.enum([
  "country",
  "region",
  "city",
  "neighborhood",
  "address",
  "place",
]);

export const tripStopLocationSchema = z.object({
  provider: z.literal("google"),
  placeId: z.string().trim().min(1).max(300),
});

const tripStopFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a destination.")
    .max(160, "Keep the destination under 160 characters."),
  arrivalDate: nullableDateSchema,
  departureDate: nullableDateSchema,
  location: tripStopLocationSchema.nullable().default(null),
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

export const createInvitationInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address.")
    .max(320, "Keep the email address under 320 characters."),
});

export const tripMemberSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  role: z.enum(["Organizer", "Planner", "Traveler"]),
  accessLevel: tripAccessLevelSchema,
  joinedAt: z.string(),
});

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "revoked",
  "expired",
]);

export const tripInvitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: z.literal("Traveler"),
  status: invitationStatusSchema,
  expiresAt: z.string(),
  lastSentAt: z.string().nullable(),
  sendCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export const tripPeopleResponseSchema = z.object({
  members: z.array(tripMemberSchema),
  invitations: z.array(tripInvitationSchema),
  canManage: z.boolean(),
});

export const createInvitationResponseSchema = z.object({
  invitation: tripInvitationSchema,
  previewUrl: z.string().url().optional(),
});

export const invitationLinkResponseSchema = z.object({ invitationUrl: z.string().url() });

export const invitationSummarySchema = z.object({
  tripName: z.string(),
  destinations: z.array(z.string().min(1)).min(1),
  startDate: dateOnlySchema.nullable(),
  endDate: dateOnlySchema.nullable(),
  invitedByName: z.string().min(1),
  invitedEmail: z.string(),
  role: z.literal("Traveler"),
  status: invitationStatusSchema,
  expiresAt: z.string(),
});

export const invitationSummaryResponseSchema = z.object({ invitation: invitationSummarySchema });
export const invitationActionResponseSchema = z.object({
  tripId: z.string().uuid(),
  status: z.enum(["accepted", "declined", "already_member"]),
});

export const locationSuggestionSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  label: z.string().trim().min(1).max(160),
  primaryText: z.string().trim().min(1).max(160),
  secondaryText: z.string().trim().max(300).nullable(),
  types: z.array(z.string().trim().min(1).max(80)).max(20),
  kind: locationKindSchema,
});

export const locationSuggestionsResponseSchema = z.object({
  suggestions: z.array(locationSuggestionSchema).max(5),
});

export const resolveLocationInputSchema = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().uuid(),
});

export const resolvedLocationResponseSchema = z.object({
  location: tripStopLocationSchema,
});

export const airportSchema = z.object({
  id: z.number().int().positive(),
  ident: z.string().min(1),
  iataCode: z.string().length(3),
  icaoCode: z.string().nullable(),
  type: z.string().min(1),
  name: z.string().min(1),
  municipality: z.string().nullable(),
  isoCountry: z.string().length(2),
  isoRegion: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const airportListResponseSchema = z.object({
  airports: z.array(airportSchema).max(10),
});

export const reservationStatusSchema = z.enum(["planning", "booked"]);
export const transportationKindSchema = z.enum(["journey", "rental"]);
export const travelTypeSchema = z.enum([
  "flight",
  "train",
  "bus",
  "drive",
  "ferry",
  "car",
  "other",
]);

const travelBaseFieldsSchema = z.object({
  kind: transportationKindSchema,
  type: travelTypeSchema,
  status: reservationStatusSchema,
  departureStopId: z.string().uuid().nullable(),
  arrivalStopId: z.string().uuid().nullable(),
  departureAirportId: z.number().int().positive().nullable().optional(),
  arrivalAirportId: z.number().int().positive().nullable().optional(),
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
  vehicleDescription: nullableText(200, "Keep the vehicle description under 200 characters."),
  confirmationNumber: nullableText(120, "Keep the confirmation number under 120 characters."),
  bookingUrl: nullableUrlSchema,
  notes: nullableText(2_000, "Keep notes under 2,000 characters."),
});

function validateTransportation(
  value: z.infer<typeof travelBaseFieldsSchema>,
  context: z.RefinementCtx,
) {
  if (value.kind === "rental" && value.type !== "car") {
    context.addIssue({
      code: "custom",
      message: "Vehicle rentals must use a rental vehicle type.",
      path: ["type"],
    });
  }
  if (value.kind === "journey" && value.type === "car") {
    context.addIssue({
      code: "custom",
      message: "Car rentals must be saved as vehicle rentals.",
      path: ["kind"],
    });
  }
  if (value.kind === "rental" && !value.arrivalAt) {
    context.addIssue({
      code: "custom",
      message: "Choose a return date and time.",
      path: ["arrivalAt"],
    });
  }
}

export const travelFieldsSchema = travelBaseFieldsSchema.superRefine(validateTransportation);

export const createTravelInputSchema = travelFieldsSchema;
export const updateTravelInputSchema = travelBaseFieldsSchema
  .omit({ departureAirportId: true, arrivalAirportId: true })
  .partial()
  .extend({
    departureAirportId: z.number().int().positive().nullable().optional(),
    arrivalAirportId: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const travelSchema = travelBaseFieldsSchema
  .extend({
    id: z.string().uuid(),
    tripId: z.string().uuid(),
    departureAirportId: z.number().int().positive().nullable(),
    arrivalAirportId: z.number().int().positive().nullable(),
    departureAirport: airportSchema.nullable(),
    arrivalAirport: airportSchema.nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine(validateTransportation);

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
  eventType: z.enum(["confirmation", "schedule_change", "modification", "cancellation"]).optional(),
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
    followUpQueriesRun: z.number().int().nonnegative(),
    messagesDiscovered: z.number().int().nonnegative(),
    messagesFetched: z.number().int().nonnegative(),
    messagesReused: z.number().int().nonnegative(),
    gapsSearched: z.number().int().nonnegative(),
    rejections: z.record(z.string(), z.number().int().nonnegative()),
    limitReached: z.boolean(),
    stoppedReason: z.enum(["complete", "ranked_limit"]),
  }),
});

export const gmailScanInputSchema = z.object({
  mode: z.enum(["standard", "deep"]).default("standard"),
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
      "conflict",
      "email_mismatch",
      "expired",
      "revoked",
      "rate_limited",
      "service_unavailable",
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
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type TripMember = z.infer<typeof tripMemberSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type TripInvitation = z.infer<typeof tripInvitationSchema>;
export type TripPeopleResponse = z.infer<typeof tripPeopleResponseSchema>;
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;
export type InvitationLinkResponse = z.infer<typeof invitationLinkResponseSchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;
export type InvitationSummaryResponse = z.infer<typeof invitationSummaryResponseSchema>;
export type InvitationActionResponse = z.infer<typeof invitationActionResponseSchema>;
export type LocationKind = z.infer<typeof locationKindSchema>;
export type TripStopLocation = z.infer<typeof tripStopLocationSchema>;
export type LocationSuggestion = z.infer<typeof locationSuggestionSchema>;
export type LocationSuggestionsResponse = z.infer<typeof locationSuggestionsResponseSchema>;
export type ResolveLocationInput = z.infer<typeof resolveLocationInputSchema>;
export type ResolvedLocationResponse = z.infer<typeof resolvedLocationResponseSchema>;
export type Airport = z.infer<typeof airportSchema>;
export type AirportListResponse = z.infer<typeof airportListResponseSchema>;
export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type TransportationKind = z.infer<typeof transportationKindSchema>;
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
export type GmailScanInput = z.infer<typeof gmailScanInputSchema>;
export type GmailScanResponse = z.infer<typeof gmailScanResponseSchema>;
export type GmailImportInput = z.infer<typeof gmailImportInputSchema>;
export type GmailImportResponse = z.infer<typeof gmailImportResponseSchema>;
