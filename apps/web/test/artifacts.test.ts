import { env } from "cloudflare:test";
import {
  artifactCandidatePayloadSchema,
  candidateAttentionIssueSchema,
  type TripResponse,
  tripsEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import italyFixture from "../../../packages/contracts/fixtures/research/italy-fall-2026.json";
import { createApp } from "../worker";
import {
  beginExtractionRun,
  captureArtifact,
  completeExtractionRun,
  deleteSourceArtifact,
  dismissCandidateIfRevision,
  getArtifactCandidate,
  promoteArtifactCandidate,
  recordArtifactVersion,
  type SaveArtifactCandidateInput,
} from "../worker/artifact-repository";

const app = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
});

async function request(path: string, userId: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-test-user", userId);
  return app.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip(name = "Sanitized Italy fixture") {
  const response = await request(tripsEndpoint, "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      stops: [{ name: "Puglia, Italy", arrivalDate: "2026-08-31", departureDate: "2026-09-05" }],
    }),
  });
  return response.json<TripResponse>();
}

function fixtureCandidates(artifactVersionId: string): SaveArtifactCandidateInput[] {
  return italyFixture.candidates.map((candidate) => ({
    id: candidate.id,
    candidateKey: candidate.candidateKey,
    payload: artifactCandidatePayloadSchema.parse(candidate.payload),
    confidence: candidate.confidence,
    dedupeKey: candidate.dedupeKey,
    missingFields: candidate.missingFields,
    attentionIssues: candidate.attentionIssues.map((issue) =>
      candidateAttentionIssueSchema.parse(issue),
    ),
    evidence: candidate.evidence.map((evidence) => ({
      ...evidence,
      artifactVersionId,
    })),
  }));
}

function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}

async function seedFixtureCandidates(tripId: string) {
  const capture = await captureArtifact(env.DB, tripId, "user_owner", {
    kind: "provider_document",
    provider: "google_drive",
    externalId: crypto.randomUUID(),
  });
  const run = required(
    await beginExtractionRun(env.DB, tripId, capture.versionId, {
      normalizerVersion: "fixture-v1",
      extractorVersion: "fixture-v1",
      candidateSchemaVersion: italyFixture.fixtureVersion,
    }),
    "Expected a fixture extraction run.",
  );
  return required(
    await completeExtractionRun(env.DB, tripId, run.id, fixtureCandidates(capture.versionId)),
    "Expected fixture candidates.",
  );
}

describe("artifact and candidate persistence", () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM promotion_links"),
      env.DB.prepare("DELETE FROM candidate_evidence"),
      env.DB.prepare("DELETE FROM artifact_candidates"),
      env.DB.prepare("DELETE FROM extraction_runs"),
      env.DB.prepare("DELETE FROM research_item_sources"),
      env.DB.prepare("DELETE FROM artifact_versions"),
      env.DB.prepare("DELETE FROM source_artifacts"),
      env.DB.prepare("DELETE FROM research_items"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("round-trips every sanitized Italy finding without inventing canonical fields", async () => {
    const { trip } = await createTrip();
    const capture = await captureArtifact(env.DB, trip.id, "user_owner", {
      kind: "provider_document",
      provider: "google_drive",
      externalId: "sanitized-italy-fixture",
      originalUrl: "https://docs.example/sanitized-italy-fixture",
      capturedTitle: "Sanitized Italy planning fixture",
    });
    const version = required(
      await recordArtifactVersion(env.DB, trip.id, capture.artifactId, {
        mimeType: "text/markdown",
        byteLength: 4_096,
        contentHash: "a".repeat(64),
        normalizedContentHash: "b".repeat(64),
        originalStorageKey: "private/sanitized/source",
        normalizedStorageKey: "private/sanitized/normalized",
      }),
      "Expected the second artifact version.",
    );
    expect(version).toMatchObject({ sequence: 2 });
    const run = required(
      await beginExtractionRun(env.DB, trip.id, version.id, {
        normalizerVersion: "fixture-normalizer-v1",
        extractorVersion: "fixture-extractor-v1",
        candidateSchemaVersion: italyFixture.fixtureVersion,
      }),
      "Expected an extraction run.",
    );
    const replayedRun = await beginExtractionRun(env.DB, trip.id, version.id, {
      normalizerVersion: "fixture-normalizer-v1",
      extractorVersion: "fixture-extractor-v1",
      candidateSchemaVersion: italyFixture.fixtureVersion,
    });
    expect(replayedRun?.id).toBe(run?.id);

    const candidates = await completeExtractionRun(
      env.DB,
      trip.id,
      run.id,
      fixtureCandidates(version.id),
    );
    expect(candidates).toHaveLength(italyFixture.candidates.length);
    expect(
      candidates?.filter((candidate) =>
        candidate.attentionIssues.some((issue) => issue.severity === "blocking"),
      ),
    ).toHaveLength(5);

    const flight = candidates?.find((candidate) => candidate.candidateKey === "outbound-flight");
    expect(flight?.payload.kind).toBe("travel");
    if (flight?.payload.kind !== "travel") throw new Error("Expected travel fixture.");
    expect(flight.payload.fields).not.toHaveProperty("departureLocation");
    expect(flight.missingFields).toContain("fields.departureLocation");

    const airportConflict = candidates?.find(
      (candidate) => candidate.candidateKey === "airport-timing-conflict",
    );
    expect(airportConflict?.attentionIssues).toEqual([
      expect.objectContaining({ code: "conflicting_evidence", severity: "blocking" }),
    ]);
    expect(airportConflict?.evidence).toHaveLength(2);

    const beach = candidates?.find(
      (candidate) => candidate.candidateKey === "shallow-beach-option",
    );
    expect(beach?.evidence.map((item) => item.excerpt)).toEqual([
      expect.stringContaining("55 mins"),
      expect.stringContaining("1 hour"),
    ]);

    const completedAgain = await completeExtractionRun(
      env.DB,
      trip.id,
      run.id,
      fixtureCandidates(version.id),
    );
    expect(completedAgain).toHaveLength(italyFixture.candidates.length);
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM artifact_candidates").first<{
        count: number;
      }>(),
    ).toEqual({ count: italyFixture.candidates.length });
  });

  it("scopes candidates to trips and protects review revisions", async () => {
    const { trip } = await createTrip();
    const { trip: other } = await createTrip("Other trip");
    const capture = await captureArtifact(env.DB, trip.id, "user_owner", {
      kind: "url",
      originalUrl: "https://example.com/research",
    });
    const run = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "none-v1",
        extractorVersion: "fixture-v1",
        candidateSchemaVersion: 1,
      }),
      "Expected an extraction run.",
    );
    const [candidate] = required(
      await completeExtractionRun(env.DB, trip.id, run.id, [
        fixtureCandidates(capture.versionId)[4],
      ]),
      "Expected a candidate.",
    );

    expect(await getArtifactCandidate(env.DB, other.id, candidate.id)).toBeNull();
    const dismissed = await dismissCandidateIfRevision(
      env.DB,
      trip.id,
      candidate.id,
      1,
      "user_owner",
    );
    const stale = await dismissCandidateIfRevision(env.DB, trip.id, candidate.id, 1, "user_owner");
    expect(dismissed).toMatchObject({ reviewState: "dismissed", revision: 2 });
    expect(stale).toBeNull();
  });

  it("rejects cross-trip candidate references and evidence from another artifact version", async () => {
    const { trip } = await createTrip();
    const { trip: other } = await createTrip("Other trip");
    const capture = await captureArtifact(env.DB, trip.id, "user_owner", {
      kind: "url",
      originalUrl: "https://example.com/research",
    });
    const run = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "v1",
        extractorVersion: "v1",
        candidateSchemaVersion: 1,
      }),
      "Expected an extraction run.",
    );
    const base = fixtureCandidates(capture.versionId)[4];
    if (base.payload.kind !== "research") throw new Error("Expected the Research fixture.");
    await expect(
      completeExtractionRun(env.DB, trip.id, run.id, [
        {
          ...base,
          payload: {
            ...base.payload,
            fields: { ...base.payload.fields, tripStopId: other.stops[0].id },
          },
        },
      ]),
    ).rejects.toThrow("outside the artifact's trip");

    const otherCapture = await captureArtifact(env.DB, other.id, "user_owner", {
      kind: "url",
      originalUrl: "https://example.com/other",
    });
    const evidenceRun = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "v1",
        extractorVersion: "v2",
        candidateSchemaVersion: 1,
      }),
      "Expected the evidence extraction run.",
    );
    await expect(
      completeExtractionRun(env.DB, trip.id, evidenceRun.id, [
        {
          ...base,
          id: crypto.randomUUID(),
          evidence: base.evidence?.map((evidence) => ({
            ...evidence,
            artifactVersionId: otherCapture.versionId,
          })),
        },
      ]),
    ).rejects.toThrow("extraction run's artifact version");
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM artifact_candidates").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
  });

  it("supersedes older pending interpretations but never accepted or dismissed ones", async () => {
    const { trip } = await createTrip();
    const capture = await captureArtifact(env.DB, trip.id, "user_owner", {
      kind: "provider_document",
      provider: "google_drive",
      externalId: "mutable-document",
    });
    const firstRun = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "v1",
        extractorVersion: "v1",
        candidateSchemaVersion: 1,
      }),
      "Expected the first extraction run.",
    );
    const [first] = required(
      await completeExtractionRun(env.DB, trip.id, firstRun.id, [
        fixtureCandidates(capture.versionId)[4],
      ]),
      "Expected the first candidate.",
    );
    await new Promise((resolve) => setTimeout(resolve, 2));
    const secondRun = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "v1",
        extractorVersion: "v2",
        candidateSchemaVersion: 1,
      }),
      "Expected the second extraction run.",
    );
    await completeExtractionRun(env.DB, trip.id, secondRun.id, [
      { ...fixtureCandidates(capture.versionId)[5], id: crypto.randomUUID() },
    ]);

    expect(await getArtifactCandidate(env.DB, trip.id, first.id)).toMatchObject({
      reviewState: "superseded",
      revision: 2,
    });
  });

  it("purges source versions, candidates, and evidence while retaining a tombstone", async () => {
    const { trip } = await createTrip();
    const capture = await captureArtifact(env.DB, trip.id, "user_editor", {
      kind: "url",
      originalUrl: "https://private.example/path",
    });
    const run = required(
      await beginExtractionRun(env.DB, trip.id, capture.versionId, {
        normalizerVersion: "v1",
        extractorVersion: "v1",
        candidateSchemaVersion: 1,
      }),
      "Expected an extraction run.",
    );
    await completeExtractionRun(env.DB, trip.id, run.id, [fixtureCandidates(capture.versionId)[4]]);

    expect(
      await deleteSourceArtifact(env.DB, trip.id, capture.artifactId, "another_editor", "editor"),
    ).toBe("forbidden");
    expect(
      await deleteSourceArtifact(env.DB, trip.id, capture.artifactId, "user_owner", "owner"),
    ).toBe("deleted");
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM artifact_versions").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM candidate_evidence").first<{
        count: number;
      }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare("SELECT original_url, deleted_at FROM source_artifacts WHERE id = ?")
        .bind(capture.artifactId)
        .first<{ original_url: string | null; deleted_at: string | null }>(),
    ).toMatchObject({ original_url: null, deleted_at: expect.any(String) });
  });

  it("promotes a reviewed candidate once and requires every blocking issue to be resolved", async () => {
    const { trip } = await createTrip();
    const candidates = await seedFixtureCandidates(trip.id);
    const candidate = required(
      candidates.find((item) => item.candidateKey === "winery-tour"),
      "Expected the winery candidate.",
    );
    const review = {
      target: {
        kind: "plan" as const,
        input: {
          tripStopId: trip.stops[0].id,
          title: "Winery tour",
          category: "activity" as const,
          status: "planned" as const,
          scheduledDate: "2026-09-03",
          startTime: "15:00",
          endTime: "16:00",
          timeZone: "Europe/Rome",
          location: "Example Winery, Puglia",
          placeRef: null,
          priceQuotes: [
            {
              amount: "15.00",
              currency: "EUR",
              unit: "adult" as const,
              displayText: "€15 per adult",
            },
          ],
          confirmationNumber: null,
          bookingUrl: "https://winery.example/",
          notes: null,
        },
      },
      resolvedBlockingIssues: [] as number[],
    };

    await expect(
      promoteArtifactCandidate(
        env.DB,
        trip.id,
        candidate.id,
        candidate.revision,
        "user_owner",
        "owner",
        "promote-winery",
        review,
      ),
    ).resolves.toEqual({ kind: "blocked", unresolvedIssueIndexes: [0] });

    review.resolvedBlockingIssues = [0];
    const promoted = await promoteArtifactCandidate(
      env.DB,
      trip.id,
      candidate.id,
      candidate.revision,
      "user_owner",
      "owner",
      "promote-winery",
      review,
    );
    expect(promoted).toMatchObject({
      kind: "created",
      candidate: { reviewState: "accepted", revision: 2 },
      target: {
        title: "Winery tour",
        timeZone: "Europe/Rome",
        priceQuotes: [{ amount: "15.00", currency: "EUR", unit: "adult" }],
      },
    });
    if (promoted.kind !== "created") throw new Error("Expected the candidate to be promoted.");
    await expect(
      promoteArtifactCandidate(
        env.DB,
        trip.id,
        candidate.id,
        candidate.revision,
        "user_owner",
        "owner",
        "promote-winery",
        review,
      ),
    ).resolves.toMatchObject({ kind: "replayed", target: { id: promoted.target.id } });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trip_plans WHERE trip_id = ?")
        .bind(trip.id)
        .first<{ count: number }>(),
    ).toEqual({ count: 1 });
  });

  it("promotes corrected research, stay, and travel targets without losing source provenance", async () => {
    const { trip } = await createTrip();
    const candidates = await seedFixtureCandidates(trip.id);
    const byKey = new Map(candidates.map((candidate) => [candidate.candidateKey, candidate]));

    const researchCandidate = required(byKey.get("dinner-options"), "Expected Research candidate.");
    const research = await promoteArtifactCandidate(
      env.DB,
      trip.id,
      researchCandidate.id,
      1,
      "user_owner",
      "owner",
      "promote-dinner",
      {
        target: {
          kind: "research",
          input: {
            title: "Old-town dinner options",
            body: "Three restaurant alternatives.",
            state: "inbox",
            category: "food",
            tripStopId: trip.stops[0].id,
            placeRef: null,
            attribution: null,
            priceQuotes: [],
          },
        },
        resolvedBlockingIssues: [],
      },
    );
    expect(research).toMatchObject({
      kind: "created",
      target: { title: "Old-town dinner options", sources: [{ kind: "provider_document" }] },
    });

    const stayCandidate = required(byKey.get("old-town-hotel"), "Expected stay candidate.");
    const stay = await promoteArtifactCandidate(
      env.DB,
      trip.id,
      stayCandidate.id,
      1,
      "user_owner",
      "owner",
      "promote-hotel",
      {
        target: {
          kind: "stay",
          input: {
            status: "planning",
            tripStopId: trip.stops[0].id,
            propertyName: "Old Town Boutique Hotel",
            address: "1 Example Street, Puglia, Italy",
            checkInDate: "2026-08-31",
            checkOutDate: "2026-09-05",
            confirmationNumber: null,
            bookingUrl: null,
            notes: null,
            propertyRef: null,
            bookingDetails: {
              checkInWindow: null,
              checkOutWindow: null,
              roomType: null,
              guestSummary: null,
              mealPlan: "Breakfast included",
              cancellationSummary: null,
              cancellationDeadline: null,
              totalPriceText: null,
              amenities: ["breakfast"],
            },
          },
        },
        resolvedBlockingIssues: [0],
      },
    );
    expect(stay).toMatchObject({
      kind: "created",
      target: {
        propertyName: "Old Town Boutique Hotel",
        bookingDetails: { amenities: ["breakfast"] },
      },
    });

    const travelCandidate = required(byKey.get("outbound-flight"), "Expected travel candidate.");
    const travel = await promoteArtifactCandidate(
      env.DB,
      trip.id,
      travelCandidate.id,
      1,
      "user_owner",
      "owner",
      "promote-flight",
      {
        target: {
          kind: "travel",
          input: {
            kind: "journey",
            type: "flight",
            status: "planning",
            departureStopId: null,
            arrivalStopId: trip.stops[0].id,
            departureAirportId: null,
            arrivalAirportId: null,
            departureLocation: "Sanitized departure",
            arrivalLocation: "Puglia, Italy",
            departureAt: "2026-08-30T15:35",
            arrivalAt: "2026-08-31T12:15",
            departureTimeZone: "America/Chicago",
            arrivalTimeZone: "Europe/Rome",
            carrier: null,
            referenceNumber: null,
            vehicleDescription: null,
            confirmationNumber: null,
            bookingUrl: null,
            notes: null,
          },
        },
        resolvedBlockingIssues: [0],
      },
    );
    expect(travel).toMatchObject({
      kind: "created",
      target: { departureTimeZone: "America/Chicago", arrivalTimeZone: "Europe/Rome" },
    });
  });

  it("rejects candidate targets that reference another trip's stop", async () => {
    const { trip } = await createTrip();
    const { trip: otherTrip } = await createTrip("Other trip");
    const candidate = required(
      (await seedFixtureCandidates(trip.id)).find((item) => item.candidateKey === "winery-tour"),
      "Expected the winery candidate.",
    );
    const result = await promoteArtifactCandidate(
      env.DB,
      trip.id,
      candidate.id,
      1,
      "user_owner",
      "owner",
      "cross-trip-stop",
      {
        target: {
          kind: "plan",
          input: {
            tripStopId: otherTrip.stops[0].id,
            title: "Winery tour",
            category: "activity",
            status: "planned",
            scheduledDate: "2026-09-03",
            startTime: null,
            endTime: null,
            timeZone: "Europe/Rome",
            location: null,
            placeRef: null,
            priceQuotes: [],
            confirmationNumber: null,
            bookingUrl: null,
            notes: null,
          },
        },
        resolvedBlockingIssues: [0],
      },
    );
    expect(result).toEqual({ kind: "conflict" });
    expect(
      await env.DB.prepare("SELECT count(*) AS count FROM trip_plans WHERE trip_id = ?")
        .bind(trip.id)
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
  });
});
