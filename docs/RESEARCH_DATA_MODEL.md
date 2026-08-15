# Research and provenance foundation

## Product boundary

Research is the low-friction place for material that may affect a trip but is not yet a commitment.
A person can save a URL or a plain-text note in one action. Voyage may later normalize and extract
typed candidates from attached artifacts, but it never turns uncertain source material into a
scheduled plan without explicit review.

The first release establishes storage, contracts, review boundaries, a feature-gated Research UI,
and a reversible legacy-Ideas backfill. It does not fetch documents, run OCR or AI extraction,
connect Google Drive, create background queues, or introduce tasks and decisions.

## Canonical records

| Record | Purpose | Lifecycle |
| --- | --- | --- |
| `research_items` | A user-facing possibility, note, or reference | `inbox` → `considering` → `shortlisted` or `dismissed` |
| `source_artifacts` | Identity, access, and processing state for incoming material | Captured independently of content versions; deletion retains only a sanitized tombstone |
| `artifact_versions` | Immutable metadata for one observed artifact revision | Append-only; sequence and content hashes identify revisions |
| `extraction_runs` | Versioned normalization/extraction attempt | `queued`, `processing`, then `completed`, `partial`, or `failed` |
| `artifact_candidates` | Typed but non-canonical interpretation | `pending` → `accepted`, `dismissed`, or `superseded` |
| `candidate_evidence` | Exact source excerpts and locators supporting a candidate | Belongs to the immutable artifact version used by its extraction run |
| `promotion_links` | Provenance from a candidate or Research item to a canonical target | Immutable audit link; target deletion never deletes the source Research item |

Research-to-artifact membership is many-to-many through `research_item_sources`. A Research item can
combine multiple sources and an artifact can support multiple Research items without copying its
identity or versions.

## Shared value boundaries

- `PlaceRef` is a provider plus provider-specific place ID. It is a reference, not copied place
  metadata.
- `MoneyQuote` preserves a decimal string, ISO currency code, semantic unit, and source-facing
  display text. Quotes are observations rather than a single canonical price.
- Travel stores departure and arrival IANA time zones separately. A scheduled Plan stores one IANA
  time zone. Local dates and times remain local values and are never silently converted.
- Candidate temporal values additionally preserve precision and raw source text, so approximate or
  inferred times cannot masquerade as exact canonical values.

## Capture invariants

1. One request may contain a URL, a note, or both; no title, category, or destination is required.
2. A missing title is derived for display only: URL hostname first, otherwise the first useful note
   line. The supplied source remains unchanged.
3. Every mutating capture request carries an `Idempotency-Key`. Replaying the same key and body
   returns the original item; reusing it for another body conflicts. Deleted resources leave an
   idempotency tombstone and cannot be recreated by replay.
4. Research edits and deletes require the current revision through `If-Match`. The mutation token
   also makes child-value replacement atomic with the parent update.
5. Artifact versions and completed candidate payloads are immutable. Reprocessing creates a new run;
   it does not rewrite old evidence.
6. A newer successful interpretation supersedes only older pending candidates. Accepted and
   dismissed review decisions remain intact.

## Review and promotion invariants

Candidate payloads are deliberately partial. Missing data and attention issues are data, not parser
failures. Promotion accepts a separately validated, complete target payload representing what the
person reviewed; it never fills absent fields from inference.

- Every blocking issue index must be explicitly resolved before promotion.
- Candidate kind and target kind must match.
- Referenced stops must belong to the same trip and referenced airport IDs must exist.
- The candidate revision must still be pending when the target and promotion link are inserted.
- Target creation, provenance insertion, and candidate acceptance are one D1 batch. A race cannot
  create a second target.
- An idempotency key replays only when candidate, target kind, and reviewed-payload hash match.
- Research can be promoted only to a scheduled, `planned` or `booked` Plan. A dismissed Research item
  must be restored before promotion.
- Promotion copies reviewed values into a new canonical record. Later edits do not rewrite the source
  or reviewed-payload audit record.

## Access and deletion

Trip owners and editors can capture and change Research. Viewers have read-only access. Artifact
visibility further limits source disclosure:

- `private`: only the capturer;
- `planners`: owner and editors;
- `trip`: every trip member, including viewers.

An editor may delete an artifact they captured; a trip owner may delete any artifact. Deletion
removes versions, extraction runs, candidates, evidence, and stored content keys, then clears source
identifiers and URLs on the retained tombstone. Research and canonical targets have independent
lifecycles: deleting a promoted target keeps Research; deleting Research does not cascade into a
promoted target.

Request and failure logs must contain identifiers, state, and error categories only. Source URLs,
note bodies, evidence excerpts, extracted payloads, booking references, and storage keys are never
logged.

## Feature rollout and legacy Ideas

Research replaces Ideas only when the Research feature is enabled for a trip. Disabled trips keep
the existing `/ideas` route and behavior. Enabled trips use `/research`; the old Ideas navigation is
hidden so a legacy record cannot appear in both places.

The client build reads `VITE_RESEARCH_ALPHA_ENABLED` and a comma-separated
`VITE_RESEARCH_ALPHA_TRIP_IDS`. `*` is permitted for local and staging validation; production uses
explicit trip UUIDs. Missing variables fail closed to Ideas. The production GitHub environment owns
these values so a deployment is reproducible from its merge SHA.

The backfill is dry-run by default and reports what it would create. `--apply` maps each unscheduled
legacy Plan to a `shortlisted` Research item and adds a provenance link back to the original Plan.
It never modifies or deletes that Plan. A uniqueness guard makes repeated dry runs and applies safe.

Native API v1 remains frozen. Canonical timezone, place, and price fields are stripped from v1
responses and rejected by v1 plan inputs, so web enrichment does not change the native schema.

## Release definition of done

- Migrations apply from an empty database and upgrade the prior schema without data loss.
- Contract fixtures round-trip ambiguous dates, missing locations, conflicting evidence, duplicate
  options, per-person prices, time zones, and unsupported values without inventing fields.
- Permission, visibility, cross-trip isolation, idempotency replay/conflict, stale revisions,
  concurrent promotion, target deletion, and privacy-purge behavior have automated coverage.
- The enabled web path captures a URL or note in one submission, exposes optional organization only
  after capture, supports state changes and explicit scheduled promotion, and is read-only for
  viewers. The disabled path remains the existing Ideas experience.
- Backfill dry-run, apply, and repeated apply are covered against representative legacy data.
- Repository checks, production build, native compatibility checks, and authenticated browser flows
  pass before rollout. Production stays allowlisted until staging migrations and readback are proven.
- The pull request is mergeable with required checks; deployment is tied to the merge SHA; health,
  schema, feature-off behavior, an allowlisted capture, and idempotent replay are read back after
  deployment.
