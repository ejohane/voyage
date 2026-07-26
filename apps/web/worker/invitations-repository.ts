import type {
  InvitationStatus,
  TripAccessLevel,
  TripInvitation,
  TripMember,
} from "@voyage/contracts";
import type { UserIdentity } from "./user-directory";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

type MembershipRow = {
  user_id: string;
  access_level: TripAccessLevel;
  joined_at: string;
  email: string | null;
  display_name: string | null;
  image_url: string | null;
};

export type InvitationRow = {
  id: string;
  trip_id: string;
  trip_name: string;
  email: string;
  access_level: "viewer";
  invited_by_user_id: string;
  expires_at: string;
  accepted_by_user_id: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  revoked_at: string | null;
  last_sent_at: string | null;
  send_count: number;
  created_at: string;
  updated_at: string;
  token_expires_at?: string;
  token_revoked_at?: string | null;
};

function roleForAccess(accessLevel: TripAccessLevel): TripMember["role"] {
  if (accessLevel === "owner") return "Organizer";
  if (accessLevel === "editor") return "Planner";
  return "Traveler";
}

export function invitationStatus(
  invitation: InvitationRow,
  now = new Date().toISOString(),
): InvitationStatus {
  if (invitation.accepted_at) return "accepted";
  if (invitation.declined_at) return "declined";
  if (invitation.revoked_at) return "revoked";
  if (invitation.token_revoked_at) return "revoked";
  if ((invitation.token_expires_at ?? invitation.expires_at) <= now) return "expired";
  return "pending";
}

export function mapTripInvitation(row: InvitationRow): TripInvitation {
  return {
    id: row.id,
    email: row.email,
    role: "Traveler",
    status: invitationStatus(row),
    expiresAt: row.expires_at,
    lastSentAt: row.last_sent_at,
    sendCount: row.send_count,
    createdAt: row.created_at,
  };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

export function newInvitationExpiry(now = new Date()) {
  return new Date(now.getTime() + INVITATION_LIFETIME_MS).toISOString();
}

export function generateInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashInvitationToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getTripAccess(
  database: D1Database,
  tripId: string,
  userId: string,
): Promise<TripAccessLevel | null> {
  const row = await database
    .prepare("SELECT access_level FROM trip_memberships WHERE trip_id = ? AND user_id = ?")
    .bind(tripId, userId)
    .first<{ access_level: TripAccessLevel }>();
  return row?.access_level ?? null;
}

export async function listMemberships(database: D1Database, tripId: string) {
  const result = await database
    .prepare(
      `SELECT user_id, access_level, joined_at, email, display_name, image_url
       FROM trip_memberships
       WHERE trip_id = ?
       ORDER BY CASE access_level WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, joined_at`,
    )
    .bind(tripId)
    .all<MembershipRow>();
  return result.results;
}

export function mapMembership(row: MembershipRow, identity?: UserIdentity): TripMember {
  return {
    userId: row.user_id,
    email: identity?.primaryEmail ?? row.email,
    displayName: identity?.displayName ?? row.display_name,
    imageUrl: identity?.imageUrl ?? row.image_url,
    role: roleForAccess(row.access_level),
    accessLevel: row.access_level,
    joinedAt: row.joined_at,
  };
}

const invitationSelect = `
  SELECT trip_invitations.*, trips.name AS trip_name
  FROM trip_invitations
  INNER JOIN trips ON trips.id = trip_invitations.trip_id
`;

export async function listTripInvitations(database: D1Database, tripId: string) {
  const result = await database
    .prepare(`${invitationSelect} WHERE trip_invitations.trip_id = ? ORDER BY created_at DESC`)
    .bind(tripId)
    .all<InvitationRow>();
  return result.results;
}

export async function getInvitationById(
  database: D1Database,
  tripId: string,
  invitationId: string,
) {
  return database
    .prepare(`${invitationSelect} WHERE trip_invitations.trip_id = ? AND trip_invitations.id = ?`)
    .bind(tripId, invitationId)
    .first<InvitationRow>();
}

export async function getInvitationByToken(database: D1Database, tokenHash: string) {
  return database
    .prepare(
      `SELECT trip_invitations.*, trips.name AS trip_name,
              trip_invitation_tokens.expires_at AS token_expires_at,
              trip_invitation_tokens.revoked_at AS token_revoked_at
       FROM trip_invitations
       INNER JOIN trips ON trips.id = trip_invitations.trip_id
       INNER JOIN trip_invitation_tokens
         ON trip_invitation_tokens.invitation_id = trip_invitations.id
       WHERE trip_invitation_tokens.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<InvitationRow & { token_expires_at: string; token_revoked_at: string | null }>();
}

export async function invitationRateLimitExceeded(
  database: D1Database,
  tripId: string,
  invitedByUserId: string,
  email: string,
  now = new Date(),
) {
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1_000).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();
  const row = await database
    .prepare(
      `SELECT
         SUM(CASE WHEN invited_by_user_id = ? AND created_at >= ? THEN 1 ELSE 0 END) AS creator_hour,
         SUM(CASE WHEN email = ? AND created_at >= ? THEN 1 ELSE 0 END) AS email_day
       FROM trip_invitations WHERE trip_id = ?`,
    )
    .bind(invitedByUserId, hourAgo, email, dayAgo, tripId)
    .first<{ creator_hour: number | null; email_day: number | null }>();
  return (row?.creator_hour ?? 0) >= 20 || (row?.email_day ?? 0) >= 5;
}

export async function createInvitation(
  database: D1Database,
  input: {
    tripId: string;
    email: string;
    invitedByUserId: string;
    tokenHash: string;
    now: string;
    expiresAt: string;
  },
) {
  const id = crypto.randomUUID();
  await database.batch([
    database
      .prepare(
        `UPDATE trip_invitations
         SET revoked_at = ?, updated_at = ?
         WHERE trip_id = ? AND email = ?
           AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
           AND expires_at <= ?`,
      )
      .bind(input.now, input.now, input.tripId, input.email, input.now),
    database
      .prepare(
        `INSERT INTO trip_invitations (
          id, trip_id, email, access_level, invited_by_user_id, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'viewer', ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.tripId,
        input.email,
        input.invitedByUserId,
        input.expiresAt,
        input.now,
        input.now,
      ),
    database
      .prepare(
        `INSERT INTO trip_invitation_tokens (
          invitation_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .bind(id, input.tokenHash, input.expiresAt, input.now),
  ]);
  return getInvitationById(database, input.tripId, id);
}

export async function addInvitationToken(
  database: D1Database,
  invitationId: string,
  tokenHash: string,
  expiresAt: string,
  now: string,
) {
  await database.batch([
    database
      .prepare("UPDATE trip_invitations SET expires_at = ?, updated_at = ? WHERE id = ?")
      .bind(expiresAt, now, invitationId),
    database
      .prepare(
        `INSERT INTO trip_invitation_tokens (
          invitation_id, token_hash, expires_at, created_at
        ) VALUES (?, ?, ?, ?)`,
      )
      .bind(invitationId, tokenHash, expiresAt, now),
  ]);
}

export async function markInvitationSent(
  database: D1Database,
  invitationId: string,
  currentTokenHash: string,
  now: string,
) {
  await database.batch([
    database
      .prepare(
        `UPDATE trip_invitations
         SET last_sent_at = ?, send_count = send_count + 1, updated_at = ?
         WHERE id = ?`,
      )
      .bind(now, now, invitationId),
    database
      .prepare(
        `UPDATE trip_invitation_tokens SET revoked_at = ?
         WHERE invitation_id = ? AND token_hash <> ? AND revoked_at IS NULL`,
      )
      .bind(now, invitationId, currentTokenHash),
  ]);
}

export async function revokeOtherInvitationTokens(
  database: D1Database,
  invitationId: string,
  currentTokenHash: string,
  now: string,
) {
  await database
    .prepare(
      `UPDATE trip_invitation_tokens SET revoked_at = ?
       WHERE invitation_id = ? AND token_hash <> ? AND revoked_at IS NULL`,
    )
    .bind(now, invitationId, currentTokenHash)
    .run();
}

export async function revokeInvitation(
  database: D1Database,
  tripId: string,
  invitationId: string,
  now: string,
) {
  const result = await database
    .prepare(
      `UPDATE trip_invitations SET revoked_at = ?, updated_at = ?
       WHERE id = ? AND trip_id = ?
         AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL`,
    )
    .bind(now, now, invitationId, tripId)
    .run();
  return result.meta.changes > 0;
}

export async function acceptInvitation(
  database: D1Database,
  invitation: InvitationRow,
  identity: UserIdentity,
  now: string,
) {
  const existing = await database
    .prepare("SELECT 1 AS found FROM trip_memberships WHERE trip_id = ? AND user_id = ?")
    .bind(invitation.trip_id, identity.userId)
    .first<{ found: number }>();
  const results = await database.batch([
    database
      .prepare(
        `UPDATE trip_invitations
         SET accepted_by_user_id = ?, accepted_at = ?, updated_at = ?
         WHERE id = ? AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
           AND expires_at > ?`,
      )
      .bind(identity.userId, now, now, invitation.id, now),
    database
      .prepare(
        `INSERT OR IGNORE INTO trip_memberships (
          trip_id, user_id, access_level, joined_at, email, display_name, image_url
        )
        SELECT trip_id, ?, 'viewer', ?, ?, ?, ?
        FROM trip_invitations
        WHERE id = ? AND accepted_by_user_id = ? AND accepted_at = ?`,
      )
      .bind(
        identity.userId,
        now,
        identity.primaryEmail,
        identity.displayName,
        identity.imageUrl,
        invitation.id,
        identity.userId,
        now,
      ),
    database
      .prepare(
        `UPDATE trip_invitation_tokens SET revoked_at = ?
         WHERE invitation_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, invitation.id),
  ]);
  return { accepted: results[0].meta.changes > 0, alreadyMember: Boolean(existing) };
}

export async function declineInvitation(database: D1Database, invitationId: string, now: string) {
  const results = await database.batch([
    database
      .prepare(
        `UPDATE trip_invitations SET declined_at = ?, updated_at = ?
         WHERE id = ? AND accepted_at IS NULL AND declined_at IS NULL AND revoked_at IS NULL
           AND expires_at > ?`,
      )
      .bind(now, now, invitationId, now),
    database
      .prepare(
        `UPDATE trip_invitation_tokens SET revoked_at = ?
         WHERE invitation_id = ? AND revoked_at IS NULL`,
      )
      .bind(now, invitationId),
  ]);
  return results[0].meta.changes > 0;
}

export async function removeTripMember(database: D1Database, tripId: string, userId: string) {
  const result = await database
    .prepare(
      `DELETE FROM trip_memberships
       WHERE trip_id = ? AND user_id = ? AND access_level <> 'owner'`,
    )
    .bind(tripId, userId)
    .run();
  return result.meta.changes > 0;
}
