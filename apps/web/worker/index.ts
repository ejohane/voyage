import { type HealthResponse, healthEndpoint } from "@voyage/contracts";
import { Hono } from "hono";

type Bindings = {
  ENVIRONMENT: string;
};

export const app = new Hono<{ Bindings: Bindings }>();

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

app.notFound((context) => context.json({ error: "Not found" }, 404));

export default app;
