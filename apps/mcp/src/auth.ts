import { verifyToken } from "@clerk/backend";
import { requiredOAuthScopes } from "./oauth-scopes";
import type { AuthenticateOAuthRequest, Bindings, LinkedVoyageIdentity } from "./types";

const clerkOAuthJwtTypes = ["at+jwt", "application/at+jwt"];

type VerifyClerkToken = typeof verifyToken;

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function authenticateClerkOAuthRequestWith(
  request: Request,
  bindings: Bindings,
  verifyClerkToken: VerifyClerkToken,
): Promise<LinkedVoyageIdentity | null> {
  const token = bearerToken(request);
  if (!token) {
    return null;
  }

  try {
    const claims = await verifyClerkToken(token, {
      headerType: clerkOAuthJwtTypes,
      jwtKey: bindings.CLERK_JWT_KEY,
    });
    const oauthClaims = claims as typeof claims & {
      client_id?: unknown;
      scope?: unknown;
      scp?: unknown;
    };
    const scopes = Array.isArray(oauthClaims.scp)
      ? oauthClaims.scp.filter((scope): scope is string => typeof scope === "string")
      : typeof oauthClaims.scope === "string"
        ? oauthClaims.scope.split(" ").filter(Boolean)
        : [];

    if (
      claims.iss !== bindings.CLERK_AUTHORIZATION_SERVER ||
      typeof claims.sub !== "string" ||
      !claims.sub.startsWith("user_") ||
      typeof oauthClaims.client_id !== "string" ||
      oauthClaims.client_id.length === 0 ||
      !requiredOAuthScopes.every((scope) => scopes.includes(scope))
    ) {
      return null;
    }

    return {
      userId: claims.sub,
      subject: claims.sub,
      clientId: oauthClaims.client_id,
      scopes,
    };
  } catch {
    return null;
  }
}

export const authenticateClerkOAuthRequest: AuthenticateOAuthRequest = (request, bindings) =>
  authenticateClerkOAuthRequestWith(request, bindings, verifyToken);
