import type { CreateTripInput, Trip, TripAccessLevel, UpdateTripInput } from "@voyage/contracts";

type TripRow = {
  id: string;
  name: string;
  destination: string;
  start_date: string | null;
  end_date: string | null;
  access_level: TripAccessLevel;
  created_at: string;
  updated_at: string;
};

function mapTrip(row: TripRow): Trip {
  return {
    id: row.id,
    name: row.name,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    accessLevel: row.access_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const tripSelect = `
  SELECT
    trips.id,
    trips.name,
    trips.destination,
    trips.start_date,
    trips.end_date,
    trip_memberships.access_level,
    trips.created_at,
    trips.updated_at
  FROM trips
  INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
`;

export async function listTrips(database: D1Database, userId: string): Promise<Trip[]> {
  const result = await database
    .prepare(`${tripSelect}
      WHERE trip_memberships.user_id = ?
      ORDER BY
        CASE WHEN trips.end_date IS NOT NULL AND trips.end_date < date('now') THEN 1 ELSE 0 END,
        CASE WHEN trips.start_date IS NULL THEN 1 ELSE 0 END,
        trips.start_date ASC,
        trips.updated_at DESC
    `)
    .bind(userId)
    .all<TripRow>();

  return result.results.map(mapTrip);
}

export async function createTrip(
  database: D1Database,
  userId: string,
  input: CreateTripInput,
): Promise<Trip> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database.batch([
    database
      .prepare(
        `INSERT INTO trips (
          id, name, destination, start_date, end_date, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, input.destination, input.startDate, input.endDate, userId, now, now),
    database
      .prepare(
        `INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at)
         VALUES (?, ?, 'owner', ?)`,
      )
      .bind(id, userId, now),
  ]);

  return {
    id,
    ...input,
    accessLevel: "owner",
    createdAt: now,
    updatedAt: now,
  };
}

export async function getTrip(
  database: D1Database,
  userId: string,
  tripId: string,
): Promise<Trip | null> {
  const row = await database
    .prepare(`${tripSelect}
      WHERE trips.id = ? AND trip_memberships.user_id = ?
    `)
    .bind(tripId, userId)
    .first<TripRow>();

  return row ? mapTrip(row) : null;
}

export async function updateTrip(
  database: D1Database,
  userId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<Trip | null> {
  const fieldColumns: Record<keyof UpdateTripInput, string> = {
    name: "name",
    destination: "destination",
    startDate: "start_date",
    endDate: "end_date",
  };
  const fields = Object.entries(input) as [keyof UpdateTripInput, string | null][];
  const assignments = fields.map(([field]) => `${fieldColumns[field]} = ?`);
  const values = fields.map(([, value]) => value);
  const updatedAt = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE trips
       SET ${assignments.join(", ")}, updated_at = ?
       WHERE id = ?
         AND EXISTS (
           SELECT 1 FROM trip_memberships
           WHERE trip_id = trips.id
             AND user_id = ?
             AND access_level IN ('owner', 'editor')
         )`,
    )
    .bind(...values, updatedAt, tripId, userId)
    .run();

  if (result.meta.changes === 0) {
    return null;
  }

  return getTrip(database, userId, tripId);
}
