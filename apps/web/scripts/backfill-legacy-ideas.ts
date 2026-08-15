import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { legacyIdeasSelect } from "../worker/research-backfill";

type LegacyIdea = {
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

type Quote = {
  amount: string;
  currency: string;
  unit: string;
  displayText: string;
};

const webDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

async function wrangler(arguments_: string[]) {
  const child = Bun.spawn(["bunx", "wrangler", ...arguments_], {
    cwd: webDirectory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout || `Wrangler exited with ${exitCode}.`);
  return stdout;
}

function sqlValue(value: string | null) {
  return value === null ? "NULL" : `'${value.replaceAll("'", "''")}'`;
}

function mappedCategory(category: LegacyIdea["category"]) {
  if (category === "food") return "food";
  if (category === "sightseeing") return "place";
  if (category === "activity" || category === "event") return "activity";
  return "other";
}

async function sha256(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function statementsForIdea(row: LegacyIdea) {
  const researchItemId = crypto.randomUUID();
  const mutationToken = crypto.randomUUID();
  const now = new Date().toISOString();
  const reviewedPayload = { migration: "legacy_ideas_v1", legacyPlanId: row.id };
  const reviewedPayloadJson = JSON.stringify(reviewedPayload);
  const reviewedPayloadHash = await sha256(reviewedPayload);
  const quotes = JSON.parse(row.price_quotes_json ?? "[]") as Quote[];
  const statements = [
    `INSERT INTO research_items (
       id, trip_id, title, body, state, category, trip_stop_id, place_provider, place_id,
       attribution, legacy_plan_id, created_by_user_id, revision, mutation_token, created_at, updated_at
     )
     SELECT ${sqlValue(researchItemId)}, ${sqlValue(row.trip_id)}, ${sqlValue(row.title)},
       ${sqlValue(row.notes)}, 'shortlisted', ${sqlValue(mappedCategory(row.category))},
       ${sqlValue(row.trip_stop_id)}, ${sqlValue(row.place_provider)}, ${sqlValue(row.place_id)},
       ${sqlValue(row.location)}, ${sqlValue(row.id)}, ${sqlValue(row.created_by_user_id)}, 1,
       ${sqlValue(mutationToken)}, ${sqlValue(row.created_at)}, ${sqlValue(row.updated_at)}
     WHERE NOT EXISTS (SELECT 1 FROM research_items WHERE legacy_plan_id = ${sqlValue(row.id)});`,
  ];
  for (const [position, quote] of quotes.entries()) {
    statements.push(
      `INSERT INTO research_item_price_quotes (
         id, research_item_id, position, amount, currency, unit, display_text, created_at
       )
       SELECT ${sqlValue(crypto.randomUUID())}, ${sqlValue(researchItemId)}, ${position},
         ${sqlValue(quote.amount)}, ${sqlValue(quote.currency)}, ${sqlValue(quote.unit)},
         ${sqlValue(quote.displayText)}, ${sqlValue(now)}
       WHERE EXISTS (SELECT 1 FROM research_items WHERE id = ${sqlValue(researchItemId)});`,
    );
  }
  statements.push(
    `INSERT INTO promotion_links (
       id, trip_id, source_kind, source_id, target_kind, target_id, reviewed_payload_json,
       reviewed_payload_hash, idempotency_key, promoted_by_user_id, promoted_at
     )
     SELECT ${sqlValue(crypto.randomUUID())}, ${sqlValue(row.trip_id)}, 'research',
       ${sqlValue(researchItemId)}, 'plan', ${sqlValue(row.id)}, ${sqlValue(reviewedPayloadJson)},
       ${sqlValue(reviewedPayloadHash)}, ${sqlValue(`legacy-ideas-v1:${row.id}`)},
       ${sqlValue(row.created_by_user_id)}, ${sqlValue(now)}
     WHERE EXISTS (SELECT 1 FROM research_items WHERE id = ${sqlValue(researchItemId)});`,
  );
  return statements;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const remote = process.argv.includes("--remote");
  const environmentArgument = process.argv.find((argument) => argument.startsWith("--env="));
  const environment = environmentArgument?.slice("--env=".length);
  const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
  const requestedLimit = Number(limitArgument?.slice("--limit=".length) ?? "500");
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 5_000)
    : 500;
  const targetArguments = [remote ? "--remote" : "--local"];
  if (environment) targetArguments.push("--env", environment);
  const query = legacyIdeasSelect.replace("LIMIT ?", `LIMIT ${limit}`);
  const output = await wrangler([
    "d1",
    "execute",
    "DB",
    ...targetArguments,
    "--command",
    query,
    "--json",
  ]);
  const payload = JSON.parse(output) as { results?: LegacyIdea[] }[];
  const rows = payload.flatMap((result) => result.results ?? []);
  const eligible = rows.filter((row) => !row.research_item_id);
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        target: environment ?? (remote ? "production" : "local"),
        scanned: rows.length,
        eligible: eligible.length,
        alreadyBackfilled: rows.length - eligible.length,
        planIds: eligible.map((row) => row.id),
      },
      null,
      2,
    ),
  );
  if (!apply || eligible.length === 0) return;

  const statements = (await Promise.all(eligible.map(statementsForIdea))).flat().join("\n");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "voyage-ideas-backfill-"));
  const sqlPath = join(temporaryDirectory, "backfill.sql");
  try {
    await Bun.write(sqlPath, statements);
    await wrangler(["d1", "execute", "DB", ...targetArguments, "--file", sqlPath]);
    console.log(`Applied the legacy Ideas backfill for up to ${eligible.length} plans.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
