import { createMcpHandler } from "agents/mcp";
import { authenticateClerkOAuthRequest } from "./auth";
import { createVoyageMcpServer } from "./server";
import type { AuthenticateOAuthRequest, Bindings } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300",
    },
  });
}

function protectedResourceMetadata(bindings: Bindings): Response {
  return jsonResponse({
    resource: bindings.MCP_RESOURCE_URL,
    authorization_servers: [bindings.CLERK_AUTHORIZATION_SERVER],
    scopes_supported: ["openid"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://voyageplan.app",
  });
}

export function createVoyageMcpWorker(authenticateOAuthRequest: AuthenticateOAuthRequest) {
  return {
    async fetch(
      request: Request,
      bindings: Bindings,
      context: ExecutionContext,
    ): Promise<Response> {
      const url = new URL(request.url);

      if (
        request.method === "GET" &&
        (url.pathname === "/.well-known/oauth-protected-resource" ||
          url.pathname === "/.well-known/oauth-protected-resource/mcp")
      ) {
        return protectedResourceMetadata(bindings);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({
          status: "ok",
          service: "voyage-mcp",
          phase: 0,
          environment: bindings.ENVIRONMENT,
          tripDataAccess: false,
        });
      }

      if (url.pathname !== "/mcp") {
        return jsonResponse({ error: "not_found" }, 404);
      }

      const server = createVoyageMcpServer(request, bindings, authenticateOAuthRequest);
      return createMcpHandler(server, {
        route: "/mcp",
        enableJsonResponse: true,
      })(request, bindings, context);
    },
  } satisfies ExportedHandler<Bindings>;
}

export default createVoyageMcpWorker(authenticateClerkOAuthRequest);
