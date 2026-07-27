import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const batchSize = 100;

type AirportImport = {
  id: number;
  ident: string;
  iataCode: string;
  icaoCode: string | null;
  type: string;
  name: string;
  municipality: string | null;
  isoCountry: string;
  isoRegion: string | null;
  latitude: number;
  longitude: number;
  keywords: string | null;
  searchText: string;
};

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows;
}

function nullable(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function airportsFromCsv(source: string): AirportImport[] {
  const [headers, ...rows] = parseCsv(source);
  if (!headers) throw new Error("The airport CSV did not contain a header row.");

  const column = new Map(headers.map((header, index) => [header, index]));
  const value = (row: string[], name: string) => row[column.get(name) ?? -1] ?? "";

  return rows.flatMap((row) => {
    const iataCode = value(row, "iata_code").trim().toUpperCase();
    const scheduledService = value(row, "scheduled_service").trim().toLowerCase();
    const id = Number(value(row, "id"));
    const latitude = Number(value(row, "latitude_deg"));
    const longitude = Number(value(row, "longitude_deg"));

    if (
      scheduledService !== "yes" ||
      !iataCode ||
      !Number.isInteger(id) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }

    const ident = value(row, "ident").trim().toUpperCase();
    const icaoCode = nullable(value(row, "icao_code"))?.toUpperCase() ?? null;
    const name = value(row, "name").trim();
    const municipality = nullable(value(row, "municipality"));
    const isoCountry = value(row, "iso_country").trim().toUpperCase();
    const isoRegion = nullable(value(row, "iso_region"))?.toUpperCase() ?? null;
    const keywords = nullable(value(row, "keywords"));
    const searchText = [
      iataCode,
      icaoCode,
      ident,
      name,
      municipality,
      isoCountry,
      isoRegion,
      keywords,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    if (!ident || !name || !isoCountry) return [];

    return [
      {
        id,
        ident,
        iataCode,
        icaoCode,
        type: value(row, "type").trim(),
        name,
        municipality,
        isoCountry,
        isoRegion,
        latitude,
        longitude,
        keywords,
        searchText,
      },
    ];
  });
}

function sqlValue(value: string | number | null) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlForAirports(airports: AirportImport[]) {
  const columns = [
    "id",
    "ident",
    "iata_code",
    "icao_code",
    "type",
    "name",
    "municipality",
    "iso_country",
    "iso_region",
    "latitude",
    "longitude",
    "keywords",
    "search_text",
  ];
  const lines = [
    "DROP TABLE IF EXISTS airport_import;",
    `CREATE TABLE airport_import AS SELECT ${columns.join(", ")} FROM airports WHERE 0;`,
  ];

  for (let index = 0; index < airports.length; index += batchSize) {
    const values = airports
      .slice(index, index + batchSize)
      .map((airport) =>
        [
          airport.id,
          airport.ident,
          airport.iataCode,
          airport.icaoCode,
          airport.type,
          airport.name,
          airport.municipality,
          airport.isoCountry,
          airport.isoRegion,
          airport.latitude,
          airport.longitude,
          airport.keywords,
          airport.searchText,
        ]
          .map(sqlValue)
          .join(", "),
      );
    lines.push(
      `INSERT INTO airport_import (${columns.join(", ")}) VALUES\n${values.map((row) => `  (${row})`).join(",\n")};`,
    );
  }

  lines.push(
    `INSERT INTO airports (${columns.join(", ")})
SELECT ${columns.join(", ")} FROM airport_import WHERE true
ON CONFLICT(id) DO UPDATE SET
  ident = excluded.ident,
  iata_code = excluded.iata_code,
  icao_code = excluded.icao_code,
  type = excluded.type,
  name = excluded.name,
  municipality = excluded.municipality,
  iso_country = excluded.iso_country,
  iso_region = excluded.iso_region,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  keywords = excluded.keywords,
  search_text = excluded.search_text;`,
    "DELETE FROM airports WHERE id NOT IN (SELECT id FROM airport_import);",
    "DROP TABLE airport_import;",
  );

  return lines.join("\n\n");
}

async function main() {
  const target = process.argv.includes("--remote") ? "--remote" : "--local";
  const sourceArgument = process.argv.find((argument) => argument.startsWith("--source="));
  const sourceUrl = sourceArgument?.slice("--source=".length) || AIRPORTS_CSV_URL;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Airport download failed with ${response.status}.`);

  const airports = airportsFromCsv(await response.text());
  if (airports.length < 1_000) {
    throw new Error(`Refusing to import an unexpectedly small catalog (${airports.length} rows).`);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "voyage-airports-"));
  const sqlPath = join(temporaryDirectory, "airports.sql");
  const webDirectory = dirname(dirname(fileURLToPath(import.meta.url)));

  try {
    await Bun.write(sqlPath, sqlForAirports(airports));
    console.log(
      `Importing ${airports.length} scheduled-service airports into ${target.slice(2)} D1…`,
    );
    const process = Bun.spawn(
      ["bunx", "wrangler", "d1", "execute", "DB", target, "--file", sqlPath],
      { cwd: webDirectory, stdout: "pipe", stderr: "inherit" },
    );
    const output = new Response(process.stdout).text();
    const exitCode = await process.exited;
    if (exitCode !== 0) {
      console.error(await output);
      throw new Error(`Wrangler exited with status ${exitCode}.`);
    }
    await output;
    console.log(`Imported ${airports.length} airports from OurAirports.`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
