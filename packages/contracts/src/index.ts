import { z } from "zod";

export const healthEndpoint = "/api/health" as const;
export const tripsEndpoint = "/api/trips" as const;
export const apiV1Endpoint = "/api/v1" as const;
export const v1TripsEndpoint = `${apiV1Endpoint}/trips` as const;
export const v1LocationsEndpoint = `${apiV1Endpoint}/locations` as const;
export const v1GmailIntegrationEndpoint = `${apiV1Endpoint}/integrations/gmail` as const;
export const gmailIntegrationEndpoint = "/api/integrations/gmail" as const;
export const locationsEndpoint = "/api/locations" as const;
export const airportsEndpoint = "/api/airports" as const;
export const invitationsEndpoint = "/api/invitations" as const;

export const locationSuggestionsEndpoint = `${locationsEndpoint}/suggestions` as const;
export const resolveLocationEndpoint = `${locationsEndpoint}/resolve` as const;
export const v1LocationSuggestionsEndpoint = `${v1LocationsEndpoint}/suggestions` as const;
export const v1ResolveLocationEndpoint = `${v1LocationsEndpoint}/resolve` as const;

export function gmailConnectEndpoint() {
  return `${gmailIntegrationEndpoint}/connect` as const;
}

export function v1GmailConnectEndpoint() {
  return `${v1GmailIntegrationEndpoint}/connect` as const;
}

export function tripGmailScanEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/imports/gmail/scan` as const;
}

export function tripGmailImportEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/imports/gmail` as const;
}

export function v1TripGmailScanEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/imports/gmail/scan` as const;
}

export function v1TripGmailImportEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/imports/gmail` as const;
}

export function tripEndpoint(tripId: string) {
  return `${tripsEndpoint}/${tripId}` as const;
}

export function v1TripEndpoint(tripId: string) {
  return `${v1TripsEndpoint}/${tripId}` as const;
}

export function v1TripWorkspaceEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/workspace` as const;
}

export function v1TripBriefingEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/briefing` as const;
}

export function v1TripPeopleEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/people` as const;
}

export function v1TripPlansEndpoint(tripId: string) {
  return `${v1TripEndpoint(tripId)}/plans` as const;
}

export function v1PlanEndpoint(tripId: string, planId: string) {
  return `${v1TripPlansEndpoint(tripId)}/${planId}` as const;
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

export function stayPropertyBackfillEndpoint(tripId: string) {
  return `${tripStaysEndpoint(tripId)}/property-backfill` as const;
}

export function stayEndpoint(tripId: string, stayId: string) {
  return `${tripStaysEndpoint(tripId)}/${stayId}` as const;
}

export function stayPropertyEndpoint(tripId: string, stayId: string) {
  return `${stayEndpoint(tripId, stayId)}/property` as const;
}

export function stayPropertyPhotoEndpoint(tripId: string, stayId: string) {
  return `${stayPropertyEndpoint(tripId, stayId)}/photo` as const;
}

export function tripPlansEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/plans` as const;
}

export function planEndpoint(tripId: string, planId: string) {
  return `${tripPlansEndpoint(tripId)}/${planId}` as const;
}

export function tripResearchEndpoint(tripId: string) {
  return `${tripEndpoint(tripId)}/research` as const;
}

export function researchItemEndpoint(tripId: string, researchItemId: string) {
  return `${tripResearchEndpoint(tripId)}/${researchItemId}` as const;
}

export function researchPlanPromotionEndpoint(tripId: string, researchItemId: string) {
  return `${researchItemEndpoint(tripId, researchItemId)}/promotions/plan` as const;
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

export const timeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "Use a valid IANA time zone.");

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

export const placeRefSchema = z.object({
  provider: z.literal("google"),
  placeId: z.string().trim().min(1).max(300),
});

export const tripStopLocationSchema = placeRefSchema;

export const moneyQuoteUnitSchema = z.enum([
  "total",
  "person",
  "adult",
  "child",
  "couple",
  "night",
  "bottle",
  "other",
]);

export const moneyQuoteSchema = z.object({
  amount: z
    .string()
    .regex(/^\d+(?:\.\d{1,3})?$/, "Use a positive decimal amount without a currency symbol."),
  currency: z.string().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
  unit: moneyQuoteUnitSchema,
  displayText: z.string().trim().min(1).max(160),
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

export const voyageApiV1SchemaVersion = 1 as const;
const apiV1RevisionSchema = z.string().regex(/^[a-f0-9]{64}$/);
const apiV1EnvelopeSchema = z.object({
  schemaVersion: z.literal(voyageApiV1SchemaVersion),
  generatedAt: z.string().datetime(),
});

export const v1TripListResponseSchema = apiV1EnvelopeSchema.extend({
  revision: apiV1RevisionSchema,
  trips: z.array(tripSchema),
});

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

export const v1TripPeopleResponseSchema = apiV1EnvelopeSchema.extend({
  members: z.array(tripMemberSchema),
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
  departureTimeZone: timeZoneSchema.nullable().optional(),
  arrivalTimeZone: timeZoneSchema.nullable().optional(),
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

// Native v1 is intentionally frozen while the web/API surface gains provenance fields.
// Strip the additive time-zone fields so an enriched canonical record cannot silently alter v1.
export const v1TravelSchema = travelSchema.transform(
  ({ departureTimeZone: _departureTimeZone, arrivalTimeZone: _arrivalTimeZone, ...travel }) =>
    travel,
);

export const stayPropertyRefSchema = placeRefSchema;

export const stayAmenitySchema = z.enum([
  "wifi",
  "breakfast",
  "parking",
  "pool",
  "spa",
  "gym",
  "pets",
  "restaurant",
]);

export const stayBookingDetailsSchema = z.object({
  checkInWindow: nullableText(120, "Keep the check-in window under 120 characters."),
  checkOutWindow: nullableText(120, "Keep the checkout window under 120 characters."),
  roomType: nullableText(200, "Keep the room type under 200 characters."),
  guestSummary: nullableText(200, "Keep the guest summary under 200 characters."),
  mealPlan: nullableText(200, "Keep the meal plan under 200 characters."),
  cancellationSummary: nullableText(500, "Keep the cancellation summary under 500 characters."),
  cancellationDeadline: nullableDateSchema,
  totalPriceText: nullableText(120, "Keep the total price under 120 characters."),
  amenities: z.array(stayAmenitySchema).max(8),
});

const optionalStayEnrichmentSchema = z.object({
  propertyRef: stayPropertyRefSchema.nullable().optional(),
  bookingDetails: stayBookingDetailsSchema.nullable().optional(),
});

const stayBaseFieldsSchema = z
  .object({
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
  })
  .extend(optionalStayEnrichmentSchema.shape);

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

export const staySchema = stayBaseFieldsSchema
  .omit({ propertyRef: true, bookingDetails: true })
  .extend({
    propertyRef: stayPropertyRefSchema.nullable(),
    bookingDetails: stayBookingDetailsSchema.nullable(),
    id: z.string().uuid(),
    tripId: z.string().uuid(),
    createdAt: z.string(),
    updatedAt: z.string(),
  });

export const stayResponseSchema = z.object({ stay: staySchema });
export const stayListResponseSchema = z.object({ stays: z.array(staySchema) });

export const stayPropertyPhotoSchema = z.object({
  attributionDisplayName: z.string().nullable(),
  attributionUri: z.string().url().nullable(),
  googleMapsUri: z.string().url(),
});

export const stayPropertySchema = z.object({
  provider: z.literal("google"),
  placeId: z.string().min(1),
  displayName: z.string().min(1),
  formattedAddress: z.string().min(1),
  primaryType: z.string().nullable(),
  primaryTypeDisplayName: z.string().nullable(),
  websiteUri: z.string().url().nullable(),
  nationalPhoneNumber: z.string().nullable(),
  internationalPhoneNumber: z.string().nullable(),
  rating: z.number().min(0).max(5).nullable(),
  userRatingCount: z.number().int().nonnegative().nullable(),
  googleMapsUri: z.string().url(),
  hasPhoto: z.boolean(),
  photo: stayPropertyPhotoSchema.nullable(),
});

export const stayPropertyResponseSchema = z.object({ property: stayPropertySchema });

export const stayPropertyBackfillInputSchema = z.object({ apply: z.boolean().default(false) });
export const stayPropertyBackfillResultSchema = z.object({
  stayId: z.string().uuid(),
  propertyName: z.string(),
  address: z.string(),
  status: z.enum(["matched", "unmatched", "failed"]),
  placeId: z.string().nullable(),
});
export const stayPropertyBackfillResponseSchema = z.object({
  mode: z.enum(["dry-run", "apply"]),
  scanned: z.number().int().nonnegative(),
  matched: z.number().int().nonnegative(),
  unmatched: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  results: z.array(stayPropertyBackfillResultSchema).max(50),
});

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
  timeZone: timeZoneSchema.nullable().optional(),
  location: nullableText(300, "Keep the location under 300 characters."),
  placeRef: placeRefSchema.nullable().optional(),
  priceQuotes: z.array(moneyQuoteSchema).max(10).optional(),
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

const v1PlanBaseFieldsSchema = planBaseFieldsSchema.omit({
  timeZone: true,
  placeRef: true,
  priceQuotes: true,
});

export const v1CreateScheduledPlanInputSchema = v1PlanBaseFieldsSchema
  .strict()
  .superRefine(validatePlan)
  .refine((value) => value.scheduledDate !== null && value.status !== "idea", {
    message: "Native trip plans must have a date and a planned or booked status.",
    path: ["scheduledDate"],
  });

export const v1UpdateScheduledPlanInputSchema = v1PlanBaseFieldsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const tripPlanSchema = planBaseFieldsSchema.extend({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const planResponseSchema = z.object({ plan: tripPlanSchema });
export const planListResponseSchema = z.object({ plans: z.array(tripPlanSchema) });

export const v1ScheduledPlanSchema = v1PlanBaseFieldsSchema
  .extend({
    id: z.string().uuid(),
    tripId: z.string().uuid(),
    scheduledDate: dateOnlySchema,
    status: z.enum(["planned", "booked"]),
    revision: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .superRefine(validatePlan);

export const v1PlanResponseSchema = z.object({ plan: v1ScheduledPlanSchema });

export const v1TripWorkspaceResponseSchema = apiV1EnvelopeSchema.extend({
  revision: apiV1RevisionSchema,
  trip: tripSchema,
  travel: z.array(v1TravelSchema),
  stays: z.array(staySchema),
  plans: z.array(v1ScheduledPlanSchema),
});

export const briefingProvenanceSchema = z.enum(["booked", "estimated", "needs_attention"]);

const briefingItemBaseSchema = z.object({
  id: z.string().min(1).max(200),
});

export const briefingFlightArrivalItemSchema = briefingItemBaseSchema.extend({
  kind: z.literal("flight_arrival"),
  provenance: z.literal("booked"),
  sourceTravelId: z.string().uuid(),
  arrivalAt: localDateTimeSchema,
  airport: z.object({
    id: z.number().int().positive(),
    iataCode: z.string().length(3),
    name: z.string().min(1).max(200),
    municipality: z.string().max(160).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  carrier: z.string().max(120).nullable(),
  referenceNumber: z.string().max(80).nullable(),
});

export const briefingRentalPickupItemSchema = briefingItemBaseSchema.extend({
  kind: z.literal("rental_pickup"),
  provenance: z.literal("booked"),
  sourceTravelId: z.string().uuid(),
  pickupAt: localDateTimeSchema,
  pickupLocation: z.string().min(1).max(160),
  company: z.string().max(120).nullable(),
  confirmationNumber: z.string().max(120).nullable(),
});

export const briefingDriveEstimateItemSchema = briefingItemBaseSchema.extend({
  kind: z.literal("drive_estimate"),
  provenance: z.literal("estimated"),
  originLabel: z.string().min(1).max(300),
  destinationLabel: z.string().min(1).max(300),
  durationMinutes: z.number().int().positive(),
  distanceMeters: z.number().int().nonnegative().nullable(),
  estimateKind: z.literal("traffic_unaware"),
  attribution: z.literal("Google Maps"),
  directionsUrl: z.string().url(),
});

export const briefingStayArrivalItemSchema = briefingItemBaseSchema.extend({
  kind: z.literal("stay_arrival"),
  provenance: z.literal("booked"),
  sourceStayId: z.string().uuid(),
  propertyName: z.string().min(1).max(160),
  address: z.string().min(1).max(300),
  checkInDate: dateOnlySchema,
  checkInWindow: z.string().max(120).nullable(),
});

export const briefingItemSchema = z.discriminatedUnion("kind", [
  briefingFlightArrivalItemSchema,
  briefingRentalPickupItemSchema,
  briefingDriveEstimateItemSchema,
  briefingStayArrivalItemSchema,
]);

export const briefingIssueSchema = z.object({
  id: z.string().min(1).max(200),
  code: z.enum([
    "ambiguous_flight",
    "ambiguous_stay",
    "stay_location_unresolved",
    "route_unavailable",
  ]),
  provenance: z.literal("needs_attention"),
});

export const arrivalBriefingSectionSchema = z.object({
  id: z.string().min(1).max(200),
  kind: z.literal("arrival"),
  date: dateOnlySchema,
  items: z.array(briefingItemSchema).min(1).max(4),
  issues: z.array(briefingIssueSchema).max(4),
});

export const v1TripBriefingResponseSchema = apiV1EnvelopeSchema.extend({
  revision: apiV1RevisionSchema,
  generatorVersion: z.literal("arrival-v1"),
  inputFingerprint: apiV1RevisionSchema,
  sections: z.array(arrivalBriefingSectionSchema).max(1),
  issues: z.array(briefingIssueSchema).max(4),
});

export const gmailConnectionSchema = z.discriminatedUnion("connected", [
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    email: z.string().email(),
    connectedAt: z.string(),
  }),
]);

export const gmailConnectInputSchema = z
  .object({
    client: z.enum(["web", "ios"]).default("web"),
    returnTo: z
      .string()
      .startsWith("/")
      .max(500)
      .refine((value) => !value.startsWith("//"), "Use a Voyage page.")
      .optional(),
    tripId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.client === "web" && !value.returnTo) {
      context.addIssue({
        code: "custom",
        path: ["returnTo"],
        message: "Choose a Voyage page.",
      });
    }
    if (value.client === "ios" && !value.tripId) {
      context.addIssue({
        code: "custom",
        path: ["tripId"],
        message: "Choose a trip.",
      });
    }
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

export const researchStateSchema = z.enum(["inbox", "considering", "shortlisted", "dismissed"]);

export const researchCategorySchema = z.enum([
  "place",
  "activity",
  "food",
  "stay",
  "transportation",
  "logistics",
  "other",
]);

export const sourceArtifactKindSchema = z.enum([
  "url",
  "file",
  "pasted_text",
  "email",
  "provider_document",
]);
export const sourceArtifactVisibilitySchema = z.enum(["private", "planners", "trip"]);
export const sourceArtifactProcessingStateSchema = z.enum([
  "captured",
  "queued",
  "processing",
  "ready",
  "partial",
  "failed",
  "unsupported",
]);

const optionalSourceUrlSchema = z.string().trim().url().max(2_048).nullable();

export const captureResearchSourceSchema = z.object({
  kind: sourceArtifactKindSchema.default("url"),
  provider: z.string().trim().min(1).max(100).nullable().default(null),
  externalId: z.string().trim().min(1).max(500).nullable().default(null),
  originalUrl: optionalSourceUrlSchema,
  capturedTitle: z.string().trim().min(1).max(500).nullable().default(null),
  siteName: z.string().trim().min(1).max(200).nullable().default(null),
  visibility: sourceArtifactVisibilitySchema.default("planners"),
});

const researchItemInputFieldsSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().max(10_000).nullable().default(null),
  state: researchStateSchema.default("inbox"),
  category: researchCategorySchema.nullable().default(null),
  tripStopId: z.string().uuid().nullable().default(null),
  placeRef: placeRefSchema.nullable().default(null),
  attribution: z.string().trim().min(1).max(500).nullable().default(null),
  priceQuotes: z.array(moneyQuoteSchema).max(10).default([]),
});

export const createResearchItemInputSchema = researchItemInputFieldsSchema
  .extend({ source: captureResearchSourceSchema.optional() })
  .superRefine((value, context) => {
    if (value.title || value.body || value.source?.originalUrl) return;
    context.addIssue({
      code: "custom",
      message: "Add a note or link.",
      path: ["body"],
    });
  });

export const updateResearchItemInputSchema = researchItemInputFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const sourceArtifactVersionSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  mimeType: z.string().max(200).nullable(),
  byteLength: z.number().int().nonnegative().nullable(),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  normalizedContentHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
  capturedAt: z.string(),
});

export const sourceArtifactSchema = z.object({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  kind: sourceArtifactKindSchema,
  provider: z.string().nullable(),
  externalId: z.string().nullable(),
  originalUrl: optionalSourceUrlSchema,
  canonicalUrl: optionalSourceUrlSchema,
  capturedTitle: z.string().nullable(),
  siteName: z.string().nullable(),
  visibility: sourceArtifactVisibilitySchema,
  processingState: sourceArtifactProcessingStateSchema,
  capturedByUserId: z.string(),
  latestVersion: sourceArtifactVersionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const researchPromotionSummarySchema = z.object({
  id: z.string().uuid(),
  targetKind: z.enum(["research", "plan", "stay", "travel"]),
  targetId: z.string().uuid(),
  targetState: z.enum(["scheduled", "unscheduled", "missing"]),
  promotedAt: z.string(),
});

export const researchItemSchema = researchItemInputFieldsSchema.omit({ title: true }).extend({
  id: z.string().uuid(),
  tripId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  sources: z.array(sourceArtifactSchema),
  promotions: z.array(researchPromotionSummarySchema),
  createdByUserId: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const researchItemResponseSchema = z.object({ researchItem: researchItemSchema });
export const researchListResponseSchema = z.object({
  researchItems: z.array(researchItemSchema),
  nextCursor: z.string().nullable(),
});

export const researchListQuerySchema = z.object({
  state: researchStateSchema.optional(),
  category: researchCategorySchema.optional(),
  tripStopId: z.string().uuid().optional(),
  cursor: z.string().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const researchPlanPromotionInputSchema = createPlanInputSchema.refine(
  (value) => value.scheduledDate !== null && value.status !== "idea",
  {
    message: "Choose a date and planned or booked status before promotion.",
    path: ["scheduledDate"],
  },
);
export const researchPlanPromotionResponseSchema = z.object({
  researchItem: researchItemSchema,
  plan: tripPlanSchema,
  idempotentReplay: z.boolean(),
});

export const extractionRunStatusSchema = z.enum([
  "queued",
  "processing",
  "completed",
  "partial",
  "failed",
]);
export const candidateReviewStateSchema = z.enum([
  "pending",
  "accepted",
  "dismissed",
  "superseded",
]);
export const candidateIssueCodeSchema = z.enum([
  "missing_required_field",
  "ambiguous_date",
  "ambiguous_location",
  "conflicting_evidence",
  "suspected_duplicate",
  "unsupported_value",
]);
export const candidateAttentionIssueSchema = z.object({
  code: candidateIssueCodeSchema,
  severity: z.enum(["warning", "blocking"]),
  fieldPath: z.string().max(300).optional(),
  message: z.string().trim().min(1).max(500),
  evidenceIds: z.array(z.string().uuid()).max(50).default([]),
});

export const candidateTemporalValueSchema = z.object({
  localValue: z.string().trim().min(1).max(100),
  timeZone: timeZoneSchema.nullable(),
  precision: z.enum(["exact", "approximate", "inferred"]),
  rawText: z.string().trim().min(1).max(500),
});

const candidateResearchPayloadSchema = z.object({
  kind: z.literal("research"),
  fields: researchItemInputFieldsSchema.partial().extend({
    title: z.string().trim().min(1).max(200),
  }),
});
const candidateTravelPayloadSchema = z.object({
  kind: z.literal("travel"),
  fields: travelBaseFieldsSchema.partial(),
  departureTemporal: candidateTemporalValueSchema.optional(),
  arrivalTemporal: candidateTemporalValueSchema.optional(),
});
const candidateStayPayloadSchema = z.object({
  kind: z.literal("stay"),
  fields: stayBaseFieldsSchema.partial(),
});
const candidatePlanPayloadSchema = z.object({
  kind: z.literal("plan"),
  fields: planBaseFieldsSchema.partial(),
});

export const artifactCandidatePayloadSchema = z.discriminatedUnion("kind", [
  candidateResearchPayloadSchema,
  candidateTravelPayloadSchema,
  candidateStayPayloadSchema,
  candidatePlanPayloadSchema,
]);

export const candidateEvidenceSchema = z.object({
  id: z.string().uuid(),
  artifactVersionId: z.string().uuid(),
  fieldPath: z.string().max(300).nullable(),
  excerpt: z.string().trim().min(1).max(2_000),
  locator: z.record(z.string(), z.unknown()),
  confidence: z.number().min(0).max(1).nullable(),
  createdAt: z.string(),
});

export const artifactCandidateSchema = z.object({
  id: z.string().uuid(),
  extractionRunId: z.string().uuid(),
  candidateKey: z.string().trim().min(1).max(300),
  payload: artifactCandidatePayloadSchema,
  payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
  confidence: z.number().min(0).max(1),
  dedupeKey: z.string().max(500).nullable(),
  suggestedTripStopId: z.string().uuid().nullable(),
  missingFields: z.array(z.string().max(300)).max(100),
  attentionIssues: z.array(candidateAttentionIssueSchema).max(100),
  reviewState: candidateReviewStateSchema,
  evidence: z.array(candidateEvidenceSchema),
  revision: z.number().int().positive(),
  reviewedByUserId: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const candidatePromotionTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("research"),
    input: researchItemInputFieldsSchema.extend({
      title: z.string().trim().min(1).max(200),
    }),
  }),
  z.object({ kind: z.literal("travel"), input: createTravelInputSchema }),
  z.object({ kind: z.literal("stay"), input: createStayInputSchema }),
  z.object({ kind: z.literal("plan"), input: researchPlanPromotionInputSchema }),
]);

export const candidatePromotionReviewSchema = z.object({
  target: candidatePromotionTargetSchema,
  resolvedBlockingIssues: z.array(z.number().int().nonnegative()).max(100).default([]),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      "unauthorized",
      "forbidden",
      "not_found",
      "validation_error",
      "gmail_not_connected",
      "gmail_reauthorization_required",
      "conflict",
      "email_mismatch",
      "expired",
      "revoked",
      "rate_limited",
      "precondition_required",
      "service_unavailable",
      "internal_error",
    ]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
    currentRevision: z.number().int().positive().optional(),
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
export type V1TripListResponse = z.infer<typeof v1TripListResponseSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationInputSchema>;
export type TripMember = z.infer<typeof tripMemberSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type TripInvitation = z.infer<typeof tripInvitationSchema>;
export type TripPeopleResponse = z.infer<typeof tripPeopleResponseSchema>;
export type V1TripPeopleResponse = z.infer<typeof v1TripPeopleResponseSchema>;
export type CreateInvitationResponse = z.infer<typeof createInvitationResponseSchema>;
export type InvitationLinkResponse = z.infer<typeof invitationLinkResponseSchema>;
export type InvitationSummary = z.infer<typeof invitationSummarySchema>;
export type InvitationSummaryResponse = z.infer<typeof invitationSummaryResponseSchema>;
export type InvitationActionResponse = z.infer<typeof invitationActionResponseSchema>;
export type LocationKind = z.infer<typeof locationKindSchema>;
export type PlaceRef = z.infer<typeof placeRefSchema>;
export type TimeZone = z.infer<typeof timeZoneSchema>;
export type MoneyQuoteUnit = z.infer<typeof moneyQuoteUnitSchema>;
export type MoneyQuote = z.infer<typeof moneyQuoteSchema>;
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
export type StayPropertyRef = z.infer<typeof stayPropertyRefSchema>;
export type StayAmenity = z.infer<typeof stayAmenitySchema>;
export type StayBookingDetails = z.infer<typeof stayBookingDetailsSchema>;
export type Stay = z.infer<typeof staySchema>;
export type StayResponse = z.infer<typeof stayResponseSchema>;
export type StayListResponse = z.infer<typeof stayListResponseSchema>;
export type StayProperty = z.infer<typeof stayPropertySchema>;
export type StayPropertyResponse = z.infer<typeof stayPropertyResponseSchema>;
export type StayPropertyBackfillInput = z.infer<typeof stayPropertyBackfillInputSchema>;
export type StayPropertyBackfillResponse = z.infer<typeof stayPropertyBackfillResponseSchema>;
export type PlanCategory = z.infer<typeof planCategorySchema>;
export type PlanStatus = z.infer<typeof planStatusSchema>;
export type CreatePlanInput = z.infer<typeof createPlanInputSchema>;
export type UpdatePlanInput = z.infer<typeof updatePlanInputSchema>;
export type TripPlan = z.infer<typeof tripPlanSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type PlanListResponse = z.infer<typeof planListResponseSchema>;
export type V1CreateScheduledPlanInput = z.infer<typeof v1CreateScheduledPlanInputSchema>;
export type V1UpdateScheduledPlanInput = z.infer<typeof v1UpdateScheduledPlanInputSchema>;
export type V1ScheduledPlan = z.infer<typeof v1ScheduledPlanSchema>;
export type V1PlanResponse = z.infer<typeof v1PlanResponseSchema>;
export type V1TripWorkspaceResponse = z.infer<typeof v1TripWorkspaceResponseSchema>;
export type BriefingProvenance = z.infer<typeof briefingProvenanceSchema>;
export type BriefingFlightArrivalItem = z.infer<typeof briefingFlightArrivalItemSchema>;
export type BriefingRentalPickupItem = z.infer<typeof briefingRentalPickupItemSchema>;
export type BriefingDriveEstimateItem = z.infer<typeof briefingDriveEstimateItemSchema>;
export type BriefingStayArrivalItem = z.infer<typeof briefingStayArrivalItemSchema>;
export type BriefingItem = z.infer<typeof briefingItemSchema>;
export type BriefingIssue = z.infer<typeof briefingIssueSchema>;
export type ArrivalBriefingSection = z.infer<typeof arrivalBriefingSectionSchema>;
export type V1TripBriefingResponse = z.infer<typeof v1TripBriefingResponseSchema>;
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
export type ResearchState = z.infer<typeof researchStateSchema>;
export type ResearchCategory = z.infer<typeof researchCategorySchema>;
export type SourceArtifactKind = z.infer<typeof sourceArtifactKindSchema>;
export type SourceArtifactVisibility = z.infer<typeof sourceArtifactVisibilitySchema>;
export type SourceArtifactProcessingState = z.infer<typeof sourceArtifactProcessingStateSchema>;
export type CaptureResearchSource = z.infer<typeof captureResearchSourceSchema>;
export type CreateResearchItemRequest = z.input<typeof createResearchItemInputSchema>;
export type CreateResearchItemInput = z.infer<typeof createResearchItemInputSchema>;
export type UpdateResearchItemInput = z.infer<typeof updateResearchItemInputSchema>;
export type SourceArtifactVersion = z.infer<typeof sourceArtifactVersionSchema>;
export type SourceArtifact = z.infer<typeof sourceArtifactSchema>;
export type ResearchPromotionSummary = z.infer<typeof researchPromotionSummarySchema>;
export type ResearchItem = z.infer<typeof researchItemSchema>;
export type ResearchItemResponse = z.infer<typeof researchItemResponseSchema>;
export type ResearchListResponse = z.infer<typeof researchListResponseSchema>;
export type ResearchListQuery = z.infer<typeof researchListQuerySchema>;
export type ResearchPlanPromotionInput = z.infer<typeof researchPlanPromotionInputSchema>;
export type ResearchPlanPromotionResponse = z.infer<typeof researchPlanPromotionResponseSchema>;
export type ExtractionRunStatus = z.infer<typeof extractionRunStatusSchema>;
export type CandidateReviewState = z.infer<typeof candidateReviewStateSchema>;
export type CandidateIssueCode = z.infer<typeof candidateIssueCodeSchema>;
export type CandidateAttentionIssue = z.infer<typeof candidateAttentionIssueSchema>;
export type CandidateTemporalValue = z.infer<typeof candidateTemporalValueSchema>;
export type ArtifactCandidatePayload = z.infer<typeof artifactCandidatePayloadSchema>;
export type CandidateEvidence = z.infer<typeof candidateEvidenceSchema>;
export type ArtifactCandidate = z.infer<typeof artifactCandidateSchema>;
export type CandidatePromotionTarget = z.infer<typeof candidatePromotionTargetSchema>;
export type CandidatePromotionReview = z.infer<typeof candidatePromotionReviewSchema>;
