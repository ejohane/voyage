CREATE TABLE gmail_connections (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  scope TEXT NOT NULL,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE gmail_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  encrypted_code_verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX gmail_oauth_states_by_expiration ON gmail_oauth_states(expires_at);

CREATE TABLE gmail_import_sources (
  user_id TEXT NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK (item_type IN ('travel', 'stay')),
  item_id TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  PRIMARY KEY (user_id, trip_id, source_key)
);

CREATE INDEX gmail_import_sources_by_trip ON gmail_import_sources(trip_id, item_type, item_id);
