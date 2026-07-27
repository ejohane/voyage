CREATE TABLE airports (
  id INTEGER PRIMARY KEY,
  ident TEXT NOT NULL UNIQUE,
  iata_code TEXT NOT NULL,
  icao_code TEXT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  municipality TEXT,
  iso_country TEXT NOT NULL,
  iso_region TEXT,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  keywords TEXT,
  search_text TEXT NOT NULL
);

CREATE INDEX airports_by_iata_code ON airports(iata_code);
CREATE INDEX airports_by_icao_code ON airports(icao_code);
CREATE INDEX airports_by_municipality ON airports(municipality);

ALTER TABLE travel_segments
  ADD COLUMN departure_airport_id INTEGER REFERENCES airports(id) ON DELETE SET NULL;

ALTER TABLE travel_segments
  ADD COLUMN arrival_airport_id INTEGER REFERENCES airports(id) ON DELETE SET NULL;

CREATE INDEX travel_segments_by_departure_airport ON travel_segments(departure_airport_id);
CREATE INDEX travel_segments_by_arrival_airport ON travel_segments(arrival_airport_id);
