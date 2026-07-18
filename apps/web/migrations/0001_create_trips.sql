CREATE TABLE trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  destination TEXT NOT NULL CHECK (length(destination) BETWEEN 1 AND 160),
  start_date TEXT CHECK (start_date IS NULL OR start_date GLOB '????-??-??'),
  end_date TEXT CHECK (end_date IS NULL OR end_date GLOB '????-??-??'),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date IS NULL OR start_date IS NOT NULL),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE trip_memberships (
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('owner', 'editor', 'viewer')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (trip_id, user_id)
);

CREATE INDEX trip_memberships_by_user ON trip_memberships(user_id, trip_id);
