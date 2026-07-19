export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GMAIL_TOKEN_ENCRYPTION_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
};

export type Variables = {
  authUserId: string;
};

export type WorkerEnvironment = {
  Bindings: Bindings;
  Variables: Variables;
};
