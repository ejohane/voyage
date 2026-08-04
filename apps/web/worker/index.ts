import {
  airportsEndpoint,
  apiV1Endpoint,
  type HealthResponse,
  healthEndpoint,
  locationsEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { Hono } from "hono";
import { routePath } from "hono/route";
import { createAirportRoutes } from "./airport-routes";
import {
  type AuthenticateRequest,
  authenticateClerkRequest,
  authenticateClerkV1Request,
} from "./auth";
import { backendRequestId, logBackendFailure } from "./backend-logging";
import { createGmailImportRoutes } from "./gmail-import-routes";
import { createGmailIntegrationRoutes } from "./gmail-integration-routes";
import type { PlacesClient } from "./google-places";
import type { StaticMapsClient } from "./google-static-maps";
import type { InvitationEmailSender } from "./invitation-email";
import { createInvitationRoutes } from "./invitations-routes";
import { createLocationRoutes } from "./location-routes";
import { deleteExpiredV1IdempotencyRecords } from "./planning-repository";
import { createPlanningRoutes } from "./planning-routes";
import { createTripsRoutes } from "./trips-routes";
import type { WorkerEnvironment } from "./types";
import type { UserDirectory } from "./user-directory";
import { createV1Routes } from "./v1-routes";

type AppDependencies = {
  authenticateRequest?: AuthenticateRequest;
  v1AuthenticateRequest?: AuthenticateRequest;
  gmailFetch?: typeof fetch;
  placesClient?: PlacesClient;
  staticMapsClient?: StaticMapsClient;
  invitationEmailSender?: InvitationEmailSender;
  userDirectory?: UserDirectory;
  now?: () => Date;
};

export function createApp(dependencies: AppDependencies = {}) {
  const app = new Hono<WorkerEnvironment>();
  const authenticateRequest = dependencies.authenticateRequest ?? authenticateClerkRequest;
  const v1AuthenticateRequest =
    dependencies.v1AuthenticateRequest ??
    dependencies.authenticateRequest ??
    authenticateClerkV1Request;

  app.get(healthEndpoint, (context) => {
    const response: HealthResponse = {
      status: "ok",
      service: "voyage-api",
      environment: context.env.ENVIRONMENT,
      checkedAt: new Date().toISOString(),
    };

    return context.json(response, 200, {
      "Cache-Control": "no-store",
    });
  });

  app.route(
    apiV1Endpoint,
    createV1Routes(v1AuthenticateRequest, {
      gmailFetch: dependencies.gmailFetch,
      placesClient: dependencies.placesClient,
      userDirectory: dependencies.userDirectory,
      now: dependencies.now,
    }),
  );

  app.route(
    tripsEndpoint,
    createTripsRoutes(authenticateRequest, { staticMapsClient: dependencies.staticMapsClient }),
  );
  app.route(
    "/",
    createInvitationRoutes(authenticateRequest, {
      emailSender: dependencies.invitationEmailSender,
      userDirectory: dependencies.userDirectory,
      now: dependencies.now,
    }),
  );
  app.route(
    tripsEndpoint,
    createPlanningRoutes(authenticateRequest, { placesClient: dependencies.placesClient }),
  );
  app.route(
    "/api/integrations/gmail",
    createGmailIntegrationRoutes(authenticateRequest, { fetcher: dependencies.gmailFetch }),
  );
  app.route(
    tripsEndpoint,
    createGmailImportRoutes(authenticateRequest, {
      fetcher: dependencies.gmailFetch,
      placesClient: dependencies.placesClient,
    }),
  );
  app.route(
    locationsEndpoint,
    createLocationRoutes(authenticateRequest, { placesClient: dependencies.placesClient }),
  );
  app.route(airportsEndpoint, createAirportRoutes(authenticateRequest));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((_cause, context) => {
    logBackendFailure({
      requestId: backendRequestId(context.req.raw),
      operation: `${context.req.method} ${routePath(context, -1) || "unknown_route"}`,
      status: 500,
      category: "unexpected_error",
    });
    return context.json(
      { error: { code: "internal_error" as const, message: "Something went wrong." } },
      500,
    );
  });

  return app;
}

export const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller, environment) {
    try {
      await deleteExpiredV1IdempotencyRecords(environment.DB);
    } catch {
      logBackendFailure({
        requestId: "scheduled",
        operation: "purge_expired_api_idempotency_records",
        status: 500,
        category: "maintenance_error",
      });
    }
  },
} satisfies ExportedHandler<WorkerEnvironment["Bindings"]>;
