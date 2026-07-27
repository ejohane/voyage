import { createMcpHandler } from "agents/mcp";
import { authenticateClerkOAuthRequest } from "./auth";
import { authenticationChallenge, createVoyageMcpServer } from "./server";
import type { AuthenticateOAuthRequest, Bindings } from "./types";

type McpEnvelope = {
  id?: unknown;
  method?: unknown;
};

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
          phase: 1,
          environment: bindings.ENVIRONMENT,
          tripDataAccess: "read-only",
        });
      }

      if (url.pathname !== "/mcp") {
        return jsonResponse({ error: "not_found" }, 404);
      }

      if (request.method === "POST" && request.headers.get("content-length") === "0") {
        const response = Response.json(
          {
            error: "unauthorized",
            error_description: "Connect your Voyage account to continue",
          },
          {
            status: 401,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Cache-Control": "no-store",
              "WWW-Authenticate": authenticationChallenge(bindings),
            },
          },
        );

        console.info(
          JSON.stringify({
            event: "mcp_request",
            httpMethod: request.method,
            requestType: request.headers.get("content-type"),
            accept: request.headers.get("accept"),
            contentLength: request.headers.get("content-length"),
            rpcMethods: [],
            rpcIdPresent: false,
            status: response.status,
            responseType: response.headers.get("content-type"),
            sessionCreated: false,
          }),
        );

        return response;
      }

      const server = createVoyageMcpServer(request, bindings, authenticateOAuthRequest);
      const payload = await request
        .clone()
        .json<McpEnvelope | McpEnvelope[]>()
        .catch(() => null);
      const envelopes = Array.isArray(payload) ? payload : payload ? [payload] : [];
      const response = await createMcpHandler(server, {
        route: "/mcp",
        enableJsonResponse: true,
      })(request, bindings, context);

      console.info(
        JSON.stringify({
          event: "mcp_request",
          httpMethod: request.method,
          requestType: request.headers.get("content-type"),
          accept: request.headers.get("accept"),
          contentLength: request.headers.get("content-length"),
          rpcMethods: envelopes
            .map((envelope) => envelope.method)
            .filter((method): method is string => typeof method === "string"),
          rpcIdPresent: envelopes.some((envelope) => envelope.id !== undefined),
          status: response.status,
          responseType: response.headers.get("content-type"),
          sessionCreated: response.headers.has("mcp-session-id"),
        }),
      );

      return response;
    },
  } satisfies ExportedHandler<Bindings>;
}

export default createVoyageMcpWorker(authenticateClerkOAuthRequest);
