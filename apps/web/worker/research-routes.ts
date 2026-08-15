import {
  createResearchItemInputSchema,
  researchItemResponseSchema,
  researchListQuerySchema,
  researchListResponseSchema,
  researchPlanPromotionInputSchema,
  researchPlanPromotionResponseSchema,
  updateResearchItemInputSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { z } from "zod";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import {
  createResearchItemIdempotently,
  deleteResearchItemIfRevision,
  getResearchItem,
  listResearchItems,
  promoteResearchToPlan,
  updateResearchItemIfRevision,
} from "./research-repository";
import { getTrip } from "./trips-repository";
import type { WorkerEnvironment } from "./types";

const idempotencyKeySchema = z.string().uuid();

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

function expectedRevision(request: Request) {
  const value = request.headers.get("If-Match")?.trim();
  if (!value) return null;
  const match = value.match(/^(?:W\/)?"?(\d+)"?$/);
  const revision = match ? Number(match[1]) : Number.NaN;
  return Number.isInteger(revision) && revision > 0 ? revision : null;
}

function tripHasStop(trip: { stops: { id: string }[] }, stopId: string | null | undefined) {
  return stopId === null || stopId === undefined || trip.stops.some((stop) => stop.id === stopId);
}

function mutationResultError(result: { kind: string; currentRevision?: number }) {
  if (result.kind === "not_found") {
    return {
      status: 404 as const,
      body: { error: { code: "not_found" as const, message: "Research item not found." } },
    };
  }
  return {
    status: 409 as const,
    body: {
      error: {
        code: "conflict" as const,
        message: "This Research item changed. Refresh and try again.",
        currentRevision: result.currentRevision,
      },
    },
  };
}

export function createResearchRoutes(authenticateRequest: AuthenticateRequest) {
  const routes = new Hono<WorkerEnvironment>();
  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.get("/:tripId/research", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    const parsed = researchListQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    const result = await listResearchItems(
      context.env.DB,
      trip.id,
      context.var.authUserId,
      trip.accessLevel,
      parsed.data,
    );
    return context.json(researchListResponseSchema.parse(result), 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.post("/:tripId/research", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
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
    const key = idempotencyKeySchema.safeParse(context.req.header("Idempotency-Key"));
    if (!key.success) {
      return context.json(
        validationError({ "Idempotency-Key": ["Provide a UUID idempotency key."] }),
        422,
      );
    }
    const input = createResearchItemInputSchema.safeParse(await readJson(context.req.raw));
    if (!input.success) {
      return context.json(validationError(input.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, input.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }
    const result = await createResearchItemIdempotently(
      context.env.DB,
      trip.id,
      context.var.authUserId,
      key.data,
      input.data,
    );
    if (result.kind === "conflict") {
      return context.json(
        {
          error: {
            code: "conflict" as const,
            message: "This idempotency key was already used for another capture.",
          },
        },
        409,
      );
    }
    return context.json(
      researchItemResponseSchema.parse({ researchItem: result.researchItem }),
      result.kind === "created" ? 201 : 200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.get("/:tripId/research/:researchItemId", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    const researchItem = await getResearchItem(
      context.env.DB,
      trip.id,
      context.req.param("researchItemId"),
      context.var.authUserId,
      trip.accessLevel,
    );
    if (!researchItem) {
      return context.json(
        { error: { code: "not_found" as const, message: "Research item not found." } },
        404,
      );
    }
    return context.json(researchItemResponseSchema.parse({ researchItem }), 200, {
      "Cache-Control": "no-store",
      ETag: `"${researchItem.revision}"`,
    });
  });

  routes.patch("/:tripId/research/:researchItemId", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
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
    const revision = expectedRevision(context.req.raw);
    if (!revision) {
      return context.json(
        {
          error: {
            code: "precondition_required" as const,
            message: "Refresh this Research item before changing it.",
          },
        },
        428,
      );
    }
    const input = updateResearchItemInputSchema.safeParse(await readJson(context.req.raw));
    if (!input.success) {
      return context.json(validationError(input.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, input.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }
    const result = await updateResearchItemIfRevision(
      context.env.DB,
      trip.id,
      context.req.param("researchItemId"),
      revision,
      input.data,
      context.var.authUserId,
      trip.accessLevel,
    );
    if (result.kind !== "updated") {
      const error = mutationResultError(result);
      return context.json(error.body, error.status);
    }
    return context.json(
      researchItemResponseSchema.parse({ researchItem: result.researchItem }),
      200,
      { "Cache-Control": "no-store", ETag: `"${result.researchItem.revision}"` },
    );
  });

  routes.delete("/:tripId/research/:researchItemId", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
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
    const revision = expectedRevision(context.req.raw);
    if (!revision) {
      return context.json(
        {
          error: {
            code: "precondition_required" as const,
            message: "Refresh this Research item before deleting it.",
          },
        },
        428,
      );
    }
    const result = await deleteResearchItemIfRevision(
      context.env.DB,
      trip.id,
      context.req.param("researchItemId"),
      revision,
    );
    if (result.kind !== "deleted") {
      const error = mutationResultError(result);
      return context.json(error.body, error.status);
    }
    return context.body(null, 204);
  });

  routes.post("/:tripId/research/:researchItemId/promotions/plan", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
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
    const revision = expectedRevision(context.req.raw);
    if (!revision) {
      return context.json(
        {
          error: {
            code: "precondition_required" as const,
            message: "Refresh this Research item before promoting it.",
          },
        },
        428,
      );
    }
    const key = idempotencyKeySchema.safeParse(context.req.header("Idempotency-Key"));
    if (!key.success) {
      return context.json(
        validationError({ "Idempotency-Key": ["Provide a UUID idempotency key."] }),
        422,
      );
    }
    const input = researchPlanPromotionInputSchema.safeParse(await readJson(context.req.raw));
    if (!input.success) {
      return context.json(validationError(input.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, input.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }
    const result = await promoteResearchToPlan(
      context.env.DB,
      trip.id,
      context.req.param("researchItemId"),
      revision,
      context.var.authUserId,
      trip.accessLevel,
      key.data,
      input.data,
    );
    if (result.kind === "not_found") {
      return context.json(
        { error: { code: "not_found" as const, message: "Research item not found." } },
        404,
      );
    }
    if (result.kind === "conflict") {
      return context.json(
        {
          error: {
            code: "conflict" as const,
            message: "This Research item or promotion changed. Refresh and try again.",
            currentRevision: result.currentRevision,
          },
        },
        409,
      );
    }
    return context.json(
      researchPlanPromotionResponseSchema.parse({
        researchItem: result.researchItem,
        plan: result.plan,
        idempotentReplay: result.kind === "replayed",
      }),
      result.kind === "created" ? 201 : 200,
      { "Cache-Control": "no-store" },
    );
  });

  return routes;
}
