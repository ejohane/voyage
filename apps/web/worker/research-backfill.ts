import { type MoneyQuote, moneyQuoteSchema, type ResearchCategory } from "@voyage/contracts";

type LegacyIdeaRow = {
  id: string;
  trip_id: string;
  trip_stop_id: string;
  title: string;
  category: "activity" | "food" | "event" | "sightseeing" | "other";
  location: string | null;
  place_provider: "google" | null;
  place_id: string | null;
  notes: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  price_quotes_json: string | null;
  research_item_id: string | null;
};

export type LegacyIdeaBackfillResult = {
  mode: "dry-run" | "apply";
  scanned: number;
  eligible: number;
  created: number;
  alreadyBackfilled: number;
  results: {
    planId: string;
    tripId: string;
    title: string;
    researchItemId: string | null;
    status: "would_create" | "created" | "already_backfilled";
  }[];
};

function researchCategory(category: LegacyIdeaRow["category"]): ResearchCategory {
  if (category === "food") return "food";
  if (category === "sightseeing") return "place";
  if (category === "activity" || category === "event") return "activity";
  return "other";
}

function parseQuotes(value: string | null): MoneyQuote[] {
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? parsed.map((quote) => moneyQuoteSchema.parse(quote)) : [];
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const legacyIdeasSelect = `
  SELECT trip_plans.id, trip_plans.trip_id, trip_plans.trip_stop_id, trip_plans.title,
    trip_plans.category, trip_plans.location, trip_plans.place_provider, trip_plans.place_id,
    trip_plans.notes, trip_plans.created_by_user_id, trip_plans.created_at, trip_plans.updated_at,
    research_items.id AS research_item_id,
    (
      SELECT json_group_array(json_object(
        'amount', amount, 'currency', currency, 'unit', unit, 'displayText', display_text
      ))
      FROM plan_price_quotes
      WHERE plan_id = trip_plans.id
      ORDER BY position
    ) AS price_quotes_json
  FROM trip_plans
  LEFT JOIN research_items ON research_items.legacy_plan_id = trip_plans.id
  WHERE trip_plans.scheduled_date IS NULL AND trip_plans.status = 'idea'
  ORDER BY trip_plans.created_at, trip_plans.id
  LIMIT ?`;

export async function backfillLegacyIdeas(
  database: D1Database,
  options: { apply?: boolean; limit?: number } = {},
): Promise<LegacyIdeaBackfillResult> {
  const apply = options.apply ?? false;
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 5_000);
  const rows = await database.prepare(legacyIdeasSelect).bind(limit).all<LegacyIdeaRow>();
  const results: LegacyIdeaBackfillResult["results"] = [];
  let created = 0;

  for (const row of rows.results) {
    if (row.research_item_id) {
      results.push({
        planId: row.id,
        tripId: row.trip_id,
        title: row.title,
        researchItemId: row.research_item_id,
        status: "already_backfilled",
      });
      continue;
    }
    if (!apply) {
      results.push({
        planId: row.id,
        tripId: row.trip_id,
        title: row.title,
        researchItemId: null,
        status: "would_create",
      });
      continue;
    }

    const researchItemId = crypto.randomUUID();
    const promotionId = crypto.randomUUID();
    const quotes = parseQuotes(row.price_quotes_json);
    const reviewedPayload = { migration: "legacy_ideas_v1", legacyPlanId: row.id };
    const reviewedPayloadHash = await sha256(reviewedPayload);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      database
        .prepare(
          `INSERT INTO research_items (
             id, trip_id, title, body, state, category, trip_stop_id, place_provider, place_id,
             attribution, legacy_plan_id, created_by_user_id, revision, mutation_token,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, 'shortlisted', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .bind(
          researchItemId,
          row.trip_id,
          row.title,
          row.notes,
          researchCategory(row.category),
          row.trip_stop_id,
          row.place_provider,
          row.place_id,
          row.location,
          row.id,
          row.created_by_user_id,
          crypto.randomUUID(),
          row.created_at,
          row.updated_at,
        ),
    ];
    for (const [position, quote] of quotes.entries()) {
      statements.push(
        database
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
            now,
          ),
      );
    }
    statements.push(
      database
        .prepare(
          `INSERT INTO promotion_links (
             id, trip_id, source_kind, source_id, target_kind, target_id, reviewed_payload_json,
             reviewed_payload_hash, idempotency_key, promoted_by_user_id, promoted_at
           ) VALUES (?, ?, 'research', ?, 'plan', ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          promotionId,
          row.trip_id,
          researchItemId,
          row.id,
          JSON.stringify(reviewedPayload),
          reviewedPayloadHash,
          `legacy-ideas-v1:${row.id}`,
          row.created_by_user_id,
          now,
        ),
    );

    try {
      await database.batch(statements);
      created += 1;
      results.push({
        planId: row.id,
        tripId: row.trip_id,
        title: row.title,
        researchItemId,
        status: "created",
      });
    } catch (error) {
      const existing = await database
        .prepare("SELECT id FROM research_items WHERE legacy_plan_id = ?")
        .bind(row.id)
        .first<{ id: string }>();
      if (!existing) throw error;
      results.push({
        planId: row.id,
        tripId: row.trip_id,
        title: row.title,
        researchItemId: existing.id,
        status: "already_backfilled",
      });
    }
  }

  return {
    mode: apply ? "apply" : "dry-run",
    scanned: rows.results.length,
    eligible: results.filter((result) => result.status !== "already_backfilled").length,
    created,
    alreadyBackfilled: results.filter((result) => result.status === "already_backfilled").length,
    results,
  };
}

export { legacyIdeasSelect };
