import { env } from "cloudflare:test";
import { v1TripsEndpoint } from "@voyage/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../worker";

describe("backend logging", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records only sanitized failure metadata when an exception contains sensitive text", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secretCause = "confirmation ABC123 for traveler@example.com";
    const failingDatabase = {
      prepare() {
        throw new Error(secretCause);
      },
    } as unknown as D1Database;
    const app = createApp({
      authenticateRequest: async () => "user_owner",
    });

    const response = await app.request(
      `https://voyage.test${v1TripsEndpoint}`,
      { headers: { "X-Request-ID": "logging-redaction-test" } },
      { ...env, DB: failingDatabase },
    );

    expect(response.status).toBe(503);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]).toHaveLength(1);
    expect(logged.mock.calls[0][0]).toEqual({
      requestId: "logging-redaction-test",
      operation: expect.any(String),
      status: 503,
      category: "service_unavailable",
    });
    expect(Object.keys(logged.mock.calls[0][0] as Record<string, unknown>).sort()).toEqual([
      "category",
      "operation",
      "requestId",
      "status",
    ]);
    expect(JSON.stringify(logged.mock.calls)).not.toContain(secretCause);
  });
});
