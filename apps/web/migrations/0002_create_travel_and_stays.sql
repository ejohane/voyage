CREATE TABLE travel_segments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight', 'train', 'bus', 'drive', 'ferry', 'other')),
  status TEXT NOT NULL CHECK (status IN ('planning', 'booked')),
  departure_location TEXT NOT NULL CHECK (length(departure_location) BETWEEN 1 AND 160),
  arrival_location TEXT NOT NULL CHECK (length(arrival_location) BETWEEN 1 AND 160),
  departure_at TEXT NOT NULL,
  arrival_at TEXT,
  carrier TEXT,
  reference_number TEXT,
  confirmation_number TEXT,
  booking_url TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX travel_segments_by_trip_and_departure
  ON travel_segments(trip_id, departure_at, created_at);

CREATE TABLE stays (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('planning', 'booked')),
  property_name TEXT NOT NULL CHECK (length(property_name) BETWEEN 1 AND 160),
  address TEXT NOT NULL CHECK (length(address) BETWEEN 1 AND 300),
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  confirmation_number TEXT,
  booking_url TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (check_out_date >= check_in_date)
);

CREATE INDEX stays_by_trip_and_check_in ON stays(trip_id, check_in_date, created_at);
