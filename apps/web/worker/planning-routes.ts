import {
  createStayInputSchema,
  createTravelInputSchema,
  updateStayInputSchema,
  updateTravelInputSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import {
  createStay,
  createTravel,
  deleteStay,
  deleteTravel,
  getStay,
  getTravel,
  listStays,
  listTravel,
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

export function createPlanningRoutes(authenticateRequest: AuthenticateRequest) {
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

    const merged = createStayInputSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
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

  return routes;
}
