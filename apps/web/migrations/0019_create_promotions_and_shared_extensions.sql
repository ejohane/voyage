ALTER TABLE travel_segments ADD COLUMN departure_time_zone TEXT;
ALTER TABLE travel_segments ADD COLUMN arrival_time_zone TEXT;

ALTER TABLE trip_plans ADD COLUMN time_zone TEXT;
ALTER TABLE trip_plans ADD COLUMN place_provider TEXT
  CHECK (place_provider IS NULL OR place_provider = 'google');
ALTER TABLE trip_plans ADD COLUMN place_id TEXT;

CREATE INDEX trip_plans_by_place
  ON trip_plans(place_provider, place_id)
  WHERE place_id IS NOT NULL;

CREATE TABLE plan_price_quotes (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES trip_plans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  amount TEXT NOT NULL CHECK (
    amount NOT GLOB '*[^0-9.]*' AND
    amount NOT GLOB '*.*.*' AND
    amount GLOB '[0-9]*' AND
    (instr(amount, '.') = 0 OR length(amount) - instr(amount, '.') BETWEEN 1 AND 3)
  ),
  currency TEXT NOT NULL CHECK (length(currency) = 3 AND currency = upper(currency)),
  unit TEXT NOT NULL CHECK (
    unit IN ('total', 'person', 'adult', 'child', 'couple', 'night', 'bottle', 'other')
  ),
  display_text TEXT NOT NULL CHECK (length(display_text) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL,
  UNIQUE (plan_id, position)
);

CREATE TABLE promotion_links (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('candidate', 'research')),
  source_id TEXT NOT NULL,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('research', 'plan', 'stay', 'travel')),
  target_id TEXT NOT NULL,
  reviewed_payload_json TEXT NOT NULL CHECK (length(reviewed_payload_json) <= 65536),
  reviewed_payload_hash TEXT NOT NULL CHECK (
    length(reviewed_payload_hash) = 64 AND reviewed_payload_hash NOT GLOB '*[^a-f0-9]*'
  ),
  idempotency_key TEXT NOT NULL,
  promoted_by_user_id TEXT NOT NULL,
  promoted_at TEXT NOT NULL,
  UNIQUE (source_kind, source_id, target_kind),
  UNIQUE (trip_id, promoted_by_user_id, idempotency_key)
);

CREATE INDEX promotion_links_by_target
  ON promotion_links(trip_id, target_kind, target_id);

CREATE TABLE research_capture_idempotency (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  research_item_id TEXT NOT NULL,
  response_json TEXT,
  resource_deleted_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (user_id, idempotency_key),
  CHECK (
    (response_json IS NOT NULL AND resource_deleted_at IS NULL) OR
    (response_json IS NULL AND resource_deleted_at IS NOT NULL)
  )
);

CREATE INDEX research_capture_idempotency_by_expiry
  ON research_capture_idempotency(expires_at);

CREATE TRIGGER research_capture_idempotency_tombstone_deleted_item
AFTER DELETE ON research_items
BEGIN
  UPDATE research_capture_idempotency
  SET response_json = NULL, resource_deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE trip_id = OLD.trip_id AND research_item_id = OLD.id;
END;
