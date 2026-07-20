import {
  createTripInputSchema,
  tripResponseSchema,
  updateTripInputSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import {
  createGoogleStaticMapsClient,
  type StaticMapsClient,
  StaticMapsServiceError,
} from "./google-static-maps";
import { createTrip, getTrip, listTrips, updateTrip } from "./trips-repository";
import type { WorkerEnvironment } from "./types";

function validationError(fieldErrors?: Record<string, string[] | undefined>) {
  return {
    error: {
      code: "validation_error" as const,
      message: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        Object.entries(fieldErrors ?? {}).filter(
          (entry): entry is [string, string[]] => entry[1] !== undefined,
        ),
      ),
    },
  };
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

type TripsRoutesDependencies = {
  staticMapsClient?: StaticMapsClient;
};

export function createTripsRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: TripsRoutesDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();

  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.get("/", async (context) => {
    const trips = await listTrips(context.env.DB, context.var.authUserId);
    return context.json({ trips }, 200, { "Cache-Control": "no-store" });
  });

  routes.post("/", async (context) => {
    const payload = await readJson(context.req.raw);
    const parsed = createTripInputSchema.safeParse(payload);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    const trip = await createTrip(context.env.DB, context.var.authUserId, parsed.data);
    const response = tripResponseSchema.parse({ trip });

    return context.json(response, 201, {
      "Cache-Control": "no-store",
      Location: `/trips/${trip.id}`,
    });
  });

  routes.get("/:tripId", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    return context.json({ trip }, 200, { "Cache-Control": "no-store" });
  });

  routes.get("/:tripId/map", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    if (!dependencies.staticMapsClient && !context.env.GOOGLE_STATIC_MAPS_API_KEY) {
      return context.json(
        { error: { code: "service_unavailable" as const, message: "Trip map unavailable." } },
        503,
      );
    }

    try {
      const maps =
        dependencies.staticMapsClient ??
        createGoogleStaticMapsClient(context.env.GOOGLE_STATIC_MAPS_API_KEY);
      const map = await maps.render(trip);

      return new Response(map.body, {
        status: 200,
        headers: {
          "Content-Type": map.headers.get("Content-Type") ?? "image/png",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (error) {
      if (error instanceof StaticMapsServiceError) {
        return context.json(
          { error: { code: "service_unavailable" as const, message: "Trip map unavailable." } },
          503,
        );
      }

      throw error;
    }
  });

  routes.patch("/:tripId", async (context) => {
    const existingTrip = await getTrip(
      context.env.DB,
      context.var.authUserId,
      context.req.param("tripId"),
    );

    if (!existingTrip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    if (existingTrip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const payload = await readJson(context.req.raw);
    const parsed = updateTripInputSchema.safeParse(payload);

    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    if (parsed.data.stops) {
      const existingStopIds = new Set(existingTrip.stops.map((stop) => stop.id));
      const hasUnknownStop = parsed.data.stops.some(
        (stop) => stop.id && !existingStopIds.has(stop.id),
      );

      if (hasUnknownStop) {
        return context.json(
          validationError({ stops: ["One or more destinations no longer belong to this trip."] }),
          422,
        );
      }
    }

    const merged = createTripInputSchema.safeParse({
      name: parsed.data.name ?? existingTrip.name,
      stops:
        parsed.data.stops ??
        existingTrip.stops.map((stop) => ({
          id: stop.id,
          name: stop.name,
          arrivalDate: stop.arrivalDate,
          departureDate: stop.departureDate,
        })),
    });

    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
    }

    const trip = await updateTrip(
      context.env.DB,
      context.var.authUserId,
      context.req.param("tripId"),
      parsed.data,
    );

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    return context.json({ trip }, 200, { "Cache-Control": "no-store" });
  });

  return routes;
}
