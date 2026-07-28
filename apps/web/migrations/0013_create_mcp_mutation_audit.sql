CREATE TABLE mcp_mutations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  oauth_client_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('succeeded')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  UNIQUE (user_id, tool_name, idempotency_key)
);

CREATE INDEX mcp_mutations_by_user_and_created_at
  ON mcp_mutations(user_id, created_at DESC);
