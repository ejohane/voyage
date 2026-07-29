import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGooglePlacesClient } from "../worker/google-places";

type StayRow = {
  id: string;
  property_name: string;
  address: string;
};

const webDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

async function localGoogleKey() {
  if (process.env.GOOGLE_MAPS_API_KEY) return process.env.GOOGLE_MAPS_API_KEY;
  const source = await Bun.file(join(webDirectory, ".dev.vars"))
    .text()
    .catch(() => "");
  for (const line of source.split("\n")) {
    const match = line.match(/^\s*GOOGLE_MAPS_API_KEY\s*=\s*(.+?)\s*$/);
    if (!match) continue;
    return match[1].replace(/^['"]|['"]$/g, "");
  }
  return undefined;
}

async function wrangler(arguments_: string[]) {
  const process = Bun.spawn(["bunx", "wrangler", ...arguments_], {
    cwd: webDirectory,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  if (exitCode !== 0) throw new Error(stderr || stdout || `Wrangler exited with ${exitCode}.`);
  return stdout;
}

function sqlValue(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function main() {
  const target = process.argv.includes("--remote") ? "--remote" : "--local";
  const apply = process.argv.includes("--apply");
  const limitArgument = process.argv.find((argument) => argument.startsWith("--limit="));
  const requestedLimit = Number(limitArgument?.slice("--limit=".length) ?? "100");
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 500) : 100;
  const apiKey = await localGoogleKey();
  if (!apiKey) {
    throw new Error("Set GOOGLE_MAPS_API_KEY or configure it in apps/web/.dev.vars.");
  }

  const output = await wrangler([
    "d1",
    "execute",
    "DB",
    target,
    "--command",
    `SELECT id, property_name, address FROM stays WHERE property_place_id IS NULL ORDER BY check_in_date, created_at LIMIT ${limit}`,
    "--json",
  ]);
  const payload = JSON.parse(output) as { results?: StayRow[] }[];
  const stays = payload.flatMap((result) => result.results ?? []);
  const places = createGooglePlacesClient(apiKey);
  const matched: { stay: StayRow; placeId: string }[] = [];
  const unmatched: StayRow[] = [];
  const failed: { stay: StayRow; reason: string }[] = [];

  for (const stay of stays) {
    try {
      const propertyRef = await places.matchStay?.(stay.property_name, stay.address);
      if (propertyRef) matched.push({ stay, placeId: propertyRef.placeId });
      else unmatched.push(stay);
    } catch (error) {
      failed.push({ stay, reason: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        target: target.slice(2),
        scanned: stays.length,
        matched: matched.map(({ stay, placeId }) => ({
          stayId: stay.id,
          propertyName: stay.property_name,
          address: stay.address,
          placeId,
        })),
        unmatched: unmatched.map((stay) => ({
          stayId: stay.id,
          propertyName: stay.property_name,
          address: stay.address,
        })),
        failed: failed.map(({ stay, reason }) => ({
          stayId: stay.id,
          propertyName: stay.property_name,
          reason,
        })),
      },
      null,
      2,
    ),
  );

  if (!apply || matched.length === 0) return;
  const now = new Date().toISOString();
  const sql = matched
    .map(
      ({ stay, placeId }) =>
        `UPDATE stays SET property_place_provider = 'google', property_place_id = ${sqlValue(placeId)}, property_match_method = 'backfill', property_matched_at = ${sqlValue(now)}, updated_at = ${sqlValue(now)} WHERE id = ${sqlValue(stay.id)} AND property_place_id IS NULL;`,
    )
    .join("\n");
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "voyage-stay-backfill-"));
  const sqlPath = join(temporaryDirectory, "backfill.sql");
  try {
    await Bun.write(sqlPath, sql);
    await wrangler(["d1", "execute", "DB", target, "--file", sqlPath]);
    console.log(`Applied ${matched.length} high-confidence stay property matches.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
