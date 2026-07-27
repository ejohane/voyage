import type { Airport } from "@voyage/contracts";

export type AirportRow = {
  id: number;
  ident: string;
  iata_code: string;
  icao_code: string | null;
  type: string;
  name: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string | null;
  latitude: number;
  longitude: number;
};

export function mapAirport(row: AirportRow): Airport {
  return {
    id: row.id,
    ident: row.ident,
    iataCode: row.iata_code,
    icaoCode: row.icao_code,
    type: row.type,
    name: row.name,
    municipality: row.municipality,
    isoCountry: row.iso_country,
    isoRegion: row.iso_region,
    latitude: row.latitude,
    longitude: row.longitude,
  };
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function searchAirports(database: D1Database, rawQuery: string): Promise<Airport[]> {
  const query = rawQuery.trim().toLowerCase();
  const escaped = escapeLike(query);
  const prefix = `${escaped}%`;
  const contains = `%${escaped}%`;
  const result = await database
    .prepare(
      `SELECT id, ident, iata_code, icao_code, type, name, municipality, iso_country, iso_region,
              latitude, longitude
       FROM airports
       WHERE lower(iata_code) LIKE ? ESCAPE '\\'
          OR lower(icao_code) LIKE ? ESCAPE '\\'
          OR search_text LIKE ? ESCAPE '\\'
       ORDER BY
         CASE
           WHEN lower(iata_code) = ? THEN 0
           WHEN lower(icao_code) = ? OR lower(ident) = ? THEN 1
           WHEN lower(iata_code) LIKE ? ESCAPE '\\' THEN 2
           WHEN lower(municipality) LIKE ? ESCAPE '\\' THEN 3
           WHEN lower(name) LIKE ? ESCAPE '\\' THEN 4
           ELSE 5
         END,
         iata_code,
         name
       LIMIT 10`,
    )
    .bind(contains, contains, contains, query, query, query, prefix, prefix, prefix)
    .all<AirportRow>();

  return result.results.map(mapAirport);
}

export async function airportsExist(database: D1Database, ids: Array<number | null | undefined>) {
  const uniqueIds = [...new Set(ids.filter((id): id is number => id !== null && id !== undefined))];
  if (uniqueIds.length === 0) return true;

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const row = await database
    .prepare(`SELECT count(*) AS count FROM airports WHERE id IN (${placeholders})`)
    .bind(...uniqueIds)
    .first<{ count: number }>();

  return row?.count === uniqueIds.length;
}
