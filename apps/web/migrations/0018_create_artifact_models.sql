CREATE TABLE source_artifacts (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('url', 'file', 'pasted_text', 'email', 'provider_document')),
  provider TEXT CHECK (provider IS NULL OR length(provider) BETWEEN 1 AND 100),
  external_id TEXT CHECK (external_id IS NULL OR length(external_id) BETWEEN 1 AND 500),
  original_url TEXT CHECK (original_url IS NULL OR length(original_url) <= 2048),
  canonical_url TEXT CHECK (canonical_url IS NULL OR length(canonical_url) <= 2048),
  captured_title TEXT CHECK (captured_title IS NULL OR length(captured_title) <= 500),
  site_name TEXT CHECK (site_name IS NULL OR length(site_name) <= 200),
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'planners', 'trip')),
  processing_state TEXT NOT NULL CHECK (
    processing_state IN ('captured', 'queued', 'processing', 'ready', 'partial', 'failed', 'unsupported')
  ),
  captured_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX source_artifacts_by_trip
  ON source_artifacts(trip_id, created_at DESC, id DESC);
CREATE INDEX source_artifacts_by_trip_url
  ON source_artifacts(trip_id, canonical_url)
  WHERE canonical_url IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX source_artifacts_by_provider_identity
  ON source_artifacts(trip_id, provider, external_id)
  WHERE provider IS NOT NULL AND external_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES source_artifacts(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  mime_type TEXT CHECK (mime_type IS NULL OR length(mime_type) <= 200),
  byte_length INTEGER CHECK (byte_length IS NULL OR byte_length >= 0),
  content_hash TEXT CHECK (content_hash IS NULL OR (length(content_hash) = 64 AND content_hash NOT GLOB '*[^a-f0-9]*')),
  original_storage_key TEXT,
  normalized_storage_key TEXT,
  normalized_content_hash TEXT CHECK (
    normalized_content_hash IS NULL OR
    (length(normalized_content_hash) = 64 AND normalized_content_hash NOT GLOB '*[^a-f0-9]*')
  ),
  captured_at TEXT NOT NULL,
  UNIQUE (artifact_id, sequence)
);

CREATE INDEX artifact_versions_by_artifact
  ON artifact_versions(artifact_id, sequence DESC);

CREATE TABLE research_item_sources (
  research_item_id TEXT NOT NULL REFERENCES research_items(id) ON DELETE CASCADE,
  artifact_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL CHECK (relationship IN ('primary', 'supporting')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (research_item_id, artifact_version_id)
);

CREATE INDEX research_item_sources_by_artifact
  ON research_item_sources(artifact_version_id, research_item_id);

CREATE TABLE extraction_runs (
  id TEXT PRIMARY KEY,
  artifact_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
  normalizer_version TEXT NOT NULL CHECK (length(normalizer_version) BETWEEN 1 AND 100),
  extractor_version TEXT NOT NULL CHECK (length(extractor_version) BETWEEN 1 AND 100),
  candidate_schema_version INTEGER NOT NULL CHECK (candidate_schema_version > 0),
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'partial', 'failed')),
  started_at TEXT,
  completed_at TEXT,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 100),
  created_at TEXT NOT NULL,
  UNIQUE (
    artifact_version_id,
    normalizer_version,
    extractor_version,
    candidate_schema_version
  )
);

CREATE INDEX extraction_runs_by_status ON extraction_runs(status, created_at);

CREATE TABLE artifact_candidates (
  id TEXT PRIMARY KEY,
  extraction_run_id TEXT NOT NULL REFERENCES extraction_runs(id) ON DELETE CASCADE,
  candidate_key TEXT NOT NULL CHECK (length(candidate_key) BETWEEN 1 AND 300),
  kind TEXT NOT NULL CHECK (kind IN ('research', 'travel', 'stay', 'plan')),
  payload_json TEXT NOT NULL CHECK (length(payload_json) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64 AND payload_hash NOT GLOB '*[^a-f0-9]*'),
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  dedupe_key TEXT CHECK (dedupe_key IS NULL OR length(dedupe_key) <= 500),
  suggested_trip_stop_id TEXT REFERENCES trip_stops(id) ON DELETE SET NULL,
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (length(missing_fields_json) <= 32768),
  attention_issues_json TEXT NOT NULL DEFAULT '[]' CHECK (length(attention_issues_json) <= 65536),
  review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'accepted', 'dismissed', 'superseded')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (extraction_run_id, candidate_key)
);

CREATE INDEX artifact_candidates_by_run_state
  ON artifact_candidates(extraction_run_id, review_state, created_at);
CREATE INDEX artifact_candidates_by_dedupe
  ON artifact_candidates(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE candidate_evidence (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES artifact_candidates(id) ON DELETE CASCADE,
  artifact_version_id TEXT NOT NULL REFERENCES artifact_versions(id) ON DELETE CASCADE,
  field_path TEXT CHECK (field_path IS NULL OR length(field_path) <= 300),
  excerpt TEXT NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 2000),
  locator_json TEXT NOT NULL CHECK (length(locator_json) <= 8192),
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL
);

CREATE INDEX candidate_evidence_by_candidate
  ON candidate_evidence(candidate_id, created_at, id);
