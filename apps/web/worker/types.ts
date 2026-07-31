export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
  CLERK_SECRET_KEY?: string;
  RESEND_API_KEY?: string;
  INVITATION_FROM_EMAIL?: string;
  APP_URL?: string;
  GOOGLE_OAUTH_CLIENT_ID: string;
  GOOGLE_OAUTH_CLIENT_SECRET: string;
  GMAIL_TOKEN_ENCRYPTION_KEY: string;
  GOOGLE_MAPS_API_KEY: string;
  GOOGLE_STATIC_MAPS_API_KEY: string;
};

export type Variables = {
  authUserId: string;
  apiRequestId: string;
};

export type WorkerEnvironment = {
  Bindings: Bindings;
  Variables: Variables;
};
