ALTER TABLE trip_memberships ADD COLUMN email TEXT;
ALTER TABLE trip_memberships ADD COLUMN display_name TEXT;
ALTER TABLE trip_memberships ADD COLUMN image_url TEXT;

CREATE INDEX trip_memberships_by_email
  ON trip_memberships(trip_id, email)
  WHERE email IS NOT NULL;

CREATE TABLE trip_invitations (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  access_level TEXT NOT NULL DEFAULT 'viewer' CHECK (access_level = 'viewer'),
  invited_by_user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_by_user_id TEXT,
  accepted_at TEXT,
  declined_at TEXT,
  revoked_at TEXT,
  last_sent_at TEXT,
  send_count INTEGER NOT NULL DEFAULT 0 CHECK (send_count >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (accepted_at IS NOT NULL) +
    (declined_at IS NOT NULL) +
    (revoked_at IS NOT NULL) <= 1
  ),
  CHECK (accepted_at IS NULL OR accepted_by_user_id IS NOT NULL)
);

CREATE INDEX trip_invitations_by_trip
  ON trip_invitations(trip_id, created_at DESC);

CREATE UNIQUE INDEX trip_invitations_one_open_per_email
  ON trip_invitations(trip_id, email)
  WHERE accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL;

CREATE TABLE trip_invitation_tokens (
  invitation_id TEXT NOT NULL REFERENCES trip_invitations(id) ON DELETE CASCADE,
  token_hash TEXT PRIMARY KEY CHECK (length(token_hash) = 64),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX trip_invitation_tokens_by_invitation
  ON trip_invitation_tokens(invitation_id, created_at DESC);
