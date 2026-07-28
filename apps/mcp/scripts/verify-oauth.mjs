const resource = process.env.MCP_RESOURCE_URL ?? "https://mcp-staging.voyageplan.app";
const authorizationServer =
  process.env.CLERK_AUTHORIZATION_SERVER ?? "https://clerk.voyageplan.app";
const configuredDefaultScopes = ["openid", "profile", "email"];
const requestedScopes = [...configuredDefaultScopes, "offline_access"];
const requestedScope = requestedScopes.join(" ");
const sensitiveScopes = new Set(["public_metadata", "private_metadata"]);

function parseScopes(...values) {
  return new Set(
    values
      .flatMap((value) =>
        Array.isArray(value) ? value : typeof value === "string" ? value.trim().split(/\s+/) : [],
      )
      .filter(Boolean),
  );
}

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
const oidcMetadataResponse = await fetch(`${authorizationServer}/.well-known/openid-configuration`);
if (!oidcMetadataResponse.ok) {
  throw new Error(`OIDC metadata failed: ${oidcMetadataResponse.status}`);
}
const oidcMetadata = await oidcMetadataResponse.json();
if (typeof oidcMetadata.userinfo_endpoint !== "string" || !oidcMetadata.userinfo_endpoint) {
  throw new Error("OIDC metadata did not advertise a user-info endpoint");
}

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
    return new Response("Voyage Phase 3 authorization succeeded. You can close this tab.");
  },
});

const redirectUri = `http://127.0.0.1:${callbackServer.port}/callback`;

try {
  const registrationResponse = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Voyage Phase 3 Verification",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  if (!registrationResponse.ok) {
    throw new Error(
      `Dynamic client registration failed (${registrationResponse.status}): ${await registrationResponse.text()}`,
    );
  }
  const registration = await registrationResponse.json();
  const registeredScopes = parseScopes(registration.scope);
  if (
    registeredScopes.size !== requestedScopes.length ||
    !requestedScopes.every((scope) => registeredScopes.has(scope))
  ) {
    throw new Error(
      `Dynamic client registration returned scopes [${[...registeredScopes].sort().join(", ")}], expected [${[...requestedScopes].sort().join(", ")}]`,
    );
  }

  const verifier = randomUrlSafeBytes(64);
  const challenge = base64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const authorizationUrl = new URL(metadata.authorization_endpoint);
  authorizationUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: registration.client_id,
    redirect_uri: redirectUri,
    scope: requestedScope,
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
  const grantedScopes = parseScopes(token.scope, claims.scope, claims.scp);
  if (!requestedScopes.every((scope) => grantedScopes.has(scope))) {
    throw new Error(`OAuth token did not grant the Phase 3 scopes: ${requestedScope}`);
  }
  if ([...sensitiveScopes].some((scope) => grantedScopes.has(scope))) {
    throw new Error("OAuth token granted a sensitive Clerk metadata scope");
  }

  const userInfoResponse = await fetch(oidcMetadata.userinfo_endpoint, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  if (!userInfoResponse.ok) {
    throw new Error(`OIDC user info failed (${userInfoResponse.status})`);
  }
  const userInfo = await userInfoResponse.json();
  const oidcIdentity = {
    subjectMatches: userInfo.sub === claims.sub,
    emailPresent: typeof userInfo.email === "string" && userInfo.email.length > 0,
    profileScopeGranted: grantedScopes.has("profile"),
  };
  if (!oidcIdentity.subjectMatches || !oidcIdentity.emailPresent) {
    throw new Error("OIDC user info did not return the linked Voyage identity and email claim");
  }
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
    safeScopesGranted: requestedScopes.every((scope) => grantedScopes.has(scope)),
    sensitiveScopesGranted: [...sensitiveScopes].some((scope) => grantedScopes.has(scope)),
  };

  console.log(JSON.stringify({ tokenDiagnostics }, null, 2));

  async function callTool(id, name, args = {}) {
    const response = await fetch(`${resource}/mcp`, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    });
    if (!response.ok) throw new Error(`MCP request failed: ${response.status}`);

    const payload = await response.json();
    if (payload.error) throw new Error(`MCP protocol error: ${JSON.stringify(payload.error)}`);
    if (payload.result?.isError) {
      throw new Error(`MCP tool rejected the token: ${JSON.stringify(payload.result)}`);
    }
    return payload.result?.structuredContent;
  }

  const result = await callTool(1, "get_connection_status");
  if (
    result?.tripDataAccess !== true ||
    result?.tripWriteAccess !== true ||
    result?.itineraryWriteAccess !== true ||
    result?.tripUpdateAccess !== true ||
    result?.itineraryUpdateAccess !== true
  ) {
    throw new Error("MCP tool did not expose the Phase 3 controlled update boundary");
  }
  if (result.connected !== true) {
    throw new Error("MCP did not report the Voyage account as connected");
  }
  const tripList = await callTool(2, "list_trips", { limit: 10 });
  if (!Array.isArray(tripList?.trips) || typeof tripList?.total !== "number") {
    throw new Error("MCP list_trips did not return the Phase 3 result contract");
  }
  const preview = await callTool(3, "preview_trip", {
    name: "OAuth verification preview",
    stops: [{ name: "Chicago", arrivalDate: null, departureDate: null }],
  });
  if (
    preview?.proposal?.name !== "OAuth verification preview" ||
    !preview?.confirmationToken?.startsWith("voyage-create-trip-v1:") ||
    typeof preview?.confirmationExpiresAt !== "string"
  ) {
    throw new Error("MCP preview_trip did not return the Phase 3 confirmation contract");
  }
  const editableTrip = tripList.trips.find(
    (trip) => trip.accessLevel !== "viewer" && Array.isArray(trip.stops) && trip.stops.length > 0,
  );
  const itineraryPreview = editableTrip
    ? await callTool(4, "preview_itinerary_items", {
        tripId: editableTrip.id,
        transportation: [],
        stays: [],
        plans: [
          {
            tripStopId: editableTrip.stops[0].id,
            title: "OAuth verification idea",
            category: "other",
            status: "idea",
            scheduledDate: null,
            startTime: null,
            endTime: null,
            location: null,
            confirmationNumber: null,
            bookingUrl: null,
            notes: null,
          },
        ],
      })
    : null;
  if (
    itineraryPreview &&
    (itineraryPreview.proposal?.counts?.total !== 1 ||
      !itineraryPreview.confirmationToken?.startsWith("voyage-add-itinerary-items-v1:") ||
      typeof itineraryPreview.confirmationExpiresAt !== "string")
  ) {
    throw new Error("MCP preview_itinerary_items did not return the Phase 3 confirmation contract");
  }

  console.log(
    JSON.stringify(
      {
        dcr: true,
        pkce: "S256",
        registration: {
          configuredDefaultsApplied: configuredDefaultScopes.every((scope) =>
            registeredScopes.has(scope),
          ),
          offlineAccessAdded: registeredScopes.has("offline_access"),
          sensitiveScopesGranted: [...sensitiveScopes].some((scope) => registeredScopes.has(scope)),
        },
        accessToken: {
          jwt: true,
          issuerMatches: tokenDiagnostics.issuerMatches,
          audienceIncludesResource: tokenDiagnostics.audienceIncludesResource,
          openidGranted:
            token.scope?.split(" ").includes("openid") ||
            claims.scp?.includes?.("openid") ||
            claims.scope?.split?.(" ").includes("openid"),
          safeScopesGranted: tokenDiagnostics.safeScopesGranted,
          sensitiveScopesGranted: tokenDiagnostics.sensitiveScopesGranted,
        },
        oidcIdentity: {
          subjectMatches: oidcIdentity.subjectMatches,
          emailPresent: oidcIdentity.emailPresent,
          profileScopeGranted: oidcIdentity.profileScopeGranted,
        },
        mcp: {
          tool: "get_connection_status",
          connected: true,
          environment: result.environment,
          tripDataAccess: result.tripDataAccess,
          tripWriteAccess: result.tripWriteAccess,
          itineraryWriteAccess: result.itineraryWriteAccess,
          tripUpdateAccess: result.tripUpdateAccess,
          itineraryUpdateAccess: result.itineraryUpdateAccess,
        },
        tripRead: {
          tool: "list_trips",
          resultShapeValid: true,
          accessibleTripCount: tripList.total,
        },
        tripPreview: {
          tool: "preview_trip",
          resultShapeValid: true,
          wroteData: false,
        },
        itineraryPreview: {
          tool: "preview_itinerary_items",
          resultShapeValid: itineraryPreview !== null,
          skipped: itineraryPreview === null,
          wroteData: false,
        },
      },
      null,
      2,
    ),
  );
} finally {
  callbackServer.stop(true);
}
