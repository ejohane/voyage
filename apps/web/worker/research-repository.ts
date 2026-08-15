import {
  type CreateResearchItemInput,
  type MoneyQuote,
  type ResearchItem,
  type ResearchListQuery,
  type ResearchPlanPromotionInput,
  researchItemSchema,
  type SourceArtifact,
  sourceArtifactSchema,
  type TripAccessLevel,
  type TripPlan,
  type UpdateResearchItemInput,
} from "@voyage/contracts";
import { getPlan } from "./planning-repository";

type ResearchRow = {
  id: string;
  trip_id: string;
  title: string;
  body: string | null;
  state: ResearchItem["state"];
  category: ResearchItem["category"];
  trip_stop_id: string | null;
  place_provider: "google" | null;
  place_id: string | null;
  attribution: string | null;
  created_by_user_id: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

type PriceQuoteRow = {
  amount: string;
  currency: string;
  unit: MoneyQuote["unit"];
  display_text: string;
};

type SourceRow = {
  id: string;
  trip_id: string;
  kind: SourceArtifact["kind"];
  provider: string | null;
  external_id: string | null;
  original_url: string | null;
  canonical_url: string | null;
  captured_title: string | null;
  site_name: string | null;
  visibility: SourceArtifact["visibility"];
  processing_state: SourceArtifact["processingState"];
  captured_by_user_id: string;
  created_at: string;
  updated_at: string;
  version_id: string | null;
  version_sequence: number | null;
  version_mime_type: string | null;
  version_byte_length: number | null;
  version_content_hash: string | null;
  version_normalized_content_hash: string | null;
  version_captured_at: string | null;
};

type PromotionRow = {
  id: string;
  target_kind: "research" | "plan" | "stay" | "travel";
  target_id: string;
  target_state: "scheduled" | "unscheduled" | "missing";
  promoted_at: string;
};

type CaptureIdempotencyRow = {
  request_hash: string;
  response_json: string | null;
  resource_deleted_at: string | null;
};

type PromotionLinkRow = {
  source_id: string;
  target_id: string;
  reviewed_payload_hash: string;
};

type LegacyPromotionLinkRow = PromotionLinkRow & {
  id: string;
  reviewed_payload_json: string;
  idempotency_key: string;
};

const retentionMilliseconds = 7 * 24 * 60 * 60 * 1_000;

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deriveTitle(input: CreateResearchItemInput) {
  if (input.title) return input.title;
  const firstLine = input.body
    ?.split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine) return firstLine.slice(0, 200);
  if (input.source?.originalUrl) {
    try {
      return new URL(input.source.originalUrl).hostname.replace(/^www\./, "").slice(0, 200);
    } catch {
      // Zod validates the URL before this function is called.
    }
  }
  return "Saved research";
}

function quoteStatements(
  database: D1Database,
  researchItemId: string,
  quotes: MoneyQuote[],
  createdAt: string,
  mutationToken?: string,
) {
  return quotes.map((quote, position) => {
    if (mutationToken) {
      return database
        .prepare(
          `INSERT INTO research_item_price_quotes (
             id, research_item_id, position, amount, currency, unit, display_text, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM research_items WHERE id = ? AND mutation_token = ?
           )`,
        )
        .bind(
          crypto.randomUUID(),
          researchItemId,
          position,
          quote.amount,
          quote.currency,
          quote.unit,
          quote.displayText,
          createdAt,
          researchItemId,
          mutationToken,
        );
    }
    return database
      .prepare(
        `INSERT INTO research_item_price_quotes (
           id, research_item_id, position, amount, currency, unit, display_text, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        researchItemId,
        position,
        quote.amount,
        quote.currency,
        quote.unit,
        quote.displayText,
        createdAt,
      );
  });
}

async function listPriceQuotes(database: D1Database, researchItemId: string) {
  const result = await database
    .prepare(
      `SELECT amount, currency, unit, display_text
       FROM research_item_price_quotes
       WHERE research_item_id = ?
       ORDER BY position`,
    )
    .bind(researchItemId)
    .all<PriceQuoteRow>();
  return result.results.map((row) => ({
    amount: row.amount,
    currency: row.currency,
    unit: row.unit,
    displayText: row.display_text,
  }));
}

function canSeeSource(source: SourceRow, userId: string, accessLevel: TripAccessLevel) {
  if (source.captured_by_user_id === userId) return true;
  if (source.visibility === "trip") return true;
  return source.visibility === "planners" && accessLevel !== "viewer";
}

async function listSources(
  database: D1Database,
  researchItemId: string,
  userId: string,
  accessLevel: TripAccessLevel,
) {
  const result = await database
    .prepare(
      `SELECT
         source_artifacts.*,
         artifact_versions.id AS version_id,
         artifact_versions.sequence AS version_sequence,
         artifact_versions.mime_type AS version_mime_type,
         artifact_versions.byte_length AS version_byte_length,
         artifact_versions.content_hash AS version_content_hash,
         artifact_versions.normalized_content_hash AS version_normalized_content_hash,
         artifact_versions.captured_at AS version_captured_at
       FROM research_item_sources
       JOIN artifact_versions ON artifact_versions.id = research_item_sources.artifact_version_id
       JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
       WHERE research_item_sources.research_item_id = ? AND source_artifacts.deleted_at IS NULL
       ORDER BY CASE research_item_sources.relationship WHEN 'primary' THEN 0 ELSE 1 END,
         source_artifacts.created_at`,
    )
    .bind(researchItemId)
    .all<SourceRow>();

  return result.results.flatMap((row): SourceArtifact[] => {
    if (!canSeeSource(row, userId, accessLevel)) return [];
    return [
      sourceArtifactSchema.parse({
        id: row.id,
        tripId: row.trip_id,
        kind: row.kind,
        provider: row.provider,
        externalId: row.external_id,
        originalUrl: row.original_url,
        canonicalUrl: row.canonical_url,
        capturedTitle: row.captured_title,
        siteName: row.site_name,
        visibility: row.visibility,
        processingState: row.processing_state,
        capturedByUserId: row.captured_by_user_id,
        latestVersion: row.version_id
          ? {
              id: row.version_id,
              sequence: row.version_sequence,
              mimeType: row.version_mime_type,
              byteLength: row.version_byte_length,
              contentHash: row.version_content_hash,
              normalizedContentHash: row.version_normalized_content_hash,
              capturedAt: row.version_captured_at,
            }
          : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }),
    ];
  });
}

async function listPromotions(database: D1Database, researchItemId: string) {
  const result = await database
    .prepare(
      `SELECT id, target_kind, target_id, promoted_at,
         CASE
           WHEN target_kind != 'plan' THEN 'scheduled'
           WHEN EXISTS (
             SELECT 1 FROM trip_plans
             WHERE trip_plans.id = promotion_links.target_id
               AND trip_plans.scheduled_date IS NOT NULL
           ) THEN 'scheduled'
           WHEN EXISTS (
             SELECT 1 FROM trip_plans WHERE trip_plans.id = promotion_links.target_id
           ) THEN 'unscheduled'
           ELSE 'missing'
         END AS target_state
       FROM promotion_links
       WHERE source_kind = 'research' AND source_id = ?
       ORDER BY promoted_at`,
    )
    .bind(researchItemId)
    .all<PromotionRow>();
  return result.results.map((row) => ({
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    targetState: row.target_state,
    promotedAt: row.promoted_at,
  }));
}

async function mapResearch(
  database: D1Database,
  row: ResearchRow,
  userId: string,
  accessLevel: TripAccessLevel,
): Promise<ResearchItem> {
  const [priceQuotes, sources, promotions] = await Promise.all([
    listPriceQuotes(database, row.id),
    listSources(database, row.id, userId, accessLevel),
    listPromotions(database, row.id),
  ]);
  return researchItemSchema.parse({
    id: row.id,
    tripId: row.trip_id,
    title: row.title,
    body: row.body,
    state: row.state,
    category: row.category,
    tripStopId: row.trip_stop_id,
    placeRef:
      row.place_provider === "google" && row.place_id
        ? { provider: "google", placeId: row.place_id }
        : null,
    attribution: row.attribution,
    priceQuotes,
    sources,
    promotions,
    createdByUserId: row.created_by_user_id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function encodeCursor(row: ResearchRow) {
  return btoa(JSON.stringify([row.updated_at, row.id]));
}

function decodeCursor(value: string | undefined): [string, string] | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(atob(value));
    return Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((item) => typeof item === "string")
      ? [parsed[0], parsed[1]]
      : null;
  } catch {
    return null;
  }
}

export async function getResearchItem(
  database: D1Database,
  tripId: string,
  researchItemId: string,
  userId: string,
  accessLevel: TripAccessLevel,
) {
  const row = await database
    .prepare("SELECT * FROM research_items WHERE id = ? AND trip_id = ?")
    .bind(researchItemId, tripId)
    .first<ResearchRow>();
  return row ? mapResearch(database, row, userId, accessLevel) : null;
}

export async function listResearchItems(
  database: D1Database,
  tripId: string,
  userId: string,
  accessLevel: TripAccessLevel,
  query: ResearchListQuery,
) {
  const clauses = ["trip_id = ?"];
  const bindings: unknown[] = [tripId];
  if (query.state) {
    clauses.push("state = ?");
    bindings.push(query.state);
  }
  if (query.category) {
    clauses.push("category = ?");
    bindings.push(query.category);
  }
  if (query.tripStopId) {
    clauses.push("trip_stop_id = ?");
    bindings.push(query.tripStopId);
  }
  const cursor = decodeCursor(query.cursor);
  if (cursor) {
    clauses.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
    bindings.push(cursor[0], cursor[0], cursor[1]);
  }
  const result = await database
    .prepare(
      `SELECT * FROM research_items
       WHERE ${clauses.join(" AND ")}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`,
    )
    .bind(...bindings, query.limit + 1)
    .all<ResearchRow>();
  const hasNext = result.results.length > query.limit;
  const rows = result.results.slice(0, query.limit);
  const lastRow = rows.at(-1);
  return {
    researchItems: await Promise.all(
      rows.map((row) => mapResearch(database, row, userId, accessLevel)),
    ),
    nextCursor: hasNext && lastRow ? encodeCursor(lastRow) : null,
  };
}

function captureResponse(
  input: CreateResearchItemInput,
  tripId: string,
  userId: string,
  now: string,
) {
  const researchItemId = crypto.randomUUID();
  const artifactId = input.source ? crypto.randomUUID() : null;
  const versionId = input.source ? crypto.randomUUID() : null;
  const mutationToken = crypto.randomUUID();
  const title = deriveTitle(input);
  const researchItem = researchItemSchema.parse({
    id: researchItemId,
    tripId,
    title,
    body: input.body,
    state: input.state,
    category: input.category,
    tripStopId: input.tripStopId,
    placeRef: input.placeRef,
    attribution: input.attribution,
    priceQuotes: input.priceQuotes,
    sources:
      input.source && artifactId && versionId
        ? [
            {
              id: artifactId,
              tripId,
              kind: input.source.kind,
              provider: input.source.provider,
              externalId: input.source.externalId,
              originalUrl: input.source.originalUrl,
              canonicalUrl: null,
              capturedTitle: input.source.capturedTitle,
              siteName: input.source.siteName,
              visibility: input.source.visibility,
              processingState: "captured",
              capturedByUserId: userId,
              latestVersion: {
                id: versionId,
                sequence: 1,
                mimeType: null,
                byteLength: null,
                contentHash: null,
                normalizedContentHash: null,
                capturedAt: now,
              },
              createdAt: now,
              updatedAt: now,
            },
          ]
        : [],
    promotions: [],
    createdByUserId: userId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });
  return { researchItem, artifactId, versionId, mutationToken };
}

export type CreateResearchResult =
  | { kind: "created" | "replayed"; researchItem: ResearchItem }
  | { kind: "conflict" };

export async function createResearchItemIdempotently(
  database: D1Database,
  tripId: string,
  userId: string,
  idempotencyKey: string,
  input: CreateResearchItemInput,
): Promise<CreateResearchResult> {
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const requestHash = await sha256({ tripId, input });
  await database
    .prepare("DELETE FROM research_capture_idempotency WHERE expires_at <= ?")
    .bind(now)
    .run();
  const existing = await database
    .prepare(
      `SELECT request_hash, response_json, resource_deleted_at
       FROM research_capture_idempotency
       WHERE user_id = ? AND idempotency_key = ? AND expires_at > ?`,
    )
    .bind(userId, idempotencyKey, now)
    .first<CaptureIdempotencyRow>();
  if (existing) {
    if (
      existing.request_hash !== requestHash ||
      existing.resource_deleted_at ||
      !existing.response_json
    ) {
      return { kind: "conflict" };
    }
    return {
      kind: "replayed",
      researchItem: researchItemSchema.parse(JSON.parse(existing.response_json)),
    };
  }

  const created = captureResponse(input, tripId, userId, now);
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `INSERT INTO research_items (
           id, trip_id, title, body, state, category, trip_stop_id, place_provider, place_id,
           attribution, created_by_user_id, revision, mutation_token, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        created.researchItem.id,
        tripId,
        created.researchItem.title,
        created.researchItem.body,
        created.researchItem.state,
        created.researchItem.category,
        created.researchItem.tripStopId,
        created.researchItem.placeRef?.provider ?? null,
        created.researchItem.placeRef?.placeId ?? null,
        created.researchItem.attribution,
        userId,
        created.mutationToken,
        now,
        now,
      ),
    ...quoteStatements(database, created.researchItem.id, created.researchItem.priceQuotes, now),
  ];
  if (input.source && created.artifactId && created.versionId) {
    statements.push(
      database
        .prepare(
          `INSERT INTO source_artifacts (
             id, trip_id, kind, provider, external_id, original_url, canonical_url, captured_title,
             site_name, visibility, processing_state, captured_by_user_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'captured', ?, ?, ?)`,
        )
        .bind(
          created.artifactId,
          tripId,
          input.source.kind,
          input.source.provider,
          input.source.externalId,
          input.source.originalUrl,
          input.source.capturedTitle,
          input.source.siteName,
          input.source.visibility,
          userId,
          now,
          now,
        ),
      database
        .prepare(
          `INSERT INTO artifact_versions (id, artifact_id, sequence, captured_at)
           VALUES (?, ?, 1, ?)`,
        )
        .bind(created.versionId, created.artifactId, now),
      database
        .prepare(
          `INSERT INTO research_item_sources (
             research_item_id, artifact_version_id, relationship, created_at
           ) VALUES (?, ?, 'primary', ?)`,
        )
        .bind(created.researchItem.id, created.versionId, now),
    );
  }
  statements.push(
    database
      .prepare(
        `INSERT INTO research_capture_idempotency (
           user_id, idempotency_key, request_hash, trip_id, research_item_id, response_json,
           resource_deleted_at, created_at, expires_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .bind(
        userId,
        idempotencyKey,
        requestHash,
        tripId,
        created.researchItem.id,
        JSON.stringify(created.researchItem),
        now,
        new Date(nowDate.getTime() + retentionMilliseconds).toISOString(),
      ),
  );

  try {
    await database.batch(statements);
    return { kind: "created", researchItem: created.researchItem };
  } catch (error) {
    const concurrent = await database
      .prepare(
        `SELECT request_hash, response_json, resource_deleted_at
         FROM research_capture_idempotency
         WHERE user_id = ? AND idempotency_key = ? AND expires_at > ?`,
      )
      .bind(userId, idempotencyKey, now)
      .first<CaptureIdempotencyRow>();
    if (concurrent?.request_hash === requestHash && concurrent.response_json) {
      return {
        kind: "replayed",
        researchItem: researchItemSchema.parse(JSON.parse(concurrent.response_json)),
      };
    }
    throw error;
  }
}

export type ResearchMutationResult =
  | { kind: "updated"; researchItem: ResearchItem }
  | { kind: "deleted" }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "not_found" };

export async function updateResearchItemIfRevision(
  database: D1Database,
  tripId: string,
  researchItemId: string,
  expectedRevision: number,
  input: UpdateResearchItemInput,
  userId: string,
  accessLevel: TripAccessLevel,
): Promise<ResearchMutationResult> {
  const fields = input as Record<string, unknown>;
  const columns: Record<string, string> = {
    title: "title",
    body: "body",
    state: "state",
    category: "category",
    tripStopId: "trip_stop_id",
    attribution: "attribution",
  };
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [field, value] of Object.entries(fields)) {
    if (field === "priceQuotes" || field === "placeRef") continue;
    assignments.push(`${columns[field]} = ?`);
    values.push(value);
  }
  if ("placeRef" in fields) {
    const placeRef = fields.placeRef as ResearchItem["placeRef"];
    assignments.push("place_provider = ?", "place_id = ?");
    values.push(placeRef?.provider ?? null, placeRef?.placeId ?? null);
  }
  const mutationToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    database
      .prepare(
        `UPDATE research_items
         SET ${assignments.join(", ")}${assignments.length ? "," : ""}
             revision = revision + 1, mutation_token = ?, updated_at = ?
         WHERE id = ? AND trip_id = ? AND revision = ?`,
      )
      .bind(...values, mutationToken, now, researchItemId, tripId, expectedRevision),
  ];
  if (fields.priceQuotes !== undefined) {
    statements.push(
      database
        .prepare(
          `DELETE FROM research_item_price_quotes
           WHERE research_item_id = ?
             AND EXISTS (
               SELECT 1 FROM research_items WHERE id = ? AND mutation_token = ?
             )`,
        )
        .bind(researchItemId, researchItemId, mutationToken),
      ...quoteStatements(
        database,
        researchItemId,
        fields.priceQuotes as MoneyQuote[],
        now,
        mutationToken,
      ),
    );
  }
  const [updated] = await database.batch(statements);
  if (updated.meta.changes > 0) {
    const researchItem = await getResearchItem(
      database,
      tripId,
      researchItemId,
      userId,
      accessLevel,
    );
    if (!researchItem) return { kind: "not_found" };
    return { kind: "updated", researchItem };
  }
  const current = await database
    .prepare("SELECT revision FROM research_items WHERE id = ? AND trip_id = ?")
    .bind(researchItemId, tripId)
    .first<{ revision: number }>();
  return current ? { kind: "conflict", currentRevision: current.revision } : { kind: "not_found" };
}

export async function deleteResearchItemIfRevision(
  database: D1Database,
  tripId: string,
  researchItemId: string,
  expectedRevision: number,
): Promise<ResearchMutationResult> {
  const artifactRows = await database
    .prepare(
      `SELECT DISTINCT source_artifacts.id
       FROM research_item_sources
       JOIN artifact_versions ON artifact_versions.id = research_item_sources.artifact_version_id
       JOIN source_artifacts ON source_artifacts.id = artifact_versions.artifact_id
       WHERE research_item_sources.research_item_id = ? AND source_artifacts.trip_id = ?`,
    )
    .bind(researchItemId, tripId)
    .all<{ id: string }>();
  const now = new Date().toISOString();
  const statements = [
    database
      .prepare("DELETE FROM research_items WHERE id = ? AND trip_id = ? AND revision = ?")
      .bind(researchItemId, tripId, expectedRevision),
  ];
  for (const { id: artifactId } of artifactRows.results) {
    statements.push(
      database
        .prepare(
          `DELETE FROM artifact_versions
           WHERE artifact_id = ?
             AND NOT EXISTS (
               SELECT 1 FROM research_item_sources
               JOIN artifact_versions AS linked_version
                 ON linked_version.id = research_item_sources.artifact_version_id
               WHERE linked_version.artifact_id = ?
             )`,
        )
        .bind(artifactId, artifactId),
      database
        .prepare(
          `UPDATE source_artifacts
           SET original_url = NULL, canonical_url = NULL, captured_title = NULL, site_name = NULL,
             external_id = NULL, processing_state = 'unsupported', deleted_at = ?, updated_at = ?
           WHERE id = ? AND trip_id = ?
             AND NOT EXISTS (SELECT 1 FROM artifact_versions WHERE artifact_id = ?)`,
        )
        .bind(now, now, artifactId, tripId, artifactId),
    );
  }
  const [result] = await database.batch(statements);
  if (result.meta.changes > 0) return { kind: "deleted" };
  const current = await database
    .prepare("SELECT revision FROM research_items WHERE id = ? AND trip_id = ?")
    .bind(researchItemId, tripId)
    .first<{ revision: number }>();
  return current ? { kind: "conflict", currentRevision: current.revision } : { kind: "not_found" };
}

export type PromoteResearchPlanResult =
  | { kind: "created" | "replayed"; researchItem: ResearchItem; plan: TripPlan }
  | { kind: "conflict"; currentRevision?: number }
  | { kind: "not_found" };

async function promoteBackfilledLegacyIdea(
  database: D1Database,
  tripId: string,
  researchItemId: string,
  userId: string,
  accessLevel: TripAccessLevel,
  idempotencyKey: string,
  input: ResearchPlanPromotionInput,
  payloadHash: string,
  legacyLink: LegacyPromotionLinkRow,
): Promise<PromoteResearchPlanResult> {
  let legacyPayload: { migration?: unknown; legacyPlanId?: unknown };
  try {
    legacyPayload = JSON.parse(legacyLink.reviewed_payload_json) as typeof legacyPayload;
  } catch {
    return { kind: "conflict" };
  }
  if (
    legacyPayload.migration !== "legacy_ideas_v1" ||
    legacyPayload.legacyPlanId !== legacyLink.target_id
  ) {
    return { kind: "conflict" };
  }

  const now = new Date().toISOString();
  const claim = database
    .prepare(
      `UPDATE promotion_links
       SET reviewed_payload_json = ?, reviewed_payload_hash = ?, idempotency_key = ?,
         promoted_by_user_id = ?, promoted_at = ?
       WHERE id = ? AND trip_id = ? AND reviewed_payload_hash = ?
         AND EXISTS (
           SELECT 1 FROM trip_plans
           WHERE id = ? AND trip_id = ? AND status = 'idea' AND scheduled_date IS NULL
         )`,
    )
    .bind(
      JSON.stringify(input),
      payloadHash,
      idempotencyKey,
      userId,
      now,
      legacyLink.id,
      tripId,
      legacyLink.reviewed_payload_hash,
      legacyLink.target_id,
      tripId,
    );
  const updatePlan = database
    .prepare(
      `UPDATE trip_plans
       SET trip_stop_id = ?, title = ?, category = ?, status = ?, scheduled_date = ?,
         start_time = ?, end_time = ?, time_zone = ?, location = ?, place_provider = ?,
         place_id = ?, confirmation_number = ?, booking_url = ?, notes = ?,
         revision = revision + 1, updated_at = ?
       WHERE id = ? AND trip_id = ? AND status = 'idea' AND scheduled_date IS NULL
         AND EXISTS (
           SELECT 1 FROM promotion_links
           WHERE id = ? AND idempotency_key = ? AND reviewed_payload_hash = ?
         )`,
    )
    .bind(
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
      now,
      legacyLink.target_id,
      tripId,
      legacyLink.id,
      idempotencyKey,
      payloadHash,
    );
  const statements: D1PreparedStatement[] = [
    claim,
    updatePlan,
    database
      .prepare(
        `DELETE FROM plan_price_quotes
         WHERE plan_id = ? AND EXISTS (
           SELECT 1 FROM promotion_links
           WHERE id = ? AND idempotency_key = ? AND reviewed_payload_hash = ?
         )`,
      )
      .bind(legacyLink.target_id, legacyLink.id, idempotencyKey, payloadHash),
  ];
  for (const [position, quote] of (input.priceQuotes ?? []).entries()) {
    statements.push(
      database
        .prepare(
          `INSERT INTO plan_price_quotes (
             id, plan_id, position, amount, currency, unit, display_text, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM promotion_links
             WHERE id = ? AND idempotency_key = ? AND reviewed_payload_hash = ?
           )`,
        )
        .bind(
          crypto.randomUUID(),
          legacyLink.target_id,
          position,
          quote.amount,
          quote.currency,
          quote.unit,
          quote.displayText,
          now,
          legacyLink.id,
          idempotencyKey,
          payloadHash,
        ),
    );
  }

  let replayed = false;
  try {
    const [claimed, updated] = await database.batch(statements);
    if (claimed.meta.changes === 0 || updated.meta.changes === 0) return { kind: "conflict" };
  } catch (error) {
    const concurrent = await database
      .prepare(
        `SELECT source_id, target_id, reviewed_payload_hash
         FROM promotion_links
         WHERE trip_id = ? AND promoted_by_user_id = ? AND idempotency_key = ?`,
      )
      .bind(tripId, userId, idempotencyKey)
      .first<PromotionLinkRow>();
    if (
      !concurrent ||
      concurrent.source_id !== researchItemId ||
      concurrent.reviewed_payload_hash !== payloadHash
    ) {
      if (concurrent) return { kind: "conflict" };
      throw error;
    }
    replayed = true;
  }
  const [researchItem, plan] = await Promise.all([
    getResearchItem(database, tripId, researchItemId, userId, accessLevel),
    getPlan(database, tripId, legacyLink.target_id),
  ]);
  return researchItem && plan
    ? { kind: replayed ? "replayed" : "created", researchItem, plan }
    : { kind: "conflict" };
}

export async function promoteResearchToPlan(
  database: D1Database,
  tripId: string,
  researchItemId: string,
  expectedRevision: number,
  userId: string,
  accessLevel: TripAccessLevel,
  idempotencyKey: string,
  input: ResearchPlanPromotionInput,
): Promise<PromoteResearchPlanResult> {
  const payloadHash = await sha256(input);
  const replay = await database
    .prepare(
      `SELECT source_id, target_id, reviewed_payload_hash
       FROM promotion_links
       WHERE trip_id = ? AND promoted_by_user_id = ? AND idempotency_key = ?`,
    )
    .bind(tripId, userId, idempotencyKey)
    .first<PromotionLinkRow>();
  if (replay) {
    if (replay.source_id !== researchItemId || replay.reviewed_payload_hash !== payloadHash) {
      return { kind: "conflict" };
    }
    const [researchItem, plan] = await Promise.all([
      getResearchItem(database, tripId, researchItemId, userId, accessLevel),
      getPlan(database, tripId, replay.target_id),
    ]);
    return researchItem && plan ? { kind: "replayed", researchItem, plan } : { kind: "conflict" };
  }

  const current = await database
    .prepare("SELECT revision, state FROM research_items WHERE id = ? AND trip_id = ?")
    .bind(researchItemId, tripId)
    .first<{ revision: number; state: ResearchItem["state"] }>();
  if (!current) return { kind: "not_found" };
  if (current.revision !== expectedRevision || current.state === "dismissed") {
    return { kind: "conflict", currentRevision: current.revision };
  }

  const legacyLink = await database
    .prepare(
      `SELECT promotion_links.id, promotion_links.source_id, promotion_links.target_id,
         promotion_links.reviewed_payload_json, promotion_links.reviewed_payload_hash,
         promotion_links.idempotency_key
       FROM promotion_links
       JOIN research_items ON research_items.id = promotion_links.source_id
       WHERE promotion_links.trip_id = ? AND promotion_links.source_kind = 'research'
         AND promotion_links.source_id = ? AND promotion_links.target_kind = 'plan'
         AND research_items.legacy_plan_id = promotion_links.target_id`,
    )
    .bind(tripId, researchItemId)
    .first<LegacyPromotionLinkRow>();
  if (legacyLink) {
    return promoteBackfilledLegacyIdea(
      database,
      tripId,
      researchItemId,
      userId,
      accessLevel,
      idempotencyKey,
      input,
      payloadHash,
      legacyLink,
    );
  }

  const planId = crypto.randomUUID();
  const promotionId = crypto.randomUUID();
  const now = new Date().toISOString();
  const planQuoteStatements = (input.priceQuotes ?? []).map((quote, position) =>
    database
      .prepare(
        `INSERT INTO plan_price_quotes (
           id, plan_id, position, amount, currency, unit, display_text, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        planId,
        position,
        quote.amount,
        quote.currency,
        quote.unit,
        quote.displayText,
        now,
      ),
  );
  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO trip_plans (
             id, trip_id, trip_stop_id, title, category, status, scheduled_date, start_time,
             end_time, time_zone, location, place_provider, place_id, confirmation_number,
             booking_url, notes, created_by_user_id, revision, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(
          planId,
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
        ),
      ...planQuoteStatements,
      database
        .prepare(
          `INSERT INTO promotion_links (
             id, trip_id, source_kind, source_id, target_kind, target_id, reviewed_payload_json,
             reviewed_payload_hash, idempotency_key, promoted_by_user_id, promoted_at
           ) VALUES (?, ?, 'research', ?, 'plan', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          promotionId,
          tripId,
          researchItemId,
          planId,
          JSON.stringify(input),
          payloadHash,
          idempotencyKey,
          userId,
          now,
        ),
    ]);
  } catch (error) {
    const concurrent = await database
      .prepare(
        `SELECT source_id, target_id, reviewed_payload_hash
         FROM promotion_links
         WHERE trip_id = ? AND promoted_by_user_id = ? AND idempotency_key = ?`,
      )
      .bind(tripId, userId, idempotencyKey)
      .first<PromotionLinkRow>();
    if (!concurrent) {
      const competingPromotion = await database
        .prepare(
          `SELECT id FROM promotion_links
           WHERE source_kind = 'research' AND source_id = ? AND target_kind = 'plan'`,
        )
        .bind(researchItemId)
        .first<{ id: string }>();
      if (competingPromotion) return { kind: "conflict" };
      throw error;
    }
    if (
      concurrent.source_id !== researchItemId ||
      concurrent.reviewed_payload_hash !== payloadHash
    ) {
      return { kind: "conflict" };
    }
    const [researchItem, plan] = await Promise.all([
      getResearchItem(database, tripId, researchItemId, userId, accessLevel),
      getPlan(database, tripId, concurrent.target_id),
    ]);
    return researchItem && plan ? { kind: "replayed", researchItem, plan } : { kind: "conflict" };
  }
  const [researchItem, plan] = await Promise.all([
    getResearchItem(database, tripId, researchItemId, userId, accessLevel),
    getPlan(database, tripId, planId),
  ]);
  if (!researchItem || !plan) throw new Error("Promoted Research plan could not be loaded.");
  return { kind: "created", researchItem, plan };
}
