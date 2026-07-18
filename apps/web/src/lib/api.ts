import { useAuth } from "@clerk/react";
import { type ApiError, apiErrorSchema } from "@voyage/contracts";
import { useCallback } from "react";

type GetToken = () => Promise<string | null>;

class ApiRequestError extends Error {
  readonly status: number;
  readonly code: ApiError["error"]["code"];
  readonly fieldErrors?: Record<string, string[]>;

  constructor(status: number, error: ApiError["error"]) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.fieldErrors = error.fieldErrors;
  }
}

async function apiRequest<T>(getToken: GetToken, path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();

  if (!token) {
    throw new ApiRequestError(401, {
      code: "unauthorized",
      message: "Sign in to continue.",
    });
  }

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("Authorization", `Bearer ${token}`);

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...init, headers });
  const payload: unknown = response.status === 204 ? undefined : await response.json();

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(payload);

    if (parsed.success) {
      throw new ApiRequestError(response.status, parsed.data.error);
    }

    throw new ApiRequestError(response.status, {
      code: "internal_error",
      message: "Something went wrong. Please try again.",
    });
  }

  return payload as T;
}

function useApiRequest() {
  const { getToken } = useAuth();

  return useCallback(
    <T>(path: string, init?: RequestInit) => apiRequest<T>(() => getToken(), path, init),
    [getToken],
  );
}

export { ApiRequestError, apiRequest, useApiRequest };
