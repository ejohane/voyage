CREATE TABLE api_idempotency_records_v2 (
  user_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'create_plan'),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  resource_id TEXT NOT NULL,
  response_json TEXT,
  resource_deleted_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, operation, idempotency_key),
  CHECK (
    (response_json IS NOT NULL AND resource_deleted_at IS NULL)
    OR (response_json IS NULL AND resource_deleted_at IS NOT NULL)
  ),
  CHECK (unixepoch(expires_at) > unixepoch(created_at))
);

INSERT INTO api_idempotency_records_v2 (
  user_id,
  operation,
  idempotency_key,
  request_hash,
  trip_id,
  resource_id,
  response_json,
  resource_deleted_at,
  created_at,
  expires_at
)
SELECT
  user_id,
  operation,
  idempotency_key,
  request_hash,
  trip_id,
  resource_id,
  response_json,
  NULL,
  created_at,
  strftime('%Y-%m-%dT%H:%M:%fZ', created_at, '+7 days')
FROM api_idempotency_records
WHERE unixepoch(created_at) > unixepoch('now', '-7 days')
  AND EXISTS (
    SELECT 1
    FROM trip_plans
    WHERE trip_plans.id = api_idempotency_records.resource_id
      AND trip_plans.trip_id = api_idempotency_records.trip_id
  );

DROP TABLE api_idempotency_records;
ALTER TABLE api_idempotency_records_v2 RENAME TO api_idempotency_records;

CREATE INDEX api_idempotency_records_by_trip
  ON api_idempotency_records(trip_id, created_at DESC);

CREATE INDEX api_idempotency_records_by_expiry
  ON api_idempotency_records(expires_at);

CREATE TRIGGER api_idempotency_records_tombstone_deleted_plan
AFTER DELETE ON trip_plans
BEGIN
  UPDATE api_idempotency_records
  SET
    response_json = NULL,
    resource_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE trip_id = OLD.trip_id
    AND resource_id = OLD.id;
END;
