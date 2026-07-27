export interface Bindings {
  DB: D1Database;
  ENVIRONMENT: "staging";
  APP_URL: string;
  MCP_RESOURCE_URL: string;
  CLERK_AUTHORIZATION_SERVER: string;
  CLERK_JWT_KEY: string;
}

export interface LinkedVoyageIdentity {
  userId: string;
  subject: string;
  scopes: string[];
}

export type AuthenticateOAuthRequest = (
  request: Request,
  bindings: Bindings,
) => Promise<LinkedVoyageIdentity | null>;
