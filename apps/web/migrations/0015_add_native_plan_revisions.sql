ALTER TABLE trip_plans
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1);

CREATE TABLE api_idempotency_records (
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'create_plan'),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation, idempotency_key)
);

CREATE INDEX api_idempotency_records_by_trip
  ON api_idempotency_records(trip_id, created_at DESC);
