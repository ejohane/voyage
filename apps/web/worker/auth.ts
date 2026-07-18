import { verifyToken } from "@clerk/backend";
import { createMiddleware } from "hono/factory";
import type { Bindings, WorkerEnvironment } from "./types";

export type AuthenticateRequest = (request: Request, bindings: Bindings) => Promise<string | null>;

export const authenticateClerkRequest: AuthenticateRequest = async (request, bindings) => {
  const authorization = request.headers.get("Authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

  if (!token || !bindings.CLERK_JWT_KEY) {
    return null;
  }

  try {
    const payload = await verifyToken(token, {
      authorizedParties: bindings.CLERK_AUTHORIZED_PARTIES.split(",").map((party) => party.trim()),
      jwtKey: bindings.CLERK_JWT_KEY,
    });

    return payload.sub;
  } catch {
    return null;
  }
};

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
