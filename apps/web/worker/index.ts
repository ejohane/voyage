import {
  airportsEndpoint,
  type HealthResponse,
  healthEndpoint,
  locationsEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { Hono } from "hono";
import { createAirportRoutes } from "./airport-routes";
import { type AuthenticateRequest, authenticateClerkRequest } from "./auth";
import { createGmailImportRoutes } from "./gmail-import-routes";
import { createGmailIntegrationRoutes } from "./gmail-integration-routes";
import type { PlacesClient } from "./google-places";
import type { StaticMapsClient } from "./google-static-maps";
import type { InvitationEmailSender } from "./invitation-email";
import { createInvitationRoutes } from "./invitations-routes";
import { createLocationRoutes } from "./location-routes";
import { createPlanningRoutes } from "./planning-routes";
import { createTripsRoutes } from "./trips-routes";
import type { WorkerEnvironment } from "./types";
import type { UserDirectory } from "./user-directory";

type AppDependencies = {
  authenticateRequest?: AuthenticateRequest;
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
  app.onError((error, context) => {
    console.error("Unhandled API error", error);
    return context.json(
      { error: { code: "internal_error" as const, message: "Something went wrong." } },
      500,
    );
  });

  return app;
}

export const app = createApp();

export default app;
