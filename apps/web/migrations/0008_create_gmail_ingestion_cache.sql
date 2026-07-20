CREATE TABLE gmail_message_processing (
  user_id TEXT NOT NULL,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT NOT NULL,
  extraction_version INTEGER NOT NULL,
  candidate_json TEXT,
  rejection_reason TEXT,
  processed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, trip_id, gmail_message_id, extraction_version)
);

CREATE INDEX gmail_message_processing_by_trip
  ON gmail_message_processing(user_id, trip_id, extraction_version);
