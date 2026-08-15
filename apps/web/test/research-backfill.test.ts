import { env } from "cloudflare:test";
import {
  type PlanResponse,
  type ResearchPlanPromotionResponse,
  researchPlanPromotionEndpoint,
  type TripResponse,
  tripPlansEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";
import { backfillLegacyIdeas } from "../worker/research-backfill";

const app = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
});

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-test-user", "user_owner");
  return app.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip() {
  return (
    await request(tripsEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Legacy ideas",
        stops: [{ name: "Puglia", arrivalDate: "2026-09-01", departureDate: "2026-09-05" }],
      }),
    })
  ).json<TripResponse>();
}

describe("legacy Ideas backfill", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM research_capture_idempotency"),
      env.DB.prepare("DELETE FROM promotion_links"),
      env.DB.prepare("DELETE FROM research_item_price_quotes"),
      env.DB.prepare("DELETE FROM research_items"),
      env.DB.prepare("DELETE FROM plan_price_quotes"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("dry-runs, applies without changing the legacy Plan, and is repeatable", async () => {
    const { trip } = await createTrip();
    const plan = (
      await (
        await request(tripPlansEndpoint(trip.id), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripStopId: trip.stops[0].id,
            title: "Try a local winery",
            category: "activity",
            status: "idea",
            scheduledDate: null,
            startTime: null,
            endTime: null,
            timeZone: null,
            location: "Valle d’Itria",
            placeRef: null,
            priceQuotes: [
              {
                amount: "15.00",
                currency: "EUR",
                unit: "adult",
                displayText: "€15 per adult",
              },
            ],
            confirmationNumber: null,
            bookingUrl: null,
            notes: "Call before driving over.",
          }),
        })
      ).json<PlanResponse>()
    ).plan;

    const dryRun = await backfillLegacyIdeas(env.DB);
    expect(dryRun).toMatchObject({
      mode: "dry-run",
      scanned: 1,
      eligible: 1,
      created: 0,
      results: [{ planId: plan.id, status: "would_create", researchItemId: null }],
    });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM research_items").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });

    const applied = await backfillLegacyIdeas(env.DB, { apply: true });
    expect(applied).toMatchObject({ mode: "apply", eligible: 1, created: 1 });
    const research = await env.DB.prepare(
      `SELECT title, body, state, category, trip_stop_id, attribution, legacy_plan_id
       FROM research_items WHERE legacy_plan_id = ?`,
    )
      .bind(plan.id)
      .first<Record<string, unknown>>();
    expect(research).toMatchObject({
      title: "Try a local winery",
      body: "Call before driving over.",
      state: "shortlisted",
      category: "activity",
      trip_stop_id: trip.stops[0].id,
      attribution: "Valle d’Itria",
      legacy_plan_id: plan.id,
    });
    expect(
      await env.DB.prepare(
        "SELECT amount, currency, unit, display_text FROM research_item_price_quotes",
      ).first<Record<string, unknown>>(),
    ).toEqual({
      amount: "15.00",
      currency: "EUR",
      unit: "adult",
      display_text: "€15 per adult",
    });
    expect(
      await env.DB.prepare(
        "SELECT source_kind, target_kind, target_id FROM promotion_links WHERE source_id = ?",
      )
        .bind(applied.results[0].researchItemId)
        .first<Record<string, unknown>>(),
    ).toEqual({ source_kind: "research", target_kind: "plan", target_id: plan.id });
    expect(
      await env.DB.prepare(
        "SELECT status, scheduled_date, title, notes FROM trip_plans WHERE id = ?",
      )
        .bind(plan.id)
        .first<Record<string, unknown>>(),
    ).toEqual({
      status: "idea",
      scheduled_date: null,
      title: "Try a local winery",
      notes: "Call before driving over.",
    });

    const repeated = await backfillLegacyIdeas(env.DB, { apply: true });
    expect(repeated).toMatchObject({
      mode: "apply",
      scanned: 1,
      eligible: 0,
      created: 0,
      alreadyBackfilled: 1,
      results: [{ planId: plan.id, status: "already_backfilled" }],
    });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM research_items").first<{
        count: number;
      }>(),
    ).toEqual({ count: 1 });

    const idempotencyKey = crypto.randomUUID();
    const researchItemId = applied.results[0].researchItemId;
    if (!researchItemId) throw new Error("Expected the backfilled Research item.");
    const promotionInput = {
      tripStopId: trip.stops[0].id,
      title: "Try a local winery",
      category: "activity" as const,
      status: "planned" as const,
      scheduledDate: "2026-09-03",
      startTime: "15:00",
      endTime: null,
      timeZone: "Europe/Rome",
      location: "Valle d’Itria",
      placeRef: null,
      priceQuotes: [
        {
          amount: "18.00",
          currency: "EUR",
          unit: "adult" as const,
          displayText: "€18 per adult after review",
        },
      ],
      confirmationNumber: null,
      bookingUrl: null,
      notes: "Reviewed before scheduling.",
    };
    const promote = () =>
      request(researchPlanPromotionEndpoint(trip.id, researchItemId), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "If-Match": '"1"',
        },
        body: JSON.stringify(promotionInput),
      });
    const promotedResponse = await promote();
    const promoted = await promotedResponse.json<ResearchPlanPromotionResponse>();
    const replayedResponse = await promote();
    const replayed = await replayedResponse.json<ResearchPlanPromotionResponse>();
    expect(promotedResponse.status).toBe(201);
    expect(promoted).toMatchObject({
      idempotentReplay: false,
      plan: { id: plan.id, scheduledDate: "2026-09-03", status: "planned" },
      researchItem: {
        promotions: [{ targetId: plan.id, targetState: "scheduled" }],
      },
    });
    expect(replayedResponse.status).toBe(200);
    expect(replayed).toMatchObject({ idempotentReplay: true, plan: { id: plan.id } });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trip_plans WHERE trip_id = ?")
        .bind(trip.id)
        .first<{ count: number }>(),
    ).toEqual({ count: 1 });
    expect(
      await env.DB.prepare("SELECT amount, display_text FROM plan_price_quotes WHERE plan_id = ?")
        .bind(plan.id)
        .first<Record<string, unknown>>(),
    ).toEqual({ amount: "18.00", display_text: "€18 per adult after review" });
  });
});
