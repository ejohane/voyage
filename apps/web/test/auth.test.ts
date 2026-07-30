import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../worker";
import { createAuthenticateClerkRequest, createAuthenticateClerkV1Request } from "../worker/auth";
import type { Bindings } from "../worker/types";

const bindings = {
  CLERK_JWT_KEY: "test-public-key",
  CLERK_AUTHORIZED_PARTIES: " https://voyageplan.app, https://www.voyageplan.app ",
} as Bindings;

function authenticatedRequest() {
  return new Request("https://voyageplan.app/api/v1/trips", {
    headers: { Authorization: "Bearer test-session-token" },
  });
}

describe("Clerk request authentication", () => {
  it("accepts an azp-less native token only on the native API boundary", async () => {
    const verifySessionToken = vi.fn(async () => ({ sub: "user_native" }));
    const app = createApp({
      authenticateRequest: createAuthenticateClerkRequest(verifySessionToken),
      v1AuthenticateRequest: createAuthenticateClerkV1Request(verifySessionToken),
    });

    const nativeResponse = await app.request(
      "https://voyage.test/api/v1/trips",
      { headers: { Authorization: "Bearer test-session-token" } },
      env,
    );
    const legacyResponse = await app.request(
      "https://voyage.test/api/trips",
      { headers: { Authorization: "Bearer test-session-token" } },
      env,
    );

    expect(nativeResponse.status).toBe(200);
    expect(legacyResponse.status).toBe(401);
    expect(verifySessionToken).toHaveBeenNthCalledWith(1, "test-session-token", {
      jwtKey: expect.any(String),
    });
    expect(verifySessionToken).toHaveBeenNthCalledWith(2, "test-session-token", {
      authorizedParties: ["https://voyage.test"],
      jwtKey: expect.any(String),
    });
  });

  it("accepts a verified browser token from an authorized origin on both policies", async () => {
    const verifySessionToken = async () => ({
      sub: "user_web",
      azp: "https://www.voyageplan.app",
    });
    const authenticateBrowser = createAuthenticateClerkRequest(verifySessionToken);
    const authenticateV1 = createAuthenticateClerkV1Request(verifySessionToken);

    await expect(authenticateBrowser(authenticatedRequest(), bindings)).resolves.toBe("user_web");
    await expect(authenticateV1(authenticatedRequest(), bindings)).resolves.toBe("user_web");
  });

  it("rejects a verified browser token from an unauthorized origin on both policies", async () => {
    const verifySessionToken = async () => ({
      sub: "user_web",
      azp: "https://untrusted.voyageplan.app",
    });
    const authenticateBrowser = createAuthenticateClerkRequest(verifySessionToken);
    const authenticateV1 = createAuthenticateClerkV1Request(verifySessionToken);

    await expect(authenticateBrowser(authenticatedRequest(), bindings)).resolves.toBeNull();
    await expect(authenticateV1(authenticatedRequest(), bindings)).resolves.toBeNull();
  });

  it("rejects an azp-less token when a browser Origin is present", async () => {
    const authenticate = createAuthenticateClerkV1Request(async () => ({
      sub: "user_native",
    }));
    const request = new Request("https://voyageplan.app/api/v1/trips", {
      headers: {
        Authorization: "Bearer test-session-token",
        Origin: "https://untrusted.voyageplan.app",
      },
    });

    await expect(authenticate(request, bindings)).resolves.toBeNull();
  });

  it("rejects missing and unverifiable session tokens on both policies", async () => {
    for (const createAuthenticate of [
      createAuthenticateClerkRequest,
      createAuthenticateClerkV1Request,
    ]) {
      const verifySessionToken = vi.fn(async () => {
        throw new Error("invalid or expired token");
      });
      const authenticate = createAuthenticate(verifySessionToken);

      await expect(
        authenticate(new Request("https://voyageplan.app/api/v1/trips"), bindings),
      ).resolves.toBeNull();
      expect(verifySessionToken).not.toHaveBeenCalled();

      await expect(authenticate(authenticatedRequest(), bindings)).resolves.toBeNull();
      expect(verifySessionToken).toHaveBeenCalledOnce();
    }
  });
});
