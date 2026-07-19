ALTER TABLE travel_segments
  ADD COLUMN departure_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL;

ALTER TABLE travel_segments
  ADD COLUMN arrival_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL;

ALTER TABLE stays
  ADD COLUMN trip_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL;

CREATE INDEX travel_segments_by_departure_stop ON travel_segments(departure_stop_id);
CREATE INDEX travel_segments_by_arrival_stop ON travel_segments(arrival_stop_id);
CREATE INDEX stays_by_trip_stop ON stays(trip_stop_id);
