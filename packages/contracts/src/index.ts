export const healthEndpoint = "/api/health" as const;

export type HealthResponse = {
  status: "ok";
  service: "voyage-api";
  environment: string;
  checkedAt: string;
};
