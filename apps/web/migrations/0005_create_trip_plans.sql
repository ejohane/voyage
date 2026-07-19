CREATE TABLE trip_plans (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  trip_stop_id TEXT NOT NULL REFERENCES trip_stops(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 160),
  category TEXT NOT NULL CHECK (category IN ('activity', 'food', 'event', 'sightseeing', 'other')),
  status TEXT NOT NULL CHECK (status IN ('idea', 'planned', 'booked')),
  scheduled_date TEXT CHECK (scheduled_date IS NULL OR scheduled_date GLOB '????-??-??'),
  start_time TEXT CHECK (start_time IS NULL OR start_time GLOB '??:??'),
  end_time TEXT CHECK (end_time IS NULL OR end_time GLOB '??:??'),
  location TEXT,
  confirmation_number TEXT,
  booking_url TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (scheduled_date IS NOT NULL OR (start_time IS NULL AND end_time IS NULL)),
  CHECK (end_time IS NULL OR start_time IS NOT NULL),
  CHECK (end_time IS NULL OR end_time >= start_time),
  CHECK (
    (scheduled_date IS NULL AND status = 'idea') OR
    (scheduled_date IS NOT NULL AND status IN ('planned', 'booked'))
  )
);

CREATE INDEX trip_plans_by_trip_and_schedule
  ON trip_plans(trip_id, scheduled_date, start_time, created_at);

CREATE INDEX trip_plans_by_stop ON trip_plans(trip_stop_id, scheduled_date, created_at);
