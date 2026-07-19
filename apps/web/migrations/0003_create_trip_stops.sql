CREATE TABLE trip_stops (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  position INTEGER NOT NULL CHECK (position >= 0),
  arrival_date TEXT CHECK (arrival_date IS NULL OR arrival_date GLOB '????-??-??'),
  departure_date TEXT CHECK (departure_date IS NULL OR departure_date GLOB '????-??-??'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_id, position),
  CHECK (departure_date IS NULL OR arrival_date IS NOT NULL),
  CHECK (departure_date IS NULL OR departure_date >= arrival_date)
);

CREATE INDEX trip_stops_by_trip_and_position ON trip_stops(trip_id, position);

INSERT INTO trip_stops (
  id,
  trip_id,
  name,
  position,
  arrival_date,
  departure_date,
  created_at,
  updated_at
)
SELECT
  lower(hex(randomblob(4))) || '-' ||
    lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    substr('89ab', abs(random()) % 4 + 1, 1) ||
    substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
  id,
  destination,
  0,
  start_date,
  end_date,
  created_at,
  updated_at
FROM trips;
