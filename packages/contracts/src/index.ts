import { z } from "zod";

export const healthEndpoint = "/api/health" as const;
export const tripsEndpoint = "/api/trips" as const;

export function tripEndpoint(tripId: string) {
  return `${tripsEndpoint}/${tripId}` as const;
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
