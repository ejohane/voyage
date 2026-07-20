import { type GmailImportCandidate, gmailImportCandidateSchema } from "@voyage/contracts";

export const GMAIL_EXTRACTION_VERSION = 5;

type GmailProcessingRow = {
  gmail_message_id: string;
  gmail_thread_id: string;
  candidate_json: string | null;
  rejection_reason: string | null;
};

export type CachedGmailProcessing = {
  messageId: string;
  threadId: string;
  candidates: GmailImportCandidate[];
  rejectionReason: string | null;
};

export async function pruneStaleGmailProcessing(
  database: D1Database,
  userId: string,
  tripId: string,
) {
  await database
    .prepare(
      `DELETE FROM gmail_message_processing
       WHERE user_id = ? AND trip_id = ? AND extraction_version <> ?`,
    )
    .bind(userId, tripId, GMAIL_EXTRACTION_VERSION)
    .run();
}

function parseCandidates(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const candidates: GmailImportCandidate[] = [];
    for (const candidate of parsed) {
      const result = gmailImportCandidateSchema.safeParse(candidate);
      if (!result.success) return null;
      candidates.push(result.data);
    }
    return candidates;
  } catch {
    return null;
  }
}

export async function listCachedGmailProcessing(
  database: D1Database,
  userId: string,
  tripId: string,
  messageIds: string[],
) {
  const cached = new Map<string, CachedGmailProcessing>();
  for (let index = 0; index < messageIds.length; index += 50) {
    const ids = messageIds.slice(index, index + 50);
    if (!ids.length) continue;
    const result = await database
      .prepare(
        `SELECT gmail_message_id, gmail_thread_id, candidate_json, rejection_reason
         FROM gmail_message_processing
         WHERE user_id = ? AND trip_id = ? AND extraction_version = ?
           AND gmail_message_id IN (${ids.map(() => "?").join(", ")})`,
      )
      .bind(userId, tripId, GMAIL_EXTRACTION_VERSION, ...ids)
      .all<GmailProcessingRow>();

    for (const row of result.results) {
      const candidates = parseCandidates(row.candidate_json);
      if (!candidates) continue;
      cached.set(row.gmail_message_id, {
        messageId: row.gmail_message_id,
        threadId: row.gmail_thread_id,
        candidates,
        rejectionReason: row.rejection_reason,
      });
    }
  }
  return cached;
}

export async function saveGmailProcessing(
  database: D1Database,
  userId: string,
  tripId: string,
  messageId: string,
  threadId: string,
  candidates: GmailImportCandidate[],
  rejectionReason: string | null,
) {
  await database
    .prepare(
      `INSERT INTO gmail_message_processing (
         user_id, trip_id, gmail_message_id, gmail_thread_id, extraction_version,
         candidate_json, rejection_reason, processed_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, trip_id, gmail_message_id, extraction_version) DO UPDATE SET
         gmail_thread_id = excluded.gmail_thread_id,
         candidate_json = excluded.candidate_json,
         rejection_reason = excluded.rejection_reason,
         processed_at = excluded.processed_at`,
    )
    .bind(
      userId,
      tripId,
      messageId,
      threadId,
      GMAIL_EXTRACTION_VERSION,
      candidates.length ? JSON.stringify(candidates) : null,
      rejectionReason,
      new Date().toISOString(),
    )
    .run();
}
