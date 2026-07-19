import type {
  CreateTripInput,
  Trip,
  TripAccessLevel,
  TripStop,
  UpdateTripInput,
} from "@voyage/contracts";

type TripRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  access_level: TripAccessLevel;
  created_at: string;
  updated_at: string;
};

type TripStopRow = {
  id: string;
  trip_id: string;
  name: string;
  position: number;
  arrival_date: string | null;
  departure_date: string | null;
  place_provider: "google" | null;
  place_id: string | null;
};

function mapTripStop(row: TripStopRow): TripStop {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
    location:
      row.place_provider && row.place_id
        ? { provider: row.place_provider, placeId: row.place_id }
        : null,
  };
}

function mapTrip(row: TripRow, stops: TripStop[]): Trip {
  return {
    id: row.id,
    name: row.name,
    stops,
    startDate: row.start_date,
    endDate: row.end_date,
    accessLevel: row.access_level,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function deriveTripDates(stops: { arrivalDate: string | null; departureDate: string | null }[]) {
  let startDate: string | null = null;
  let endDate: string | null = null;

  for (const stop of stops) {
    if (stop.arrivalDate && (!startDate || stop.arrivalDate < startDate)) {
      startDate = stop.arrivalDate;
    }

    if (stop.departureDate && (!endDate || stop.departureDate > endDate)) {
      endDate = stop.departureDate;
    }
  }

  return { startDate, endDate };
}

const tripSelect = `
  SELECT
    trips.id,
    trips.name,
    trips.start_date,
    trips.end_date,
    trip_memberships.access_level,
    trips.created_at,
    trips.updated_at
  FROM trips
  INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
`;

async function listTripStops(database: D1Database, tripIds: string[]) {
  const stopsByTrip = new Map<string, TripStop[]>();

  if (tripIds.length === 0) return stopsByTrip;

  const result = await database
    .prepare(
      `SELECT
         id, trip_id, name, position, arrival_date, departure_date,
         place_provider, place_id
       FROM trip_stops
       WHERE trip_id IN (${tripIds.map(() => "?").join(", ")})
       ORDER BY trip_id, position`,
    )
    .bind(...tripIds)
    .all<TripStopRow>();

  for (const row of result.results) {
    const stops = stopsByTrip.get(row.trip_id) ?? [];
    stops.push(mapTripStop(row));
    stopsByTrip.set(row.trip_id, stops);
  }

  return stopsByTrip;
}

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
  const stopsByTrip = await listTripStops(
    database,
    result.results.map((trip) => trip.id),
  );

  return result.results.map((trip) => mapTrip(trip, stopsByTrip.get(trip.id) ?? []));
}

export async function createTrip(
  database: D1Database,
  userId: string,
  input: CreateTripInput,
): Promise<Trip> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const stops = input.stops.map((stop, position) => ({
    id: crypto.randomUUID(),
    name: stop.name,
    position,
    arrivalDate: stop.arrivalDate,
    departureDate: stop.departureDate,
    location: stop.location,
  }));
  const { startDate, endDate } = deriveTripDates(stops);

  await database.batch([
    database
      .prepare(
        `INSERT INTO trips (
          id, name, destination, start_date, end_date, created_by_user_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.name, stops[0].name, startDate, endDate, userId, now, now),
    database
      .prepare(
        `INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at)
         VALUES (?, ?, 'owner', ?)`,
      )
      .bind(id, userId, now),
    ...stops.map((stop) =>
      database
        .prepare(
          `INSERT INTO trip_stops (
            id, trip_id, name, position, arrival_date, departure_date,
            place_provider, place_id,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          stop.id,
          id,
          stop.name,
          stop.position,
          stop.arrivalDate,
          stop.departureDate,
          stop.location?.provider ?? null,
          stop.location?.placeId ?? null,
          now,
          now,
        ),
    ),
  ]);

  return {
    id,
    name: input.name,
    stops,
    startDate,
    endDate,
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

  if (!row) return null;

  const stopsByTrip = await listTripStops(database, [tripId]);
  return mapTrip(row, stopsByTrip.get(tripId) ?? []);
}

export async function updateTrip(
  database: D1Database,
  userId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<Trip | null> {
  const existingTrip = await getTrip(database, userId, tripId);

  if (!existingTrip || existingTrip.accessLevel === "viewer") return null;

  const updatedAt = new Date().toISOString();
  const assignments: string[] = [];
  const values: (string | null)[] = [];
  const statements: D1PreparedStatement[] = [];

  if (input.name !== undefined) {
    assignments.push("name = ?");
    values.push(input.name);
  }

  if (input.stops) {
    const { startDate, endDate } = deriveTripDates(input.stops);
    assignments.push("destination = ?", "start_date = ?", "end_date = ?");
    values.push(input.stops[0].name, startDate, endDate);
  }

  assignments.push("updated_at = ?");
  values.push(updatedAt);
  statements.push(
    database
      .prepare(
        `UPDATE trips
         SET ${assignments.join(", ")}
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM trip_memberships
             WHERE trip_id = trips.id
               AND user_id = ?
               AND access_level IN ('owner', 'editor')
           )`,
      )
      .bind(...values, tripId, userId),
  );

  if (input.stops) {
    const existingStopIds = new Set(existingTrip.stops.map((stop) => stop.id));
    const stops = input.stops.map((stop, position) => ({
      id: stop.id ?? crypto.randomUUID(),
      isExisting: stop.id ? existingStopIds.has(stop.id) : false,
      name: stop.name,
      position,
      arrivalDate: stop.arrivalDate,
      departureDate: stop.departureDate,
      location: stop.location,
    }));

    statements.push(
      database
        .prepare("UPDATE trip_stops SET position = position + 1000 WHERE trip_id = ?")
        .bind(tripId),
    );

    for (const stop of stops) {
      statements.push(
        stop.isExisting
          ? database
              .prepare(
                `UPDATE trip_stops
                 SET name = ?, position = ?, arrival_date = ?, departure_date = ?,
                     place_provider = ?, place_id = ?, updated_at = ?
                 WHERE id = ? AND trip_id = ?`,
              )
              .bind(
                stop.name,
                stop.position,
                stop.arrivalDate,
                stop.departureDate,
                stop.location?.provider ?? null,
                stop.location?.placeId ?? null,
                updatedAt,
                stop.id,
                tripId,
              )
          : database
              .prepare(
                `INSERT INTO trip_stops (
                  id, trip_id, name, position, arrival_date, departure_date,
                  place_provider, place_id,
                  created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              )
              .bind(
                stop.id,
                tripId,
                stop.name,
                stop.position,
                stop.arrivalDate,
                stop.departureDate,
                stop.location?.provider ?? null,
                stop.location?.placeId ?? null,
                updatedAt,
                updatedAt,
              ),
      );
    }

    statements.push(
      database
        .prepare(
          `DELETE FROM trip_stops
           WHERE trip_id = ? AND id NOT IN (${stops.map(() => "?").join(", ")})`,
        )
        .bind(tripId, ...stops.map((stop) => stop.id)),
    );
  }

  const results = await database.batch(statements);

  if (results[0].meta.changes === 0) return null;

  return getTrip(database, userId, tripId);
}
