import {
  locationSuggestionsResponseSchema,
  resolvedLocationResponseSchema,
  resolveLocationInputSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import { createGooglePlacesClient, type PlacesClient, PlacesServiceError } from "./google-places";
import type { WorkerEnvironment } from "./types";

type LocationRouteDependencies = {
  placesClient?: PlacesClient;
};

function languageCode(request: Request) {
  const language = request.headers.get("Accept-Language")?.split(",")[0]?.split("-")[0]?.trim();
  return language?.match(/^[a-zA-Z]{2,3}$/) ? language.toLowerCase() : undefined;
}

function unavailableError() {
  return {
    error: {
      code: "internal_error" as const,
      message: "Location suggestions are temporarily unavailable.",
    },
  };
}

export function createLocationRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: LocationRouteDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();

  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.get("/suggestions", async (context) => {
    const query = context.req.query("q")?.trim() ?? "";
    const sessionToken = context.req.query("sessionToken")?.trim() ?? "";

    if (query.length < 2 || query.length > 160 || !sessionToken.match(/^[0-9a-f-]{36}$/i)) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Enter at least two characters to search for a destination.",
          },
        },
        422,
      );
    }

    if (!dependencies.placesClient && !context.env.GOOGLE_MAPS_API_KEY) {
      return context.json(unavailableError(), 503);
    }

    try {
      const places =
        dependencies.placesClient ?? createGooglePlacesClient(context.env.GOOGLE_MAPS_API_KEY);
      const suggestions = await places.suggest({
        query,
        sessionToken,
        languageCode: languageCode(context.req.raw),
      });
      const response = locationSuggestionsResponseSchema.parse({ suggestions });

      return context.json(response, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (!(error instanceof PlacesServiceError)) console.error("Location suggestion error", error);
      return context.json(unavailableError(), 503);
    }
  });

  routes.post("/resolve", async (context) => {
    let payload: unknown;

    try {
      payload = await context.req.json();
    } catch {
      payload = null;
    }

    const parsed = resolveLocationInputSchema.safeParse(payload);

    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Choose a valid destination.",
          },
        },
        422,
      );
    }

    if (!dependencies.placesClient && !context.env.GOOGLE_MAPS_API_KEY) {
      return context.json(unavailableError(), 503);
    }

    try {
      const places =
        dependencies.placesClient ?? createGooglePlacesClient(context.env.GOOGLE_MAPS_API_KEY);
      const location = await places.resolve(parsed.data.placeId, parsed.data.sessionToken);
      const response = resolvedLocationResponseSchema.parse({ location });

      return context.json(response, 200, { "Cache-Control": "no-store" });
    } catch (error) {
      if (!(error instanceof PlacesServiceError)) console.error("Location resolution error", error);
      return context.json(unavailableError(), 503);
    }
  });

  return routes;
}
