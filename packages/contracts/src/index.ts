import { z } from "zod";

export const healthEndpoint = "/api/health" as const;
export const tripsEndpoint = "/api/trips" as const;

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
const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Use a local date and time.")
  .refine((value) => {
    const [dateValue, timeValue] = value.split("T");
    const [year, month, day] = dateValue.split("-").map(Number);
    const [hour, minute] = timeValue.split(":").map(Number);
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

const tripFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a trip name.")
    .max(80, "Keep the name under 80 characters."),
  destination: z
    .string()
    .trim()
    .min(1, "Enter a destination.")
    .max(160, "Keep the destination under 160 characters."),
  startDate: nullableDateSchema,
  endDate: nullableDateSchema,
});

function validateDateRange(
  value: { startDate?: string | null; endDate?: string | null },
  context: z.RefinementCtx,
) {
  if (value.endDate && !value.startDate) {
    context.addIssue({
      code: "custom",
      message: "Choose a start date before the end date.",
      path: ["endDate"],
    });
  }

  if (value.startDate && value.endDate && value.endDate < value.startDate) {
    context.addIssue({
      code: "custom",
      message: "End date must be on or after the start date.",
      path: ["endDate"],
    });
  }
}

export const createTripInputSchema = tripFieldsSchema.superRefine(validateDateRange);

export const updateTripInputSchema = tripFieldsSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.")
  .superRefine((value, context) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: "custom",
        message: "End date must be on or after the start date.",
        path: ["endDate"],
      });
    }
  });

export const tripAccessLevelSchema = z.enum(["owner", "editor", "viewer"]);

export const tripSchema = tripFieldsSchema.extend({
  id: z.string().uuid(),
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

const stayFieldsSchema = stayBaseFieldsSchema.refine(
  (value) => value.checkOutDate >= value.checkInDate,
  {
    message: "Checkout must be on or after check-in.",
    path: ["checkOutDate"],
  },
);

export const createStayInputSchema = stayFieldsSchema;
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

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(["unauthorized", "forbidden", "not_found", "validation_error", "internal_error"]),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type CreateTripInput = z.infer<typeof createTripInputSchema>;
export type UpdateTripInput = z.infer<typeof updateTripInputSchema>;
export type Trip = z.infer<typeof tripSchema>;
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
