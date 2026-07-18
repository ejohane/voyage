export type Bindings = {
  DB: D1Database;
  ENVIRONMENT: string;
  CLERK_JWT_KEY: string;
  CLERK_AUTHORIZED_PARTIES: string;
};

export type Variables = {
  authUserId: string;
};

export type WorkerEnvironment = {
  Bindings: Bindings;
  Variables: Variables;
};
