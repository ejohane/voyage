import { env } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { authenticateClerkOAuthRequestWith } from "../src/auth";
import type { Bindings } from "../src/types";

const bindings: Bindings = {
  DB: env.DB,
  ENVIRONMENT: "staging",
  APP_URL: "https://voyageplan.app",
  MCP_RESOURCE_URL: "https://mcp-staging.voyageplan.app",
  CLERK_AUTHORIZATION_SERVER: "https://example.clerk.accounts.dev",
  CLERK_JWT_KEY: "test-public-key",
  MCP_CONFIRMATION_SECRET: "test-confirmation-secret",
};

function authenticatedRequest() {
  return new Request("https://mcp-staging.voyageplan.app/mcp", {
    headers: { Authorization: "Bearer signed-token" },
  });
}

describe("authenticateClerkOAuthRequestWith", () => {
  it("accepts ChatGPT's safe OIDC identity scopes from the Voyage Clerk instance", async () => {
    const verifyClerkToken = vi.fn(async () => ({
      iss: bindings.CLERK_AUTHORIZATION_SERVER,
      sub: "user_123",
      client_id: "dynamic_client_123",
      scope: "openid profile email offline_access",
    }));

    await expect(
      authenticateClerkOAuthRequestWith(
        authenticatedRequest(),
        bindings,
        verifyClerkToken as never,
      ),
    ).resolves.toEqual({
      userId: "user_123",
      subject: "user_123",
      clientId: "dynamic_client_123",
      scopes: ["openid", "profile", "email", "offline_access"],
    });

    expect(verifyClerkToken).toHaveBeenCalledWith("signed-token", {
      headerType: ["at+jwt", "application/at+jwt"],
      jwtKey: bindings.CLERK_JWT_KEY,
    });
  });

  it("rejects a verified token without the openid scope", async () => {
    const verifyClerkToken = vi.fn(async () => ({
      iss: bindings.CLERK_AUTHORIZATION_SERVER,
      sub: "user_123",
      client_id: "dynamic_client_123",
      scope: "offline_access",
    }));

    await expect(
      authenticateClerkOAuthRequestWith(
        authenticatedRequest(),
        bindings,
        verifyClerkToken as never,
      ),
    ).resolves.toBeNull();
  });

  it("rejects a token from another Clerk issuer", async () => {
    const verifyClerkToken = vi.fn(async () => ({
      iss: "https://attacker.example",
      sub: "user_123",
      client_id: "dynamic_client_123",
      scope: "openid",
    }));

    await expect(
      authenticateClerkOAuthRequestWith(
        authenticatedRequest(),
        bindings,
        verifyClerkToken as never,
      ),
    ).resolves.toBeNull();
  });

  it("rejects requests without a bearer token before verification", async () => {
    const verifyClerkToken = vi.fn();

    await expect(
      authenticateClerkOAuthRequestWith(
        new Request("https://mcp-staging.voyageplan.app/mcp"),
        bindings,
        verifyClerkToken as never,
      ),
    ).resolves.toBeNull();
    expect(verifyClerkToken).not.toHaveBeenCalled();
  });
});
