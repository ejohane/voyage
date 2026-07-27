import { describe, expect, it, vi } from "vitest";
import { createVoyageMcpWorker } from "../src";
import type { AuthenticateOAuthRequest, Bindings } from "../src/types";

const bindings: Bindings = {
  ENVIRONMENT: "staging",
  MCP_RESOURCE_URL: "https://mcp-staging.voyageplan.app",
  CLERK_AUTHORIZATION_SERVER: "https://example.clerk.accounts.dev",
  CLERK_JWT_KEY: "test-public-key",
};

const context = {
  passThroughOnException: vi.fn(),
  waitUntil: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

function mcpRequest(method: string, params: Record<string, unknown> = {}, id = 1): Request {
  return new Request("https://mcp-staging.voyageplan.app/mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
}

describe("Voyage Phase 0 MCP worker", () => {
  it("publishes protected resource metadata without exposing trip access", async () => {
    const worker = createVoyageMcpWorker(async () => null);
    const response = await worker.fetch(
      new Request("https://mcp-staging.voyageplan.app/.well-known/oauth-protected-resource"),
      bindings,
      context,
    );

    await expect(response.json()).resolves.toEqual({
      resource: bindings.MCP_RESOURCE_URL,
      authorization_servers: [bindings.CLERK_AUTHORIZATION_SERVER],
      scopes_supported: ["openid"],
      bearer_methods_supported: ["header"],
      resource_documentation: "https://voyageplan.app",
    });
  });

  it("initializes and advertises one read-only OAuth tool", async () => {
    const authenticate = vi.fn<AuthenticateOAuthRequest>(async () => null);
    const worker = createVoyageMcpWorker(authenticate);

    const initializeResponse = await worker.fetch(
      mcpRequest("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "voyage-test", version: "1.0.0" },
      }),
      bindings,
      context,
    );
    const initialize = (await initializeResponse.json()) as {
      result: { serverInfo: { name: string } };
    };
    expect(initialize.result.serverInfo.name).toBe("voyage-trip-planner");

    const listResponse = await worker.fetch(mcpRequest("tools/list"), bindings, context);
    const list = (await listResponse.json()) as {
      result: {
        tools: Array<{
          name: string;
          annotations: Record<string, boolean>;
          securitySchemes: unknown[];
        }>;
      };
    };

    expect(list.result.tools).toHaveLength(1);
    expect(list.result.tools[0]).toMatchObject({
      name: "get_connection_status",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
      securitySchemes: [{ type: "oauth2", scopes: ["openid"] }],
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns an MCP OAuth challenge instead of account data when unauthenticated", async () => {
    const worker = createVoyageMcpWorker(async () => null);
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_connection_status", arguments: {} }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { isError: boolean; _meta: Record<string, string[]> };
    };

    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toContain(
      `${bindings.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`,
    );
  });

  it("returns only the linked subject and explicit no-trip-access state", async () => {
    const worker = createVoyageMcpWorker(async () => ({
      userId: "user_123",
      subject: "user_123",
      scopes: ["openid"],
    }));
    const response = await worker.fetch(
      mcpRequest("tools/call", { name: "get_connection_status", arguments: {} }),
      bindings,
      context,
    );
    const body = (await response.json()) as {
      result: { structuredContent: Record<string, unknown> };
    };

    expect(body.result.structuredContent).toEqual({
      accountSubject: "user_123",
      environment: "staging",
      tripDataAccess: false,
    });
  });
});
