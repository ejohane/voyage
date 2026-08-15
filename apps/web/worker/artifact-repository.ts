import {
  type ArtifactCandidate,
  type ArtifactCandidatePayload,
  artifactCandidatePayloadSchema,
  artifactCandidateSchema,
  type CandidateAttentionIssue,
  type CandidateEvidence,
  type CandidatePromotionReview,
  candidateAttentionIssueSchema,
  candidateEvidenceSchema,
  candidatePromotionReviewSchema,
  type ExtractionRunStatus,
  type ResearchItem,
  type SourceArtifactKind,
  type SourceArtifactVisibility,
  type Stay,
  type Travel,
  type TripAccessLevel,
  type TripPlan,
} from "@voyage/contracts";
import { getPlan, getStay, getTravel } from "./planning-repository";
import { getResearchItem } from "./research-repository";

type ArtifactIdentityRow = {
  id: string;
  trip_id: string;
  captured_by_user_id: string;
};

type VersionRow = {
  id: string;
  artifact_id: string;
  sequence: number;
};

type ExtractionRunRow = {
  id: string;
  artifact_version_id: string;
  normalizer_version: string;
  extractor_version: string;
  candidate_schema_version: number;
  status: ExtractionRunStatus;
  started_at: string | null;
  completed_at: string | null;
  error_code: string | null;
  created_at: string;
};

type CandidateRow = {
  id: string;
  extraction_run_id: string;
  candidate_key: string;
  kind: ArtifactCandidatePayload["kind"];
  payload_json: string;
  payload_hash: string;
  confidence: number;
  dedupe_key: string | null;
  suggested_trip_stop_id: string | null;
  missing_fields_json: string;
  attention_issues_json: string;
  review_state: ArtifactCandidate["reviewState"];
  revision: number;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type EvidenceRow = {
  id: string;
  artifact_version_id: string;
  field_path: string | null;
  excerpt: string;
  locator_json: string;
  confidence: number | null;
  created_at: string;
};

export type CaptureArtifactInput = {
  kind: SourceArtifactKind;
  provider?: string | null;
  externalId?: string | null;
  originalUrl?: string | null;
  capturedTitle?: string | null;
  siteName?: string | null;
  visibility?: SourceArtifactVisibility;
};

export type RecordArtifactVersionInput = {
  mimeType?: string | null;
  byteLength?: number | null;
  contentHash?: string | null;
  originalStorageKey?: string | null;
  normalizedStorageKey?: string | null;
  normalizedContentHash?: string | null;
};

export type SaveCandidateEvidenceInput = {
  id?: string;
  artifactVersionId: string;
  fieldPath?: string | null;
  excerpt: string;
  locator?: Record<string, unknown>;
  confidence?: number | null;
};

export type SaveArtifactCandidateInput = {
  id?: string;
  candidateKey: string;
  payload: ArtifactCandidatePayload;
  confidence: number;
  dedupeKey?: string | null;
  suggestedTripStopId?: string | null;
  missingFields?: string[];
  attentionIssues?: CandidateAttentionIssue[];
  evidence?: SaveCandidateEvidenceInput[];
};

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function captureArtifact(
  database: D1Database,
  tripId: string,
  userId: string,
  input: CaptureArtifactInput,
) {
  const artifactId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO source_artifacts (
           id, trip_id, kind, provider, external_id, original_url, canonical_url, captured_title,
           site_name, visibility, processing_state, captured_by_user_id, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'captured', ?, ?, ?)`,
      )
      .bind(
        artifactId,
        tripId,
        input.kind,
        input.provider ?? null,
        input.externalId ?? null,
        input.originalUrl ?? null,
        input.capturedTitle ?? null,
        input.siteName ?? null,
        input.visibility ?? "planners",
        userId,
        now,
        now,
      ),
    database
      .prepare(
        "INSERT INTO artifact_versions (id, artifact_id, sequence, captured_at) VALUES (?, ?, 1, ?)",
      )
      .bind(versionId, artifactId, now),
  ]);
  return { artifactId, versionId };
}

export async function recordArtifactVersion(
  database: D1Database,
  tripId: string,
  artifactId: string,
  input: RecordArtifactVersionInput,
) {
  const artifact = await database
    .prepare("SELECT id FROM source_artifacts WHERE id = ? AND trip_id = ? AND deleted_at IS NULL")
    .bind(artifactId, tripId)
    .first<{ id: string }>();
  if (!artifact) return null;
  const latest = await database
    .prepare("SELECT max(sequence) AS sequence FROM artifact_versions WHERE artifact_id = ?")
    .bind(artifactId)
    .first<{ sequence: number | null }>();
  const version = {
    id: crypto.randomUUID(),
    sequence: (latest?.sequence ?? 0) + 1,
    capturedAt: new Date().toISOString(),
  };
  await database
    .prepare(
      `INSERT INTO artifact_versions (
         id, artifact_id, sequence, mime_type, byte_length, content_hash, original_storage_key,
         normalized_storage_key, normalized_content_hash, captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      version.id,
      artifactId,
      version.sequence,
      input.mimeType ?? null,
      input.byteLength ?? null,
      input.contentHash ?? null,
      input.originalStorageKey ?? null,
      input.normalizedStorageKey ?? null,
      input.normalizedContentHash ?? null,
      version.capturedAt,
    )
    .run();
  return version;
}

export async function beginExtractionRun(
  database: D1Database,
  tripId: string,
  artifactVersionId: string,
  versions: {
    normalizerVersion: string;
    extractorVersion: string;
    candidateSchemaVersion: number;
  },
) {
  const version = await database
    .prepare(
      `SELECT artifact_versions.id, artifact_versions.artifact_id, artifact_versions.sequence
       FROM artifact_versions
       JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
       WHERE artifact_versions.id = ? AND source_artifacts.trip_id = ?
         AND source_artifacts.deleted_at IS NULL`,
    )
    .bind(artifactVersionId, tripId)
    .first<VersionRow>();
  if (!version) return null;
  const existing = await database
    .prepare(
      `SELECT * FROM extraction_runs
       WHERE artifact_version_id = ? AND normalizer_version = ? AND extractor_version = ?
         AND candidate_schema_version = ?`,
    )
    .bind(
      artifactVersionId,
      versions.normalizerVersion,
      versions.extractorVersion,
      versions.candidateSchemaVersion,
    )
    .first<ExtractionRunRow>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        `INSERT INTO extraction_runs (
           id, artifact_version_id, normalizer_version, extractor_version,
           candidate_schema_version, status, started_at, created_at
         ) VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
      )
      .bind(
        id,
        artifactVersionId,
        versions.normalizerVersion,
        versions.extractorVersion,
        versions.candidateSchemaVersion,
        now,
        now,
      ),
    database
      .prepare(
        "UPDATE source_artifacts SET processing_state = 'processing', updated_at = ? WHERE id = ?",
      )
      .bind(now, version.artifact_id),
  ]);
  return database
    .prepare("SELECT * FROM extraction_runs WHERE id = ?")
    .bind(id)
    .first<ExtractionRunRow>();
}

function validateCandidate(input: SaveArtifactCandidateInput) {
  const payload = artifactCandidatePayloadSchema.parse(input.payload);
  const evidence = (input.evidence ?? []).map((item) => ({
    ...item,
    id: item.id ?? crypto.randomUUID(),
    fieldPath: item.fieldPath ?? null,
    locator: item.locator ?? {},
    confidence: item.confidence ?? null,
  }));
  const evidenceIds = new Set(evidence.map((item) => item.id));
  const attentionIssues = (input.attentionIssues ?? []).map((issue) =>
    candidateAttentionIssueSchema.parse(issue),
  );
  for (const issue of attentionIssues) {
    if (issue.evidenceIds.some((id) => !evidenceIds.has(id))) {
      throw new Error("Candidate attention issue references evidence outside the candidate.");
    }
  }
  return { payload, evidence, attentionIssues };
}

function candidateStopIds(
  payload: ArtifactCandidatePayload,
  suggestedTripStopId: string | null | undefined,
) {
  const values: (string | null | undefined)[] = [suggestedTripStopId];
  if (payload.kind === "travel") {
    values.push(payload.fields.departureStopId, payload.fields.arrivalStopId);
  } else {
    values.push(payload.fields.tripStopId);
  }
  return [...new Set(values.filter((value): value is string => typeof value === "string"))];
}

async function candidateReferencesBelongToRun(
  database: D1Database,
  tripId: string,
  run: ExtractionRunRow,
  candidate: ReturnType<typeof validateCandidate> & { input: SaveArtifactCandidateInput },
) {
  if (
    candidate.evidence.some((evidence) => evidence.artifactVersionId !== run.artifact_version_id)
  ) {
    throw new Error("Candidate evidence must reference the extraction run's artifact version.");
  }
  for (const stopId of candidateStopIds(candidate.payload, candidate.input.suggestedTripStopId)) {
    const stop = await database
      .prepare("SELECT id FROM trip_stops WHERE id = ? AND trip_id = ?")
      .bind(stopId, tripId)
      .first<{ id: string }>();
    if (!stop) throw new Error("Candidate references a destination outside the artifact's trip.");
  }
  if (candidate.payload.kind === "travel") {
    for (const airportId of new Set(
      [
        candidate.payload.fields.departureAirportId,
        candidate.payload.fields.arrivalAirportId,
      ].filter((value): value is number => typeof value === "number"),
    )) {
      const airport = await database
        .prepare("SELECT id FROM airports WHERE id = ?")
        .bind(airportId)
        .first<{ id: number }>();
      if (!airport) throw new Error("Candidate references an airport outside the catalog.");
    }
  }
}

export async function completeExtractionRun(
  database: D1Database,
  tripId: string,
  extractionRunId: string,
  inputs: SaveArtifactCandidateInput[],
  status: "completed" | "partial" = "completed",
) {
  const run = await database
    .prepare(
      `SELECT extraction_runs.*
       FROM extraction_runs
       JOIN artifact_versions ON artifact_versions.id = extraction_runs.artifact_version_id
       JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
       WHERE extraction_runs.id = ? AND source_artifacts.trip_id = ?
         AND source_artifacts.deleted_at IS NULL`,
    )
    .bind(extractionRunId, tripId)
    .first<ExtractionRunRow>();
  if (!run) return null;
  if (run.status === "completed" || run.status === "partial") {
    return listRunCandidates(database, extractionRunId);
  }
  const validated = inputs.map((input) => ({ input, ...validateCandidate(input) }));
  for (const candidate of validated) {
    await candidateReferencesBelongToRun(database, tripId, run, candidate);
  }
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const candidate of validated) {
    const id = candidate.input.id ?? crypto.randomUUID();
    const payloadHash = await sha256(candidate.payload);
    statements.push(
      database
        .prepare(
          `INSERT INTO artifact_candidates (
             id, extraction_run_id, candidate_key, kind, payload_json, payload_hash, confidence,
             dedupe_key, suggested_trip_stop_id, missing_fields_json, attention_issues_json,
             review_state, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 1, ?, ?)`,
        )
        .bind(
          id,
          extractionRunId,
          candidate.input.candidateKey,
          candidate.payload.kind,
          JSON.stringify(candidate.payload),
          payloadHash,
          candidate.input.confidence,
          candidate.input.dedupeKey ?? null,
          candidate.input.suggestedTripStopId ?? null,
          JSON.stringify(candidate.input.missingFields ?? []),
          JSON.stringify(candidate.attentionIssues),
          now,
          now,
        ),
    );
    for (const evidence of candidate.evidence) {
      statements.push(
        database
          .prepare(
            `INSERT INTO candidate_evidence (
               id, candidate_id, artifact_version_id, field_path, excerpt, locator_json,
               confidence, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            evidence.id,
            id,
            evidence.artifactVersionId,
            evidence.fieldPath,
            evidence.excerpt,
            JSON.stringify(evidence.locator),
            evidence.confidence,
            now,
          ),
      );
    }
  }
  statements.push(
    database
      .prepare("UPDATE extraction_runs SET status = ?, completed_at = ? WHERE id = ?")
      .bind(status, now, extractionRunId),
    database
      .prepare(
        `UPDATE artifact_candidates
         SET review_state = 'superseded', revision = revision + 1, updated_at = ?
         WHERE review_state = 'pending' AND extraction_run_id IN (
           SELECT older.id
           FROM extraction_runs AS older
           JOIN extraction_runs AS current
             ON current.artifact_version_id = older.artifact_version_id
           WHERE current.id = ? AND older.id <> current.id
             AND older.created_at < current.created_at
         )`,
      )
      .bind(now, extractionRunId),
    database
      .prepare(
        `UPDATE source_artifacts
         SET processing_state = ?, updated_at = ?
         WHERE id = (
           SELECT artifact_versions.artifact_id
           FROM extraction_runs
           JOIN artifact_versions ON artifact_versions.id = extraction_runs.artifact_version_id
           WHERE extraction_runs.id = ?
         )`,
      )
      .bind(status === "completed" ? "ready" : "partial", now, extractionRunId),
  );
  await database.batch(statements);
  return listRunCandidates(database, extractionRunId);
}

async function listEvidence(database: D1Database, candidateId: string) {
  const result = await database
    .prepare(
      `SELECT id, artifact_version_id, field_path, excerpt, locator_json, confidence, created_at
       FROM candidate_evidence WHERE candidate_id = ? ORDER BY created_at, id`,
    )
    .bind(candidateId)
    .all<EvidenceRow>();
  return result.results.map(
    (row): CandidateEvidence =>
      candidateEvidenceSchema.parse({
        id: row.id,
        artifactVersionId: row.artifact_version_id,
        fieldPath: row.field_path,
        excerpt: row.excerpt,
        locator: JSON.parse(row.locator_json),
        confidence: row.confidence,
        createdAt: row.created_at,
      }),
  );
}

async function mapCandidate(database: D1Database, row: CandidateRow) {
  return artifactCandidateSchema.parse({
    id: row.id,
    extractionRunId: row.extraction_run_id,
    candidateKey: row.candidate_key,
    payload: JSON.parse(row.payload_json),
    payloadHash: row.payload_hash,
    confidence: row.confidence,
    dedupeKey: row.dedupe_key,
    suggestedTripStopId: row.suggested_trip_stop_id,
    missingFields: JSON.parse(row.missing_fields_json),
    attentionIssues: JSON.parse(row.attention_issues_json),
    reviewState: row.review_state,
    evidence: await listEvidence(database, row.id),
    revision: row.revision,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export async function listRunCandidates(database: D1Database, extractionRunId: string) {
  const result = await database
    .prepare(
      "SELECT * FROM artifact_candidates WHERE extraction_run_id = ? ORDER BY created_at, id",
    )
    .bind(extractionRunId)
    .all<CandidateRow>();
  return Promise.all(result.results.map((row) => mapCandidate(database, row)));
}

export async function getArtifactCandidate(
  database: D1Database,
  tripId: string,
  candidateId: string,
) {
  const row = await database
    .prepare(
      `SELECT artifact_candidates.*
       FROM artifact_candidates
       JOIN extraction_runs ON extraction_runs.id = artifact_candidates.extraction_run_id
       JOIN artifact_versions ON artifact_versions.id = extraction_runs.artifact_version_id
       JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
       WHERE artifact_candidates.id = ? AND source_artifacts.trip_id = ?
         AND source_artifacts.deleted_at IS NULL`,
    )
    .bind(candidateId, tripId)
    .first<CandidateRow>();
  return row ? mapCandidate(database, row) : null;
}

export async function dismissCandidateIfRevision(
  database: D1Database,
  tripId: string,
  candidateId: string,
  expectedRevision: number,
  userId: string,
) {
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE artifact_candidates
       SET review_state = 'dismissed', revision = revision + 1,
         reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
       WHERE id = ? AND revision = ? AND review_state = 'pending'
         AND extraction_run_id IN (
           SELECT extraction_runs.id
           FROM extraction_runs
           JOIN artifact_versions ON artifact_versions.id = extraction_runs.artifact_version_id
           JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
           WHERE source_artifacts.trip_id = ? AND source_artifacts.deleted_at IS NULL
         )`,
    )
    .bind(userId, now, now, candidateId, expectedRevision, tripId)
    .run();
  if (result.meta.changes > 0) return getArtifactCandidate(database, tripId, candidateId);
  return null;
}

export async function deleteSourceArtifact(
  database: D1Database,
  tripId: string,
  artifactId: string,
  userId: string,
  accessLevel: TripAccessLevel,
) {
  const artifact = await database
    .prepare(
      "SELECT id, trip_id, captured_by_user_id FROM source_artifacts WHERE id = ? AND trip_id = ?",
    )
    .bind(artifactId, tripId)
    .first<ArtifactIdentityRow>();
  if (!artifact) return "not_found" as const;
  if (artifact.captured_by_user_id !== userId && accessLevel !== "owner")
    return "forbidden" as const;
  const now = new Date().toISOString();
  await database.batch([
    database.prepare("DELETE FROM artifact_versions WHERE artifact_id = ?").bind(artifactId),
    database
      .prepare(
        `UPDATE source_artifacts
         SET original_url = NULL, canonical_url = NULL, captured_title = NULL, site_name = NULL,
           external_id = NULL, processing_state = 'unsupported', deleted_at = ?, updated_at = ?
         WHERE id = ? AND trip_id = ?`,
      )
      .bind(now, now, artifactId, tripId),
  ]);
  return "deleted" as const;
}

export type PromoteCandidateResult =
  | {
      kind: "created" | "replayed";
      candidate: ArtifactCandidate;
      target: ResearchItem | TripPlan | Stay | Travel;
    }
  | { kind: "blocked"; unresolvedIssueIndexes: number[] }
  | { kind: "conflict"; currentRevision?: number }
  | { kind: "not_found" };

type CandidatePromotionReplayRow = {
  source_id: string;
  target_kind: CandidatePromotionReview["target"]["kind"];
  target_id: string;
  reviewed_payload_hash: string;
};

async function loadCandidateTarget(
  database: D1Database,
  tripId: string,
  targetKind: CandidatePromotionReview["target"]["kind"],
  targetId: string,
  userId: string,
  accessLevel: TripAccessLevel,
) {
  if (targetKind === "research") {
    return getResearchItem(database, tripId, targetId, userId, accessLevel);
  }
  if (targetKind === "plan") return getPlan(database, tripId, targetId);
  if (targetKind === "stay") return getStay(database, tripId, targetId);
  return getTravel(database, tripId, targetId);
}

function candidateCondition() {
  return `EXISTS (
    SELECT 1 FROM artifact_candidates
    WHERE id = ? AND revision = ? AND review_state = 'pending'
  )`;
}

async function candidatePromotionReferencesBelongToTrip(
  database: D1Database,
  tripId: string,
  target: CandidatePromotionReview["target"],
) {
  const stopIds =
    target.kind === "travel"
      ? [target.input.departureStopId, target.input.arrivalStopId]
      : [target.input.tripStopId];
  for (const stopId of new Set(stopIds.filter((value): value is string => value !== null))) {
    const stop = await database
      .prepare("SELECT id FROM trip_stops WHERE id = ? AND trip_id = ?")
      .bind(stopId, tripId)
      .first<{ id: string }>();
    if (!stop) return false;
  }

  if (target.kind === "travel") {
    for (const airportId of new Set(
      [target.input.departureAirportId, target.input.arrivalAirportId].filter(
        (value): value is number => value !== null && value !== undefined,
      ),
    )) {
      const airport = await database
        .prepare("SELECT id FROM airports WHERE id = ?")
        .bind(airportId)
        .first<{ id: number }>();
      if (!airport) return false;
    }
  }
  return true;
}

export async function promoteArtifactCandidate(
  database: D1Database,
  tripId: string,
  candidateId: string,
  expectedRevision: number,
  userId: string,
  accessLevel: TripAccessLevel,
  idempotencyKey: string,
  reviewInput: CandidatePromotionReview,
): Promise<PromoteCandidateResult> {
  const review = candidatePromotionReviewSchema.parse(reviewInput);
  const reviewedPayloadHash = await sha256(review);
  const replay = await database
    .prepare(
      `SELECT source_id, target_kind, target_id, reviewed_payload_hash
       FROM promotion_links
       WHERE trip_id = ? AND promoted_by_user_id = ? AND idempotency_key = ?`,
    )
    .bind(tripId, userId, idempotencyKey)
    .first<CandidatePromotionReplayRow>();
  if (replay) {
    if (
      replay.source_id !== candidateId ||
      replay.target_kind !== review.target.kind ||
      replay.reviewed_payload_hash !== reviewedPayloadHash
    ) {
      return { kind: "conflict" };
    }
    const [candidate, target] = await Promise.all([
      getArtifactCandidate(database, tripId, candidateId),
      loadCandidateTarget(
        database,
        tripId,
        replay.target_kind,
        replay.target_id,
        userId,
        accessLevel,
      ),
    ]);
    return candidate && target ? { kind: "replayed", candidate, target } : { kind: "conflict" };
  }

  const candidate = await getArtifactCandidate(database, tripId, candidateId);
  if (!candidate) return { kind: "not_found" };
  if (candidate.revision !== expectedRevision || candidate.reviewState !== "pending") {
    return { kind: "conflict", currentRevision: candidate.revision };
  }
  if (candidate.payload.kind !== review.target.kind) return { kind: "conflict" };
  if (!(await candidatePromotionReferencesBelongToTrip(database, tripId, review.target))) {
    return { kind: "conflict" };
  }
  const resolved = new Set(review.resolvedBlockingIssues);
  const unresolvedIssueIndexes = candidate.attentionIssues.flatMap((issue, index) =>
    issue.severity === "blocking" && !resolved.has(index) ? [index] : [],
  );
  if (unresolvedIssueIndexes.length) return { kind: "blocked", unresolvedIssueIndexes };

  const targetId = crypto.randomUUID();
  const promotionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  const condition = candidateCondition();

  if (review.target.kind === "research") {
    const input = review.target.input;
    const mutationToken = crypto.randomUUID();
    statements.push(
      database
        .prepare(
          `INSERT INTO research_items (
             id, trip_id, title, body, state, category, trip_stop_id, place_provider, place_id,
             attribution, created_by_user_id, revision, mutation_token, created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?
           WHERE ${condition}`,
        )
        .bind(
          targetId,
          tripId,
          input.title,
          input.body,
          input.state,
          input.category,
          input.tripStopId,
          input.placeRef?.provider ?? null,
          input.placeRef?.placeId ?? null,
          input.attribution,
          userId,
          mutationToken,
          now,
          now,
          candidateId,
          expectedRevision,
        ),
      database
        .prepare(
          `INSERT INTO research_item_sources (
             research_item_id, artifact_version_id, relationship, created_at
           )
           SELECT ?, extraction_runs.artifact_version_id, 'primary', ?
           FROM artifact_candidates
           JOIN extraction_runs ON extraction_runs.id = artifact_candidates.extraction_run_id
           WHERE artifact_candidates.id = ? AND EXISTS (
             SELECT 1 FROM research_items WHERE id = ? AND trip_id = ?
           )`,
        )
        .bind(targetId, now, candidateId, targetId, tripId),
    );
    for (const [position, quote] of input.priceQuotes.entries()) {
      statements.push(
        database
          .prepare(
            `INSERT INTO research_item_price_quotes (
               id, research_item_id, position, amount, currency, unit, display_text, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            targetId,
            position,
            quote.amount,
            quote.currency,
            quote.unit,
            quote.displayText,
            now,
          ),
      );
    }
  } else if (review.target.kind === "plan") {
    const input = review.target.input;
    statements.push(
      database
        .prepare(
          `INSERT INTO trip_plans (
             id, trip_id, trip_stop_id, title, category, status, scheduled_date, start_time,
             end_time, time_zone, location, place_provider, place_id, confirmation_number,
             booking_url, notes, created_by_user_id, revision, created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?
           WHERE ${condition}`,
        )
        .bind(
          targetId,
          tripId,
          input.tripStopId,
          input.title,
          input.category,
          input.status,
          input.scheduledDate,
          input.startTime,
          input.endTime,
          input.timeZone ?? null,
          input.location,
          input.placeRef?.provider ?? null,
          input.placeRef?.placeId ?? null,
          input.confirmationNumber,
          input.bookingUrl,
          input.notes,
          userId,
          now,
          now,
          candidateId,
          expectedRevision,
        ),
    );
    for (const [position, quote] of (input.priceQuotes ?? []).entries()) {
      statements.push(
        database
          .prepare(
            `INSERT INTO plan_price_quotes (
               id, plan_id, position, amount, currency, unit, display_text, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            targetId,
            position,
            quote.amount,
            quote.currency,
            quote.unit,
            quote.displayText,
            now,
          ),
      );
    }
  } else if (review.target.kind === "stay") {
    const input = review.target.input;
    statements.push(
      database
        .prepare(
          `INSERT INTO stays (
             id, trip_id, status, trip_stop_id, property_name, address, check_in_date, check_out_date,
             confirmation_number, booking_url, notes, property_place_provider, property_place_id,
             property_match_method, property_matched_at, created_by_user_id, created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE ${condition}`,
        )
        .bind(
          targetId,
          tripId,
          input.status,
          input.tripStopId,
          input.propertyName,
          input.address,
          input.checkInDate,
          input.checkOutDate,
          input.confirmationNumber,
          input.bookingUrl,
          input.notes,
          input.propertyRef?.provider ?? null,
          input.propertyRef?.placeId ?? null,
          input.propertyRef ? "user" : null,
          input.propertyRef ? now : null,
          userId,
          now,
          now,
          candidateId,
          expectedRevision,
        ),
    );
    if (input.bookingDetails) {
      statements.push(
        database
          .prepare(
            `INSERT INTO stay_booking_details (
               stay_id, check_in_window, check_out_window, room_type, guest_summary, meal_plan,
               cancellation_summary, cancellation_deadline, total_price_text, amenities_json,
               created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            targetId,
            input.bookingDetails.checkInWindow,
            input.bookingDetails.checkOutWindow,
            input.bookingDetails.roomType,
            input.bookingDetails.guestSummary,
            input.bookingDetails.mealPlan,
            input.bookingDetails.cancellationSummary,
            input.bookingDetails.cancellationDeadline,
            input.bookingDetails.totalPriceText,
            JSON.stringify(input.bookingDetails.amenities),
            now,
            now,
          ),
      );
    }
  } else {
    const input = review.target.input;
    statements.push(
      database
        .prepare(
          `INSERT INTO travel_segments (
             id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
             departure_airport_id, arrival_airport_id, departure_location, arrival_location,
             departure_at, arrival_at, departure_time_zone, arrival_time_zone, carrier,
             reference_number, vehicle_description, confirmation_number, booking_url, notes,
             created_by_user_id, created_at, updated_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           WHERE ${condition}`,
        )
        .bind(
          targetId,
          tripId,
          input.kind,
          input.type,
          input.status,
          input.departureStopId,
          input.arrivalStopId,
          input.departureAirportId ?? null,
          input.arrivalAirportId ?? null,
          input.departureLocation,
          input.arrivalLocation,
          input.departureAt,
          input.arrivalAt,
          input.departureTimeZone ?? null,
          input.arrivalTimeZone ?? null,
          input.carrier,
          input.referenceNumber,
          input.vehicleDescription,
          input.confirmationNumber,
          input.bookingUrl,
          input.notes,
          userId,
          now,
          now,
          candidateId,
          expectedRevision,
        ),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO promotion_links (
           id, trip_id, source_kind, source_id, target_kind, target_id, reviewed_payload_json,
           reviewed_payload_hash, idempotency_key, promoted_by_user_id, promoted_at
         )
         SELECT ?, ?, 'candidate', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM ${
             review.target.kind === "research"
               ? "research_items"
               : review.target.kind === "plan"
                 ? "trip_plans"
                 : review.target.kind === "stay"
                   ? "stays"
                   : "travel_segments"
} WHERE id = ? AND trip_id = ?
         )`,
      )
      .bind(
        promotionId,
        tripId,
        candidateId,
        review.target.kind,
        targetId,
        JSON.stringify(review),
        reviewedPayloadHash,
        idempotencyKey,
        userId,
        now,
        targetId,
        tripId,
      ),
    database
      .prepare(
        `UPDATE artifact_candidates
         SET review_state = 'accepted', revision = revision + 1,
           reviewed_by_user_id = ?, reviewed_at = ?, updated_at = ?
         WHERE id = ? AND revision = ? AND review_state = 'pending'
           AND EXISTS (
             SELECT 1 FROM promotion_links
             WHERE source_kind = 'candidate' AND source_id = ? AND target_id = ?
           )`,
      )
      .bind(userId, now, now, candidateId, expectedRevision, candidateId, targetId),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    const concurrent = await database
      .prepare(
        `SELECT source_id, target_kind, target_id, reviewed_payload_hash
         FROM promotion_links
         WHERE trip_id = ? AND promoted_by_user_id = ? AND idempotency_key = ?`,
      )
      .bind(tripId, userId, idempotencyKey)
      .first<CandidatePromotionReplayRow>();
    if (!concurrent) {
      const competingPromotion = await database
        .prepare(
          `SELECT id FROM promotion_links
           WHERE source_kind = 'candidate' AND source_id = ? AND target_kind = ?`,
        )
        .bind(candidateId, review.target.kind)
        .first<{ id: string }>();
      if (competingPromotion) return { kind: "conflict" };
      throw error;
    }
    if (
      concurrent.source_id !== candidateId ||
      concurrent.target_kind !== review.target.kind ||
      concurrent.reviewed_payload_hash !== reviewedPayloadHash
    ) {
      return { kind: "conflict" };
    }
    const [replayedCandidate, replayedTarget] = await Promise.all([
      getArtifactCandidate(database, tripId, candidateId),
      loadCandidateTarget(
        database,
        tripId,
        concurrent.target_kind,
        concurrent.target_id,
        userId,
        accessLevel,
      ),
    ]);
    return replayedCandidate && replayedTarget
      ? { kind: "replayed", candidate: replayedCandidate, target: replayedTarget }
      : { kind: "conflict" };
  }

  const [accepted, target] = await Promise.all([
    getArtifactCandidate(database, tripId, candidateId),
    loadCandidateTarget(database, tripId, review.target.kind, targetId, userId, accessLevel),
  ]);
  if (!accepted || !target || accepted.reviewState !== "accepted") {
    return { kind: "conflict", currentRevision: accepted?.revision };
  }
  return { kind: "created", candidate: accepted, target };
}
