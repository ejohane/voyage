const resource = process.env.MCP_RESOURCE_URL ?? "https://mcp-staging.voyageplan.app";
const authorizationServer =
  process.env.CLERK_AUTHORIZATION_SERVER ?? "https://special-bullfrog-79.clerk.accounts.dev";

function base64Url(bytes) {
  return Buffer.from(bytes)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomUrlSafeBytes(length = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function decodeJwtPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Clerk did not issue a JWT access token");
  }

  return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
}

function decodeJwtHeader(token) {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

function includesAudience(audience, expected) {
  return Array.isArray(audience) ? audience.includes(expected) : audience === expected;
}

const metadataResponse = await fetch(
  `${authorizationServer}/.well-known/oauth-authorization-server`,
);
if (!metadataResponse.ok) {
  throw new Error(`Authorization metadata failed: ${metadataResponse.status}`);
}
const metadata = await metadataResponse.json();

let resolveCallback;
let rejectCallback;
const callbackPromise = new Promise((resolve, reject) => {
  resolveCallback = resolve;
  rejectCallback = reject;
});

const state = randomUrlSafeBytes();
const callbackServer = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request) {
    const url = new URL(request.url);
    const returnedState = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");

    if (error) {
      rejectCallback(new Error(`Authorization failed: ${error}`));
      return new Response("Voyage authorization failed. You can close this tab.", {
        status: 400,
      });
    }
    if (!code || returnedState !== state) {
      rejectCallback(new Error("Authorization callback was missing code or valid state"));
      return new Response("Invalid Voyage authorization callback.", { status: 400 });
    }

    resolveCallback(code);
    return new Response("Voyage Phase 0 authorization succeeded. You can close this tab.");
  },
});

const redirectUri = `http://127.0.0.1:${callbackServer.port}/callback`;

try {
  const registrationResponse = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Voyage Phase 0 Verification",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid",
    }),
  });
  if (!registrationResponse.ok) {
    throw new Error(
      `Dynamic client registration failed (${registrationResponse.status}): ${await registrationResponse.text()}`,
    );
  }
  const registration = await registrationResponse.json();

  const verifier = randomUrlSafeBytes(64);
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    scope: "openid",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource,
  }).toString();

  console.log(`AUTHORIZATION_URL=${authorizationUrl}`);

  const timeout = setTimeout(
    () => rejectCallback(new Error("Timed out waiting for OAuth callback")),
    180_000,
  );
  const code = await callbackPromise.finally(() => clearTimeout(timeout));

  const tokenResponse = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: registration.client_id,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource,
    }),
  });
  if (!tokenResponse.ok) {
    throw new Error(
      `Token exchange failed (${tokenResponse.status}): ${await tokenResponse.text()}`,
    );
  }
  const token = await tokenResponse.json();
  const tokenHeader = decodeJwtHeader(token.access_token);
  const claims = decodeJwtPayload(token.access_token);
  const tokenDiagnostics = {
    header: { alg: tokenHeader.alg, typ: tokenHeader.typ, keyIdPresent: Boolean(tokenHeader.kid) },
    claimNames: Object.keys(claims).sort(),
    issuerMatches: claims.iss === authorizationServer,
    audience: claims.aud,
    audienceIncludesResource: includesAudience(claims.aud, resource),
    authorizedPartyMatchesClient: claims.azp === registration.client_id,
    clientIdMatches: claims.client_id === registration.client_id,
    tokenScope: token.scope,
    scopeClaim: claims.scope,
    scopesClaim: claims.scp,
    subjectPresent: typeof claims.sub === "string" && claims.sub.length > 0,
  };

  console.log(JSON.stringify({ tokenDiagnostics }, null, 2));

  const mcpResponse = await fetch(`${resource}/mcp`, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token.access_token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_connection_status", arguments: {} },
    }),
  });
  if (!mcpResponse.ok) {
    throw new Error(`MCP request failed: ${mcpResponse.status}`);
  }
  const mcp = await mcpResponse.json();
  if (mcp.error) {
    throw new Error(`MCP protocol error: ${JSON.stringify(mcp.error)}`);
  }
  if (mcp.result?.isError) {
    throw new Error(`MCP tool rejected the token: ${JSON.stringify(mcp.result)}`);
  }

  const result = mcp.result?.structuredContent;
  if (result?.tripDataAccess !== false) {
    throw new Error("MCP tool did not preserve the Phase 0 data boundary");
  }
  if (result.accountSubject !== claims.sub) {
    throw new Error("MCP account subject did not match the access token subject");
  }

  console.log(
    JSON.stringify(
      {
        dcr: true,
        pkce: "S256",
        accessToken: {
          jwt: true,
          issuerMatches: tokenDiagnostics.issuerMatches,
          audienceIncludesResource: tokenDiagnostics.audienceIncludesResource,
          openidGranted:
            token.scope?.split(" ").includes("openid") ||
            claims.scp?.includes?.("openid") ||
            claims.scope?.split?.(" ").includes("openid"),
        },
        mcp: {
          tool: "get_connection_status",
          accountSubjectMatches: true,
          environment: result.environment,
          tripDataAccess: result.tripDataAccess,
        },
      },
      null,
      2,
    ),
  );
} finally {
  callbackServer.stop(true);
}
