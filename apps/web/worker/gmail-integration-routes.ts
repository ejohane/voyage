import {
  gmailConnectInputSchema,
  gmailConnectionSchema,
  gmailConnectResponseSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import { decryptSecret, encryptSecret, randomBase64Url, sha256Base64Url } from "./gmail-crypto";
import {
  consumeGmailOAuthState,
  deleteGmailConnection,
  getGmailConnection,
  saveGmailConnection,
  saveGmailOAuthState,
} from "./gmail-repository";
import {
  exchangeGoogleCode,
  getGmailProfile,
  googleAuthorizationUrl,
  revokeGoogleToken,
} from "./google-oauth";
import type { WorkerEnvironment } from "./types";

type GmailIntegrationDependencies = {
  fetcher?: typeof fetch;
};

function callbackUri(request: Request) {
  return `${new URL(request.url).origin}/api/integrations/gmail/callback`;
}

function safeReturnTo(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/trips";
}

function redirectWithResult(request: Request, returnTo: string, result: "connected" | "error") {
  const url = new URL(safeReturnTo(returnTo), new URL(request.url).origin);
  url.searchParams.set("gmail", result);
  return url.toString();
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createGmailIntegrationRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: GmailIntegrationDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();
  const authenticate = createAuthMiddleware(authenticateRequest);
  const fetcher = dependencies.fetcher ?? fetch;

  routes.post("/connect", authenticate, async (context) => {
    const parsed = gmailConnectInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success || parsed.data.returnTo.startsWith("//")) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Choose a valid Voyage return page.",
          },
        },
        422,
      );
    }

    const origin = new URL(context.req.url).origin;
    const authorizedOrigins = context.env.CLERK_AUTHORIZED_PARTIES.split(",").map((value) =>
      value.trim(),
    );
    if (!authorizedOrigins.includes(origin)) {
      return context.json(
        { error: { code: "forbidden" as const, message: "This origin cannot connect Gmail." } },
        403,
      );
    }

    const state = randomBase64Url();
    const codeVerifier = randomBase64Url();
    const now = new Date();
    await saveGmailOAuthState(context.env.DB, {
      stateHash: await sha256Base64Url(state),
      userId: context.var.authUserId,
      encryptedCodeVerifier: await encryptSecret(
        codeVerifier,
        context.env.GMAIL_TOKEN_ENCRYPTION_KEY,
      ),
      returnTo: parsed.data.returnTo,
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
      createdAt: now.toISOString(),
    });

    const authorizationUrl = googleAuthorizationUrl({
      clientId: context.env.GOOGLE_OAUTH_CLIENT_ID,
      redirectUri: callbackUri(context.req.raw),
      state,
      codeChallenge: await sha256Base64Url(codeVerifier),
    });

    return context.json(gmailConnectResponseSchema.parse({ authorizationUrl }), 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.get("/callback", async (context) => {
    const stateValue = context.req.query("state");
    const code = context.req.query("code");
    if (!stateValue || !code) {
      return context.redirect(redirectWithResult(context.req.raw, "/trips", "error"));
    }

    const oauthState = await consumeGmailOAuthState(
      context.env.DB,
      await sha256Base64Url(stateValue),
      new Date().toISOString(),
    );
    if (!oauthState) {
      return context.redirect(redirectWithResult(context.req.raw, "/trips", "error"));
    }

    try {
      const tokens = await exchangeGoogleCode(fetcher, {
        code,
        codeVerifier: await decryptSecret(
          oauthState.encryptedCodeVerifier,
          context.env.GMAIL_TOKEN_ENCRYPTION_KEY,
        ),
        clientId: context.env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: context.env.GOOGLE_OAUTH_CLIENT_SECRET,
        redirectUri: callbackUri(context.req.raw),
      });
      const profile = await getGmailProfile(fetcher, tokens.access_token);
      const existing = await getGmailConnection(context.env.DB, oauthState.userId);
      const encryptedRefreshToken = tokens.refresh_token
        ? await encryptSecret(tokens.refresh_token, context.env.GMAIL_TOKEN_ENCRYPTION_KEY)
        : existing?.encryptedRefreshToken;

      if (!encryptedRefreshToken) throw new Error("Google did not provide a refresh token.");

      const now = new Date().toISOString();
      await saveGmailConnection(context.env.DB, {
        userId: oauthState.userId,
        email: profile.emailAddress,
        encryptedRefreshToken,
        scope: tokens.scope ?? "https://www.googleapis.com/auth/gmail.readonly",
        connectedAt: existing?.connectedAt ?? now,
        updatedAt: now,
      });

      return context.redirect(
        redirectWithResult(context.req.raw, oauthState.returnTo, "connected"),
      );
    } catch {
      return context.redirect(redirectWithResult(context.req.raw, oauthState.returnTo, "error"));
    }
  });

  routes.get("/", authenticate, async (context) => {
    const connection = await getGmailConnection(context.env.DB, context.var.authUserId);
    const response = connection
      ? { connected: true as const, email: connection.email, connectedAt: connection.connectedAt }
      : { connected: false as const };
    return context.json(gmailConnectionSchema.parse(response), 200, {
      "Cache-Control": "no-store",
    });
  });

  routes.delete("/", authenticate, async (context) => {
    const connection = await getGmailConnection(context.env.DB, context.var.authUserId);
    try {
      if (connection) {
        const refreshToken = await decryptSecret(
          connection.encryptedRefreshToken,
          context.env.GMAIL_TOKEN_ENCRYPTION_KEY,
        );
        await revokeGoogleToken(fetcher, refreshToken);
      }
    } finally {
      await deleteGmailConnection(context.env.DB, context.var.authUserId);
    }
    return context.body(null, 204);
  });

  return routes;
}
