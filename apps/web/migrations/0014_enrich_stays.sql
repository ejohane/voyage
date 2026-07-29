ALTER TABLE stays ADD COLUMN property_place_provider TEXT
  CHECK (property_place_provider IS NULL OR property_place_provider = 'google');
ALTER TABLE stays ADD COLUMN property_place_id TEXT;
ALTER TABLE stays ADD COLUMN property_match_method TEXT
  CHECK (property_match_method IS NULL OR property_match_method IN ('user', 'gmail_auto', 'backfill'));
ALTER TABLE stays ADD COLUMN property_matched_at TEXT;

CREATE INDEX stays_by_property_place
  ON stays(property_place_provider, property_place_id)
  WHERE property_place_id IS NOT NULL;

CREATE TABLE stay_booking_details (
  stay_id TEXT PRIMARY KEY REFERENCES stays(id) ON DELETE CASCADE,
  check_in_window TEXT,
  check_out_window TEXT,
  room_type TEXT,
  guest_summary TEXT,
  meal_plan TEXT,
  cancellation_summary TEXT,
  cancellation_deadline TEXT,
  total_price_text TEXT,
  amenities_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
