type Fetcher = typeof fetch;

type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

type GmailProfile = {
  emailAddress: string;
};

type GoogleErrorResponse = {
  error?: string;
};

export class GoogleOAuthError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(action: string, status: number, code?: string) {
    super(`Google ${action} failed with status ${status}.`);
    this.name = "GoogleOAuthError";
    this.status = status;
    this.code = code;
  }

  get requiresReauthorization() {
    return this.code === "invalid_grant";
  }
}

async function googleJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    let code: string | undefined;
    try {
      code = (await response.clone().json<GoogleErrorResponse>()).error;
    } catch {
      // Google does not guarantee a JSON error body for dependency failures.
    }
    throw new GoogleOAuthError(action, response.status, code);
  }
  return response.json<T>();
}

export function googleAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export async function exchangeGoogleCode(
  fetcher: Fetcher,
  input: {
    code: string;
    codeVerifier: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  },
) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      code_verifier: input.codeVerifier,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  return googleJson<GoogleTokenResponse>(response, "authorization-code exchange");
}

export async function refreshGoogleAccessToken(
  fetcher: Fetcher,
  input: { refreshToken: string; clientId: string; clientSecret: string },
) {
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token",
    }),
  });
  return googleJson<GoogleTokenResponse>(response, "token refresh");
}

export async function getGmailProfile(fetcher: Fetcher, accessToken: string) {
  const response = await fetcher("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return googleJson<GmailProfile>(response, "profile read");
}

export async function revokeGoogleToken(fetcher: Fetcher, token: string) {
  await fetcher("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}
