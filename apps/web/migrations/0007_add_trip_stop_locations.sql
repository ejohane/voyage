ALTER TABLE trip_stops ADD COLUMN place_provider TEXT
  CHECK (place_provider IS NULL OR place_provider = 'google');
ALTER TABLE trip_stops ADD COLUMN place_id TEXT
  CHECK (place_id IS NULL OR length(place_id) BETWEEN 1 AND 300);

CREATE INDEX trip_stops_by_place_id ON trip_stops(place_provider, place_id)
WHERE place_id IS NOT NULL;
