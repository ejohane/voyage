const requestIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

export type BackendFailureCategory =
  | "dependency_error"
  | "maintenance_error"
  | "service_unavailable"
  | "unexpected_error";

export type BackendFailureMetadata = {
  requestId: string;
  operation: string;
  status: number;
  category: BackendFailureCategory;
};

export function backendRequestId(request: Request) {
  const supplied = request.headers.get("X-Request-ID");
  return supplied && requestIdPattern.test(supplied) ? supplied : crypto.randomUUID();
}

export function logBackendFailure(metadata: BackendFailureMetadata) {
  console.error(metadata);
}
