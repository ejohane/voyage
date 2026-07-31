import { verifyToken } from "@clerk/backend";
import { createMiddleware } from "hono/factory";
import type { Bindings, WorkerEnvironment } from "./types";

export type AuthenticateRequest = (request: Request, bindings: Bindings) => Promise<string | null>;

type VerifySessionToken = (
  token: string,
  options: { authorizedParties?: string[]; jwtKey: string },
) => Promise<{ sub: string; azp?: string }>;

function configuredAuthorizedParties(bindings: Bindings) {
  return bindings.CLERK_AUTHORIZED_PARTIES.split(",")
    .map((party) => party.trim())
    .filter(Boolean);
}

export function createAuthenticateClerkRequest(
  verifySessionToken: VerifySessionToken = verifyToken,
): AuthenticateRequest {
  return async (request, bindings) => {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token || !bindings.CLERK_JWT_KEY) {
      return null;
    }

    try {
      const authorizedParties = configuredAuthorizedParties(bindings);
      const payload = await verifySessionToken(token, {
        authorizedParties,
        jwtKey: bindings.CLERK_JWT_KEY,
      });

      // Keep browser and legacy API routes strict even when the verifier is replaced in a test.
      if (!payload.azp || !authorizedParties.includes(payload.azp)) {
        return null;
      }

      return payload.sub;
    } catch {
      return null;
    }
  };
}

export function createAuthenticateClerkV1Request(
  verifySessionToken: VerifySessionToken = verifyToken,
): AuthenticateRequest {
  return async (request, bindings) => {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token || !bindings.CLERK_JWT_KEY) {
      return null;
    }

    try {
      const payload = await verifySessionToken(token, {
        jwtKey: bindings.CLERK_JWT_KEY,
      });
      const authorizedParties = configuredAuthorizedParties(bindings);

      // Clerk's native flow does not send an Origin, so its signed session token can omit azp.
      // This does not attest that the caller is an iOS app. The exception is intentionally limited
      // to the Bearer-only v1 API and rejects an azp-less token when the request has a browser Origin.
      if (payload.azp === undefined && request.headers.has("Origin")) {
        return null;
      }
      if (payload.azp !== undefined && !authorizedParties.includes(payload.azp)) {
        return null;
      }

      return payload.sub;
    } catch {
      return null;
    }
  };
}

export const authenticateClerkRequest = createAuthenticateClerkRequest();
export const authenticateClerkV1Request = createAuthenticateClerkV1Request();

export function createAuthMiddleware(authenticateRequest: AuthenticateRequest) {
  return createMiddleware<WorkerEnvironment>(async (context, next) => {
    const userId = await authenticateRequest(context.req.raw, context.env);

    if (!userId) {
      return context.json(
        {
          error: {
            code: "unauthorized" as const,
            message: "Sign in to continue.",
          },
        },
        401,
      );
    }

    context.set("authUserId", userId);
    await next();
  });
}
