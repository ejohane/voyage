export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: "staging" | "production";
  APP_URL: string;
  MCP_RESOURCE_URL: string;
  CLERK_AUTHORIZATION_SERVER: string;
  CLERK_JWT_KEY: string;
  MCP_CONFIRMATION_SECRET: string;
  MCP_RATE_LIMITER: RateLimit;
  OPENAI_APPS_CHALLENGE?: string;
}

export interface LinkedVoyageIdentity {
  userId: string;
  subject: string;
  clientId: string;
  scopes: string[];
}

export type AuthenticateOAuthRequest = (
  request: Request,
  bindings: Bindings,
) => Promise<LinkedVoyageIdentity | null>;
