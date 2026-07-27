import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { AuthenticateOAuthRequest, Bindings } from "./types";

const oauthSecuritySchemes = [{ type: "oauth2" as const, scopes: ["openid"] }];

const connectionTool = {
  name: "get_connection_status",
  title: "Check Voyage connection",
  description:
    "Confirm which Voyage account is connected. This Phase 0 diagnostic never reads trip data.",
  inputSchema: {
    type: "object" as const,
    properties: {},
    additionalProperties: false,
  },
  outputSchema: {
    type: "object" as const,
    properties: {
      accountSubject: { type: "string" as const },
      environment: { type: "string" as const, const: "staging" },
      tripDataAccess: { type: "boolean" as const, const: false },
    },
    required: ["accountSubject", "environment", "tripDataAccess"],
    additionalProperties: false,
  },
  securitySchemes: oauthSecuritySchemes,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
  },
  _meta: {
    securitySchemes: oauthSecuritySchemes,
  },
};

function authenticationChallenge(bindings: Bindings): string {
  const metadataUrl = `${bindings.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`;
  return `Bearer resource_metadata="${metadataUrl}", error="invalid_token", error_description="Connect your Voyage account to continue"`;
}

export function createVoyageMcpServer(
  request: Request,
  bindings: Bindings,
  authenticateOAuthRequest: AuthenticateOAuthRequest,
): McpServer {
  const server = new McpServer(
    {
      name: "voyage-trip-planner",
      version: "0.1.0-phase-0",
    },
    {
      instructions:
        "Phase 0 authentication diagnostic only. This server cannot read or change trip data. Never claim otherwise.",
    },
  );

  server.server.registerCapabilities({ tools: { listChanged: false } });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [connectionTool],
  }));
  server.server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name !== connectionTool.name) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${params.name}`);
    }

    const identity = await authenticateOAuthRequest(request, bindings);

    if (!identity) {
      const challenge = authenticationChallenge(bindings);
      return {
        content: [
          {
            type: "text",
            text: "Authentication required: connect your Voyage account to continue.",
          },
        ],
        _meta: {
          "mcp/www_authenticate": [challenge],
        },
        isError: true,
      };
    }

    const result = {
      accountSubject: identity.subject,
      environment: "staging" as const,
      tripDataAccess: false as const,
    };

    return {
      structuredContent: result,
      content: [
        {
          type: "text",
          text: "Voyage account connected. Phase 0 has no access to trip data.",
        },
      ],
    };
  });

  return server;
}
