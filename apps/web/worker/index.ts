import {
  type HealthResponse,
  healthEndpoint,
  locationsEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, authenticateClerkRequest } from "./auth";
import { createGmailImportRoutes } from "./gmail-import-routes";
import { createGmailIntegrationRoutes } from "./gmail-integration-routes";
import type { PlacesClient } from "./google-places";
import { createLocationRoutes } from "./location-routes";
import { createPlanningRoutes } from "./planning-routes";
import { createTripsRoutes } from "./trips-routes";
import type { WorkerEnvironment } from "./types";

type AppDependencies = {
  authenticateRequest?: AuthenticateRequest;
  gmailFetch?: typeof fetch;
  placesClient?: PlacesClient;
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

  app.route(tripsEndpoint, createTripsRoutes(authenticateRequest));
  app.route(tripsEndpoint, createPlanningRoutes(authenticateRequest));
  app.route(
    "/api/integrations/gmail",
    createGmailIntegrationRoutes(authenticateRequest, { fetcher: dependencies.gmailFetch }),
  );
  app.route(
    tripsEndpoint,
    createGmailImportRoutes(authenticateRequest, { fetcher: dependencies.gmailFetch }),
  );
  app.route(
    locationsEndpoint,
    createLocationRoutes(authenticateRequest, { placesClient: dependencies.placesClient }),
  );

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
