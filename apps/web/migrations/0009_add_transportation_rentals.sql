CREATE TABLE travel_segments_next (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('journey', 'rental')),
  type TEXT NOT NULL CHECK (type IN ('flight', 'train', 'bus', 'drive', 'ferry', 'car', 'other')),
  status TEXT NOT NULL CHECK (status IN ('planning', 'booked')),
  departure_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL,
  arrival_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL,
  departure_location TEXT NOT NULL CHECK (length(departure_location) BETWEEN 1 AND 160),
  arrival_location TEXT NOT NULL CHECK (length(arrival_location) BETWEEN 1 AND 160),
  departure_at TEXT NOT NULL,
  arrival_at TEXT,
  carrier TEXT,
  reference_number TEXT,
  vehicle_description TEXT,
  confirmation_number TEXT,
  booking_url TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((kind = 'rental' AND type = 'car' AND arrival_at IS NOT NULL) OR (kind = 'journey' AND type <> 'car'))
);

INSERT INTO travel_segments_next (
  id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
  departure_location, arrival_location, departure_at, arrival_at,
  carrier, reference_number, vehicle_description, confirmation_number,
  booking_url, notes, created_by_user_id, created_at, updated_at
)
SELECT
  id, trip_id, 'journey', type, status, departure_stop_id, arrival_stop_id,
  departure_location, arrival_location, departure_at, arrival_at,
  carrier, reference_number, NULL, confirmation_number,
  booking_url, notes, created_by_user_id, created_at, updated_at
FROM travel_segments;

DROP TABLE travel_segments;
ALTER TABLE travel_segments_next RENAME TO travel_segments;

CREATE INDEX travel_segments_by_trip_and_departure
  ON travel_segments(trip_id, departure_at, created_at);
CREATE INDEX travel_segments_by_departure_stop ON travel_segments(departure_stop_id);
CREATE INDEX travel_segments_by_arrival_stop ON travel_segments(arrival_stop_id);
