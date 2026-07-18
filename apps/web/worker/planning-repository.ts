import type {
  CreateStayInput,
  CreateTravelInput,
  ReservationStatus,
  Stay,
  Travel,
  TravelType,
  UpdateStayInput,
  UpdateTravelInput,
} from "@voyage/contracts";

type TravelRow = {
  id: string;
  trip_id: string;
  type: TravelType;
  status: ReservationStatus;
  departure_location: string;
  arrival_location: string;
  departure_at: string;
  arrival_at: string | null;
  carrier: string | null;
  reference_number: string | null;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type StayRow = {
  id: string;
  trip_id: string;
  status: ReservationStatus;
  property_name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapTravel(row: TravelRow): Travel {
  return {
    id: row.id,
    tripId: row.trip_id,
    type: row.type,
    status: row.status,
    departureLocation: row.departure_location,
    arrivalLocation: row.arrival_location,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    carrier: row.carrier,
    referenceNumber: row.reference_number,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStay(row: StayRow): Stay {
  return {
    id: row.id,
    tripId: row.trip_id,
    status: row.status,
    propertyName: row.property_name,
    address: row.address,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTravel(database: D1Database, tripId: string): Promise<Travel[]> {
  const result = await database
    .prepare("SELECT * FROM travel_segments WHERE trip_id = ? ORDER BY departure_at, created_at")
    .bind(tripId)
    .all<TravelRow>();

  return result.results.map(mapTravel);
}

export async function createTravel(
  database: D1Database,
  tripId: string,
  userId: string,
  input: CreateTravelInput,
): Promise<Travel> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO travel_segments (
        id, trip_id, type, status, departure_location, arrival_location, departure_at, arrival_at,
        carrier, reference_number, confirmation_number, booking_url, notes,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.type,
      input.status,
      input.departureLocation,
      input.arrivalLocation,
      input.departureAt,
      input.arrivalAt,
      input.carrier,
      input.referenceNumber,
      input.confirmationNumber,
      input.bookingUrl,
      input.notes,
      userId,
      now,
      now,
    )
    .run();

  return { id, tripId, ...input, createdAt: now, updatedAt: now };
}

export async function getTravel(
  database: D1Database,
  tripId: string,
  travelId: string,
): Promise<Travel | null> {
  const row = await database
    .prepare("SELECT * FROM travel_segments WHERE id = ? AND trip_id = ?")
    .bind(travelId, tripId)
    .first<TravelRow>();

  return row ? mapTravel(row) : null;
}

export async function updateTravel(
  database: D1Database,
  tripId: string,
  travelId: string,
  input: UpdateTravelInput,
): Promise<Travel | null> {
  const columns: Record<keyof UpdateTravelInput, string> = {
    type: "type",
    status: "status",
    departureLocation: "departure_location",
    arrivalLocation: "arrival_location",
    departureAt: "departure_at",
    arrivalAt: "arrival_at",
    carrier: "carrier",
    referenceNumber: "reference_number",
    confirmationNumber: "confirmation_number",
    bookingUrl: "booking_url",
    notes: "notes",
  };
  const fields = Object.entries(input) as [keyof UpdateTravelInput, unknown][];
  const updatedAt = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE travel_segments
       SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")}, updated_at = ?
       WHERE id = ? AND trip_id = ?`,
    )
    .bind(...fields.map(([, value]) => value), updatedAt, travelId, tripId)
    .run();

  return result.meta.changes === 0 ? null : getTravel(database, tripId, travelId);
}

export async function deleteTravel(
  database: D1Database,
  tripId: string,
  travelId: string,
): Promise<boolean> {
  const result = await database
    .prepare("DELETE FROM travel_segments WHERE id = ? AND trip_id = ?")
    .bind(travelId, tripId)
    .run();

  return result.meta.changes > 0;
}

export async function listStays(database: D1Database, tripId: string): Promise<Stay[]> {
  const result = await database
    .prepare("SELECT * FROM stays WHERE trip_id = ? ORDER BY check_in_date, created_at")
    .bind(tripId)
    .all<StayRow>();

  return result.results.map(mapStay);
}

export async function createStay(
  database: D1Database,
  tripId: string,
  userId: string,
  input: CreateStayInput,
): Promise<Stay> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO stays (
        id, trip_id, status, property_name, address, check_in_date, check_out_date,
        confirmation_number, booking_url, notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.status,
      input.propertyName,
      input.address,
      input.checkInDate,
      input.checkOutDate,
      input.confirmationNumber,
      input.bookingUrl,
      input.notes,
      userId,
      now,
      now,
    )
    .run();

  return { id, tripId, ...input, createdAt: now, updatedAt: now };
}

export async function getStay(
  database: D1Database,
  tripId: string,
  stayId: string,
): Promise<Stay | null> {
  const row = await database
    .prepare("SELECT * FROM stays WHERE id = ? AND trip_id = ?")
    .bind(stayId, tripId)
    .first<StayRow>();

  return row ? mapStay(row) : null;
}

export async function updateStay(
  database: D1Database,
  tripId: string,
  stayId: string,
  input: UpdateStayInput,
): Promise<Stay | null> {
  const columns: Record<keyof UpdateStayInput, string> = {
    status: "status",
    propertyName: "property_name",
    address: "address",
    checkInDate: "check_in_date",
    checkOutDate: "check_out_date",
    confirmationNumber: "confirmation_number",
    bookingUrl: "booking_url",
    notes: "notes",
  };
  const fields = Object.entries(input) as [keyof UpdateStayInput, unknown][];
  const updatedAt = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE stays
       SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")}, updated_at = ?
       WHERE id = ? AND trip_id = ?`,
    )
    .bind(...fields.map(([, value]) => value), updatedAt, stayId, tripId)
    .run();

  return result.meta.changes === 0 ? null : getStay(database, tripId, stayId);
}

export async function deleteStay(
  database: D1Database,
  tripId: string,
  stayId: string,
): Promise<boolean> {
  const result = await database
    .prepare("DELETE FROM stays WHERE id = ? AND trip_id = ?")
    .bind(stayId, tripId)
    .run();

  return result.meta.changes > 0;
}
