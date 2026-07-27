import { airportListResponseSchema } from "@voyage/contracts";
import { Hono } from "hono";
import { searchAirports } from "./airport-repository";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import type { WorkerEnvironment } from "./types";

export function createAirportRoutes(authenticateRequest: AuthenticateRequest) {
  const routes = new Hono<WorkerEnvironment>();

  routes.use("*", createAuthMiddleware(authenticateRequest));
  routes.get("/", async (context) => {
    const query = context.req.query("q")?.trim() ?? "";
    if (query.length < 1 || query.length > 120) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Enter an airport code, city, or airport name.",
          },
        },
        422,
      );
    }

    const response = airportListResponseSchema.parse({
      airports: await searchAirports(context.env.DB, query),
    });
    return context.json(response, 200, { "Cache-Control": "no-store" });
  });

  return routes;
}
