import {
  createPlanInputSchema,
  createStayInputSchema,
  createTravelInputSchema,
  planFieldsSchema,
  stayFieldsSchema,
  stayPropertyBackfillInputSchema,
  stayPropertyBackfillResponseSchema,
  stayPropertyResponseSchema,
  updatePlanInputSchema,
  updateStayInputSchema,
  updateTravelInputSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { airportsExist } from "./airport-repository";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import { createGooglePlacesClient, type PlacesClient, PlacesServiceError } from "./google-places";
import {
  applyStayPropertyMatch,
  createPlan,
  createStay,
  createTravel,
  deletePlan,
  deleteStay,
  deleteTravel,
  getPlan,
  getStay,
  getTravel,
  listPlans,
  listStays,
  listTravel,
  updatePlan,
  updateStay,
  updateTravel,
} from "./planning-repository";
import { getTrip } from "./trips-repository";
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

function tripHasStop(trip: { stops: { id: string }[] }, stopId: string | null) {
  return stopId === null || trip.stops.some((stop) => stop.id === stopId);
}

type PlanningRouteDependencies = {
  placesClient?: PlacesClient;
};

function propertyUnavailableError() {
  return {
    error: {
      code: "internal_error" as const,
      message: "Property details are temporarily unavailable.",
    },
  };
}

export function createPlanningRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: PlanningRouteDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();

  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.get("/:tripId/travel", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    return context.json({ travel: await listTravel(context.env.DB, tripId) }, 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.post("/:tripId/travel", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const parsed = createTravelInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    if (
      !tripHasStop(trip, parsed.data.departureStopId) ||
      !tripHasStop(trip, parsed.data.arrivalStopId)
    ) {
      return context.json(
        validationError({ departureStopId: ["Choose destinations from this trip."] }),
        422,
      );
    }
    if (
      !(await airportsExist(context.env.DB, [
        parsed.data.departureAirportId,
        parsed.data.arrivalAirportId,
      ]))
    ) {
      return context.json(
        validationError({ departureAirportId: ["Choose airports from the airport catalog."] }),
        422,
      );
    }

    const travel = await createTravel(context.env.DB, tripId, context.var.authUserId, parsed.data);
    return context.json({ travel }, 201, { "Cache-Control": "no-store" });
  });

  routes.patch("/:tripId/travel/:travelId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const existing = await getTravel(context.env.DB, tripId, context.req.param("travelId"));
    if (!existing) {
      return context.json(
        { error: { code: "not_found" as const, message: "Travel item not found." } },
        404,
      );
    }

    const parsed = updateTravelInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    const merged = createTravelInputSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
    }
    if (
      !tripHasStop(trip, merged.data.departureStopId) ||
      !tripHasStop(trip, merged.data.arrivalStopId)
    ) {
      return context.json(
        validationError({ departureStopId: ["Choose destinations from this trip."] }),
        422,
      );
    }
    if (
      !(await airportsExist(context.env.DB, [
        merged.data.departureAirportId,
        merged.data.arrivalAirportId,
      ]))
    ) {
      return context.json(
        validationError({ departureAirportId: ["Choose airports from the airport catalog."] }),
        422,
      );
    }

    const travel = await updateTravel(
      context.env.DB,
      tripId,
      context.req.param("travelId"),
      parsed.data,
    );
    return context.json({ travel }, 200, { "Cache-Control": "no-store" });
  });

  routes.delete("/:tripId/travel/:travelId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const deleted = await deleteTravel(context.env.DB, tripId, context.req.param("travelId"));
    return deleted
      ? context.body(null, 204)
      : context.json(
          { error: { code: "not_found" as const, message: "Travel item not found." } },
          404,
        );
  });

  routes.get("/:tripId/stays", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    return context.json({ stays: await listStays(context.env.DB, tripId) }, 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.post("/:tripId/stays/property-backfill", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }
    const parsed = stayPropertyBackfillInputSchema.safeParse(
      (await readJson(context.req.raw)) ?? {},
    );
    if (!parsed.success) return context.json(validationError(), 422);
    if (!dependencies.placesClient && !context.env.GOOGLE_MAPS_API_KEY) {
      return context.json(propertyUnavailableError(), 503);
    }
    const places =
      dependencies.placesClient ?? createGooglePlacesClient(context.env.GOOGLE_MAPS_API_KEY);
    if (!places.matchStay) return context.json(propertyUnavailableError(), 503);

    const stays = (await listStays(context.env.DB, tripId))
      .filter((stay) => !stay.propertyRef)
      .slice(0, 50);
    const results = [];
    for (const stay of stays) {
      try {
        const propertyRef = await places.matchStay(stay.propertyName, stay.address);
        if (!propertyRef) {
          results.push({
            stayId: stay.id,
            propertyName: stay.propertyName,
            address: stay.address,
            status: "unmatched" as const,
            placeId: null,
          });
          continue;
        }
        if (parsed.data.apply) {
          await applyStayPropertyMatch(context.env.DB, tripId, stay.id, propertyRef.placeId);
        }
        results.push({
          stayId: stay.id,
          propertyName: stay.propertyName,
          address: stay.address,
          status: "matched" as const,
          placeId: propertyRef.placeId,
        });
      } catch (error) {
        console.error("Stay property backfill match failed", error);
        results.push({
          stayId: stay.id,
          propertyName: stay.propertyName,
          address: stay.address,
          status: "failed" as const,
          placeId: null,
        });
      }
    }
    const response = {
      mode: parsed.data.apply ? ("apply" as const) : ("dry-run" as const),
      scanned: stays.length,
      matched: results.filter((result) => result.status === "matched").length,
      unmatched: results.filter((result) => result.status === "unmatched").length,
      failed: results.filter((result) => result.status === "failed").length,
      results,
    };
    return context.json(stayPropertyBackfillResponseSchema.parse(response), 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.post("/:tripId/stays", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const parsed = createStayInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, parsed.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const stay = await createStay(context.env.DB, tripId, context.var.authUserId, parsed.data);
    return context.json({ stay }, 201, { "Cache-Control": "no-store" });
  });

  routes.patch("/:tripId/stays/:stayId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const existing = await getStay(context.env.DB, tripId, context.req.param("stayId"));
    if (!existing) {
      return context.json(
        { error: { code: "not_found" as const, message: "Stay not found." } },
        404,
      );
    }

    const parsed = updateStayInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    const merged = stayFieldsSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, merged.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const stay = await updateStay(context.env.DB, tripId, context.req.param("stayId"), parsed.data);
    return context.json({ stay }, 200, { "Cache-Control": "no-store" });
  });

  routes.delete("/:tripId/stays/:stayId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const deleted = await deleteStay(context.env.DB, tripId, context.req.param("stayId"));
    return deleted
      ? context.body(null, 204)
      : context.json({ error: { code: "not_found" as const, message: "Stay not found." } }, 404);
  });

  routes.get("/:tripId/stays/:stayId/property", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    const stay = await getStay(context.env.DB, tripId, context.req.param("stayId"));
    if (!stay?.propertyRef) {
      return context.json(
        { error: { code: "not_found" as const, message: "Property match not found." } },
        404,
      );
    }
    if (!dependencies.placesClient && !context.env.GOOGLE_MAPS_API_KEY) {
      return context.json(propertyUnavailableError(), 503);
    }
    const places =
      dependencies.placesClient ?? createGooglePlacesClient(context.env.GOOGLE_MAPS_API_KEY);
    if (!places.getStayProperty) return context.json(propertyUnavailableError(), 503);

    try {
      const property = await places.getStayProperty(stay.propertyRef.placeId);
      return context.json(stayPropertyResponseSchema.parse({ property }), 200, {
        "Cache-Control": "no-store",
      });
    } catch (error) {
      if (!(error instanceof PlacesServiceError)) console.error("Stay property error", error);
      return context.json(propertyUnavailableError(), 503);
    }
  });

  routes.get("/:tripId/stays/:stayId/property/photo", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    const stay = await getStay(context.env.DB, tripId, context.req.param("stayId"));
    if (!stay?.propertyRef) {
      return context.json(
        { error: { code: "not_found" as const, message: "Property photo not found." } },
        404,
      );
    }
    if (!dependencies.placesClient && !context.env.GOOGLE_MAPS_API_KEY) {
      return context.json(propertyUnavailableError(), 503);
    }
    const places =
      dependencies.placesClient ?? createGooglePlacesClient(context.env.GOOGLE_MAPS_API_KEY);
    if (!places.renderStayPhoto) return context.json(propertyUnavailableError(), 503);

    try {
      const photo = await places.renderStayPhoto(stay.propertyRef.placeId);
      return new Response(photo.body, {
        status: 200,
        headers: {
          "Content-Type": photo.headers.get("Content-Type") ?? "image/jpeg",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      if (!(error instanceof PlacesServiceError)) console.error("Stay photo error", error);
      return context.json(propertyUnavailableError(), 503);
    }
  });

  routes.get("/:tripId/plans", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }

    return context.json({ plans: await listPlans(context.env.DB, tripId) }, 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.post("/:tripId/plans", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const parsed = createPlanInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, parsed.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const plan = await createPlan(context.env.DB, tripId, context.var.authUserId, parsed.data);
    return context.json({ plan }, 201, { "Cache-Control": "no-store" });
  });

  routes.patch("/:tripId/plans/:planId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const existing = await getPlan(context.env.DB, tripId, context.req.param("planId"));
    if (!existing) {
      return context.json(
        { error: { code: "not_found" as const, message: "Plan not found." } },
        404,
      );
    }

    const parsed = updatePlanInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    const merged = planFieldsSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, merged.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const plan = await updatePlan(context.env.DB, tripId, context.req.param("planId"), parsed.data);
    return context.json({ plan }, 200, { "Cache-Control": "no-store" });
  });

  routes.delete("/:tripId/plans/:planId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);

    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const deleted = await deletePlan(context.env.DB, tripId, context.req.param("planId"));
    return deleted
      ? context.body(null, 204)
      : context.json({ error: { code: "not_found" as const, message: "Plan not found." } }, 404);
  });

  return routes;
}
