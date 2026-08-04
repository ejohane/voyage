import {
  type ApiError,
  apiErrorSchema,
  createTripInputSchema,
  tripListResponseSchema,
  tripResponseSchema,
  v1CreateScheduledPlanInputSchema,
  v1PlanResponseSchema,
  v1ScheduledPlanSchema,
  v1TripListResponseSchema,
  v1TripPeopleResponseSchema,
  v1TripWorkspaceResponseSchema,
  v1UpdateScheduledPlanInputSchema,
  voyageApiV1SchemaVersion,
} from "@voyage/contracts";
import { Hono } from "hono";
import { routePath } from "hono/route";
import { z } from "zod";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import { backendRequestId, logBackendFailure } from "./backend-logging";
import { createGmailImportRoutes } from "./gmail-import-routes";
import { createGmailIntegrationRoutes } from "./gmail-integration-routes";
import type { PlacesClient } from "./google-places";
import { getTripAccess, listMemberships, mapMembership } from "./invitations-repository";
import { createLocationRoutes } from "./location-routes";
import {
  createV1ScheduledPlanIdempotently,
  deleteV1ScheduledPlanIfRevision,
  getV1ScheduledPlan,
  listStays,
  listTravel,
  listV1ScheduledPlans,
  updateV1ScheduledPlanIfRevision,
} from "./planning-repository";
import { createTrip, getTrip, listTrips } from "./trips-repository";
import type { WorkerEnvironment } from "./types";
import { createClerkUserDirectory, type UserDirectory } from "./user-directory";

const apiVersionHeader = "X-Voyage-API-Version";
const requestIdHeader = "X-Request-ID";
const idempotencyKeySchema = z.string().uuid();

type V1RoutesDependencies = {
  gmailFetch?: typeof fetch;
  placesClient?: PlacesClient;
  userDirectory?: UserDirectory;
  now?: () => Date;
};

function error(
  code: ApiError["error"]["code"],
  message: string,
  details: Pick<ApiError["error"], "fieldErrors" | "currentRevision"> = {},
) {
  return apiErrorSchema.parse({ error: { code, message, ...details } });
}

function validationError(fieldErrors?: Record<string, string[] | undefined>) {
  return error("validation_error", "Check the highlighted fields.", {
    fieldErrors: Object.fromEntries(
      Object.entries(fieldErrors ?? {}).filter(
        (entry): entry is [string, string[]] => entry[1] !== undefined,
      ),
    ),
  });
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function tripHasStop(trip: { stops: { id: string }[] }, stopId: string) {
  return trip.stops.some((stop) => stop.id === stopId);
}

function configuredUserDirectory(
  bindings: WorkerEnvironment["Bindings"],
  dependency: UserDirectory | undefined,
) {
  if (dependency) return dependency;
  return bindings.CLERK_SECRET_KEY ? createClerkUserDirectory(bindings.CLERK_SECRET_KEY) : null;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function quotedEtag(revision: string | number) {
  return `"${revision}"`;
}

function matchesEtag(request: Request, etag: string) {
  return (request.headers.get("If-None-Match") ?? "")
    .split(",")
    .map((value) => value.trim())
    .some((value) => value === "*" || value === etag || value === `W/${etag}`);
}

function expectedRevision(request: Request) {
  const value = request.headers.get("If-Match");
  const match = value?.match(/^"([1-9]\d*)"$/);
  return match ? Number(match[1]) : null;
}

function cacheHeaders(revision: string) {
  return {
    "Cache-Control": "private, no-cache",
    ETag: quotedEtag(revision),
    Vary: "Authorization",
  };
}

export function createV1Routes(
  authenticateRequest: AuthenticateRequest,
  dependencies: V1RoutesDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();
  const currentTime = dependencies.now ?? (() => new Date());

  routes.use("*", async (context, next) => {
    context.set("apiRequestId", backendRequestId(context.req.raw));
    context.header(apiVersionHeader, String(voyageApiV1SchemaVersion));
    context.header(requestIdHeader, context.var.apiRequestId);
    await next();
  });
  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.get("/trips", async (context) => {
    const { trips } = tripListResponseSchema.parse({
      trips: await listTrips(context.env.DB, context.var.authUserId),
    });
    const revision = await sha256({ trips });
    const etag = quotedEtag(revision);
    const headers = cacheHeaders(revision);

    if (matchesEtag(context.req.raw, etag)) return context.body(null, 304, headers);

    const response = v1TripListResponseSchema.parse({
      schemaVersion: voyageApiV1SchemaVersion,
      generatedAt: currentTime().toISOString(),
      revision,
      trips,
    });
    return context.json(response, 200, headers);
  });

  routes.post("/trips", async (context) => {
    const parsed = createTripInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }

    const trip = await createTrip(context.env.DB, context.var.authUserId, parsed.data);
    const response = tripResponseSchema.parse({ trip });
    return context.json(response, 201, {
      "Cache-Control": "private, no-store",
      Location: `/api/v1/trips/${trip.id}`,
    });
  });

  routes.route(
    "/locations",
    createLocationRoutes(authenticateRequest, {
      placesClient: dependencies.placesClient,
      authenticateRequests: false,
    }),
  );

  routes.get("/trips/:tripId/workspace", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) return context.json(error("not_found", "Trip not found."), 404);

    const [travel, stays, plans] = await Promise.all([
      listTravel(context.env.DB, tripId),
      listStays(context.env.DB, tripId),
      listV1ScheduledPlans(context.env.DB, tripId),
    ]);
    const workspace = { trip, travel, stays, plans };
    const revision = await sha256(workspace);
    const etag = quotedEtag(revision);
    const headers = cacheHeaders(revision);

    if (matchesEtag(context.req.raw, etag)) return context.body(null, 304, headers);

    const response = v1TripWorkspaceResponseSchema.parse({
      schemaVersion: voyageApiV1SchemaVersion,
      generatedAt: currentTime().toISOString(),
      revision,
      ...workspace,
    });
    return context.json(response, 200, headers);
  });

  routes.get("/trips/:tripId/people", async (context) => {
    const tripId = context.req.param("tripId");
    const access = await getTripAccess(context.env.DB, tripId, context.var.authUserId);
    if (!access) return context.json(error("not_found", "Trip not found."), 404);

    const membershipRows = await listMemberships(context.env.DB, tripId);
    const directory = configuredUserDirectory(context.env, dependencies.userDirectory);
    const identities = new Map();
    if (directory) {
      const resolved = await Promise.allSettled(
        membershipRows.map((membership) => directory.getUser(membership.user_id)),
      );
      for (const result of resolved) {
        if (result.status === "fulfilled") identities.set(result.value.userId, result.value);
      }
    }

    const response = v1TripPeopleResponseSchema.parse({
      schemaVersion: voyageApiV1SchemaVersion,
      generatedAt: currentTime().toISOString(),
      members: membershipRows.map((membership) =>
        mapMembership(membership, identities.get(membership.user_id), access === "owner"),
      ),
    });
    return context.json(response, 200, { "Cache-Control": "private, no-store" });
  });

  routes.post("/trips/:tripId/plans", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) return context.json(error("not_found", "Trip not found."), 404);
    if (trip.accessLevel === "viewer") {
      return context.json(error("forbidden", "You cannot edit this trip."), 403);
    }

    const parsed = v1CreateScheduledPlanInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, parsed.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const parsedKey = idempotencyKeySchema.safeParse(
      context.req.raw.headers.get("Idempotency-Key"),
    );
    if (!parsedKey.success) {
      return context.json(
        validationError({ "Idempotency-Key": ["Provide a UUID idempotency key."] }),
        422,
      );
    }

    const requestHash = await sha256({ tripId, input: parsed.data });
    const result = await createV1ScheduledPlanIdempotently(
      context.env.DB,
      tripId,
      context.var.authUserId,
      parsedKey.data,
      requestHash,
      parsed.data,
    );
    if (result.kind === "conflict") {
      return context.json(
        error("conflict", "This idempotency key was already used for another request."),
        409,
      );
    }

    const response = v1PlanResponseSchema.parse({ plan: result.plan });
    return context.json(response, 201, {
      "Cache-Control": "private, no-store",
      ETag: quotedEtag(result.plan.revision),
      Location: `/api/v1/trips/${tripId}/plans/${result.plan.id}`,
      ...(result.kind === "replayed" ? { "Idempotency-Replayed": "true" } : {}),
    });
  });

  routes.patch("/trips/:tripId/plans/:planId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) return context.json(error("not_found", "Trip not found."), 404);
    if (trip.accessLevel === "viewer") {
      return context.json(error("forbidden", "You cannot edit this trip."), 403);
    }

    const revision = expectedRevision(context.req.raw);
    if (!revision) {
      return context.json(
        error("precondition_required", 'Send the current plan ETag in If-Match, for example "1".'),
        428,
      );
    }

    const existing = await getV1ScheduledPlan(context.env.DB, tripId, context.req.param("planId"));
    if (!existing) return context.json(error("not_found", "Plan not found."), 404);

    const parsed = v1UpdateScheduledPlanInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(validationError(parsed.error.flatten().fieldErrors), 422);
    }
    const merged = v1CreateScheduledPlanInputSchema.safeParse({ ...existing, ...parsed.data });
    if (!merged.success) {
      return context.json(validationError(merged.error.flatten().fieldErrors), 422);
    }
    if (!tripHasStop(trip, merged.data.tripStopId)) {
      return context.json(
        validationError({ tripStopId: ["Choose a destination from this trip."] }),
        422,
      );
    }

    const result = await updateV1ScheduledPlanIfRevision(
      context.env.DB,
      tripId,
      existing.id,
      revision,
      parsed.data,
    );
    if (result.kind === "not_found") {
      return context.json(error("not_found", "Plan not found."), 404);
    }
    if (result.kind === "conflict") {
      return context.json(
        error("conflict", "This plan changed. Refresh it before saving.", {
          currentRevision: result.currentRevision,
        }),
        409,
      );
    }
    if (result.kind !== "updated") throw new Error("Unexpected plan update result.");

    const response = v1PlanResponseSchema.parse({ plan: result.plan });
    return context.json(response, 200, {
      "Cache-Control": "private, no-store",
      ETag: quotedEtag(result.plan.revision),
    });
  });

  routes.delete("/trips/:tripId/plans/:planId", async (context) => {
    const tripId = context.req.param("tripId");
    const trip = await getTrip(context.env.DB, context.var.authUserId, tripId);
    if (!trip) return context.json(error("not_found", "Trip not found."), 404);
    if (trip.accessLevel === "viewer") {
      return context.json(error("forbidden", "You cannot edit this trip."), 403);
    }

    const revision = expectedRevision(context.req.raw);
    if (!revision) {
      return context.json(
        error("precondition_required", 'Send the current plan ETag in If-Match, for example "1".'),
        428,
      );
    }

    const result = await deleteV1ScheduledPlanIfRevision(
      context.env.DB,
      tripId,
      context.req.param("planId"),
      revision,
    );
    if (result.kind === "not_found") {
      return context.json(error("not_found", "Plan not found."), 404);
    }
    if (result.kind === "conflict") {
      return context.json(
        error("conflict", "This plan changed. Refresh it before removing it.", {
          currentRevision: result.currentRevision,
        }),
        409,
      );
    }
    if (result.kind !== "deleted") throw new Error("Unexpected plan delete result.");

    return context.body(null, 204, { "Cache-Control": "private, no-store" });
  });

  routes.route(
    "/integrations/gmail",
    createGmailIntegrationRoutes(authenticateRequest, { fetcher: dependencies.gmailFetch }),
  );
  routes.route(
    "/trips",
    createGmailImportRoutes(authenticateRequest, {
      fetcher: dependencies.gmailFetch,
      placesClient: dependencies.placesClient,
    }),
  );

  routes.onError((_cause, context) => {
    logBackendFailure({
      requestId: context.var.apiRequestId,
      operation: `${context.req.method} ${routePath(context, -1) || "v1_unknown"}`,
      status: 503,
      category: "service_unavailable",
    });
    return context.json(error("service_unavailable", "Voyage is temporarily unavailable."), 503, {
      "Cache-Control": "no-store",
    });
  });

  return routes;
}

export const v1ResponseSchemas = {
  tripList: v1TripListResponseSchema,
  workspace: v1TripWorkspaceResponseSchema,
  people: v1TripPeopleResponseSchema,
  plan: v1PlanResponseSchema,
  scheduledPlan: v1ScheduledPlanSchema,
};
