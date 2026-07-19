export type GmailConnectionRecord = {
  userId: string;
  email: string;
  encryptedRefreshToken: string;
  scope: string;
  connectedAt: string;
  updatedAt: string;
};

export type GmailOAuthState = {
  stateHash: string;
  userId: string;
  encryptedCodeVerifier: string;
  returnTo: string;
  expiresAt: string;
  createdAt: string;
};

type GmailConnectionRow = {
  user_id: string;
  email: string;
  encrypted_refresh_token: string;
  scope: string;
  connected_at: string;
  updated_at: string;
};

type GmailOAuthStateRow = {
  state_hash: string;
  user_id: string;
  encrypted_code_verifier: string;
  return_to: string;
  expires_at: string;
  created_at: string;
};

function mapConnection(row: GmailConnectionRow): GmailConnectionRecord {
  return {
    userId: row.user_id,
    email: row.email,
    encryptedRefreshToken: row.encrypted_refresh_token,
    scope: row.scope,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
  };
}

function mapState(row: GmailOAuthStateRow): GmailOAuthState {
  return {
    stateHash: row.state_hash,
    userId: row.user_id,
    encryptedCodeVerifier: row.encrypted_code_verifier,
    returnTo: row.return_to,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

export async function getGmailConnection(database: D1Database, userId: string) {
  const row = await database
    .prepare("SELECT * FROM gmail_connections WHERE user_id = ?")
    .bind(userId)
    .first<GmailConnectionRow>();

  return row ? mapConnection(row) : null;
}

export async function saveGmailConnection(database: D1Database, connection: GmailConnectionRecord) {
  await database
    .prepare(
      `INSERT INTO gmail_connections (
        user_id, email, encrypted_refresh_token, scope, connected_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        email = excluded.email,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        scope = excluded.scope,
        updated_at = excluded.updated_at`,
    )
    .bind(
      connection.userId,
      connection.email,
      connection.encryptedRefreshToken,
      connection.scope,
      connection.connectedAt,
      connection.updatedAt,
    )
    .run();
}

export async function deleteGmailConnection(database: D1Database, userId: string) {
  await database.batch([
    database.prepare("DELETE FROM gmail_connections WHERE user_id = ?").bind(userId),
    database.prepare("DELETE FROM gmail_oauth_states WHERE user_id = ?").bind(userId),
  ]);
}

export async function saveGmailOAuthState(database: D1Database, state: GmailOAuthState) {
  await database.batch([
    database.prepare("DELETE FROM gmail_oauth_states WHERE expires_at <= ?").bind(state.createdAt),
    database
      .prepare(
        `INSERT INTO gmail_oauth_states (
          state_hash, user_id, encrypted_code_verifier, return_to, expires_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        state.stateHash,
        state.userId,
        state.encryptedCodeVerifier,
        state.returnTo,
        state.expiresAt,
        state.createdAt,
      ),
  ]);
}

export async function consumeGmailOAuthState(database: D1Database, stateHash: string, now: string) {
  const row = await database
    .prepare(
      `DELETE FROM gmail_oauth_states
       WHERE state_hash = ? AND expires_at > ?
       RETURNING *`,
    )
    .bind(stateHash, now)
    .first<GmailOAuthStateRow>();

  return row ? mapState(row) : null;
}

export async function listImportedSourceKeys(database: D1Database, userId: string, tripId: string) {
  const result = await database
    .prepare("SELECT source_key FROM gmail_import_sources WHERE user_id = ? AND trip_id = ?")
    .bind(userId, tripId)
    .all<{ source_key: string }>();

  return new Set(result.results.map((row) => row.source_key));
}
