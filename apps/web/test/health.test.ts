import { SELF } from "cloudflare:test";
import { type HealthResponse, healthEndpoint } from "@voyage/contracts";
import { describe, expect, it } from "vitest";

describe("Voyage Worker API", () => {
  it("responds to the health check from the deployed API boundary", async () => {
    const response = await SELF.fetch(`https://voyage.test${healthEndpoint}`);
    const payload = await response.json<HealthResponse>();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toMatchObject({
      status: "ok",
      service: "voyage-api",
      environment: "production",
    });
    expect(Number.isNaN(Date.parse(payload.checkedAt))).toBe(false);
  });

  it("returns JSON for unknown API routes", async () => {
    const response = await SELF.fetch("https://voyage.test/api/unknown");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });
});
