CREATE TABLE research_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  body TEXT CHECK (body IS NULL OR length(body) <= 10000),
  state TEXT NOT NULL CHECK (state IN ('inbox', 'considering', 'shortlisted', 'dismissed')),
  category TEXT CHECK (
    category IS NULL OR
    category IN ('place', 'activity', 'food', 'stay', 'transportation', 'logistics', 'other')
  ),
  trip_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL,
  place_provider TEXT CHECK (place_provider IS NULL OR place_provider = 'google'),
  place_id TEXT,
  attribution TEXT CHECK (attribution IS NULL OR length(attribution) <= 500),
  legacy_plan_id TEXT UNIQUE,
  created_by_user_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  mutation_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (place_provider IS NULL AND place_id IS NULL) OR
    (place_provider IS NOT NULL AND place_id IS NOT NULL)
  )
);

CREATE INDEX research_items_by_trip_state
  ON research_items(trip_id, state, updated_at DESC, id DESC);
CREATE INDEX research_items_by_trip_stop
  ON research_items(trip_id, trip_stop_id, updated_at DESC);
CREATE INDEX research_items_by_legacy_plan
  ON research_items(legacy_plan_id)
  WHERE legacy_plan_id IS NOT NULL;

CREATE TABLE research_item_price_quotes (
  id TEXT PRIMARY KEY,
  research_item_id TEXT NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,
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
  UNIQUE (research_item_id, position)
);
