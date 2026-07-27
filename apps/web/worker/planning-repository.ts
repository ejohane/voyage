import type {
  Airport,
  CreatePlanInput,
  CreateStayInput,
  CreateTravelInput,
  PlanCategory,
  PlanStatus,
  ReservationStatus,
  Stay,
  TransportationKind,
  Travel,
  TravelType,
  TripPlan,
  UpdatePlanInput,
  UpdateStayInput,
  UpdateTravelInput,
} from "@voyage/contracts";

type TravelRow = {
  id: string;
  trip_id: string;
  kind: TransportationKind;
  type: TravelType;
  status: ReservationStatus;
  departure_stop_id: string | null;
  arrival_stop_id: string | null;
  departure_airport_id: number | null;
  arrival_airport_id: number | null;
  departure_location: string;
  arrival_location: string;
  departure_at: string;
  arrival_at: string | null;
  carrier: string | null;
  reference_number: string | null;
  vehicle_description: string | null;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  departure_airport_catalog_id: number | null;
  departure_airport_ident: string | null;
  departure_airport_iata_code: string | null;
  departure_airport_icao_code: string | null;
  departure_airport_type: string | null;
  departure_airport_name: string | null;
  departure_airport_municipality: string | null;
  departure_airport_iso_country: string | null;
  departure_airport_iso_region: string | null;
  departure_airport_latitude: number | null;
  departure_airport_longitude: number | null;
  arrival_airport_catalog_id: number | null;
  arrival_airport_ident: string | null;
  arrival_airport_iata_code: string | null;
  arrival_airport_icao_code: string | null;
  arrival_airport_type: string | null;
  arrival_airport_name: string | null;
  arrival_airport_municipality: string | null;
  arrival_airport_iso_country: string | null;
  arrival_airport_iso_region: string | null;
  arrival_airport_latitude: number | null;
  arrival_airport_longitude: number | null;
};

type StayRow = {
  id: string;
  trip_id: string;
  status: ReservationStatus;
  trip_stop_id: string | null;
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

type PlanRow = {
  id: string;
  trip_id: string;
  trip_stop_id: string;
  title: string;
  category: PlanCategory;
  status: PlanStatus;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function mapJoinedAirport(row: TravelRow, prefix: "departure" | "arrival"): Airport | null {
  const id = row[`${prefix}_airport_catalog_id`];
  const ident = row[`${prefix}_airport_ident`];
  const iataCode = row[`${prefix}_airport_iata_code`];
  const type = row[`${prefix}_airport_type`];
  const name = row[`${prefix}_airport_name`];
  const isoCountry = row[`${prefix}_airport_iso_country`];
  const latitude = row[`${prefix}_airport_latitude`];
  const longitude = row[`${prefix}_airport_longitude`];

  if (
    id === null ||
    ident === null ||
    iataCode === null ||
    type === null ||
    name === null ||
    isoCountry === null ||
    latitude === null ||
    longitude === null
  ) {
    return null;
  }

  return {
    id,
    ident,
    iataCode,
    icaoCode: row[`${prefix}_airport_icao_code`],
    type,
    name,
    municipality: row[`${prefix}_airport_municipality`],
    isoCountry,
    isoRegion: row[`${prefix}_airport_iso_region`],
    latitude,
    longitude,
  };
}

function mapTravel(row: TravelRow): Travel {
  return {
    id: row.id,
    tripId: row.trip_id,
    kind: row.kind,
    type: row.type,
    status: row.status,
    departureStopId: row.departure_stop_id,
    arrivalStopId: row.arrival_stop_id,
    departureAirportId: row.departure_airport_id,
    arrivalAirportId: row.arrival_airport_id,
    departureAirport: mapJoinedAirport(row, "departure"),
    arrivalAirport: mapJoinedAirport(row, "arrival"),
    departureLocation: row.departure_location,
    arrivalLocation: row.arrival_location,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    carrier: row.carrier,
    referenceNumber: row.reference_number,
    vehicleDescription: row.vehicle_description,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const travelSelect = `SELECT
  travel_segments.*,
  departure_airport.id AS departure_airport_catalog_id,
  departure_airport.ident AS departure_airport_ident,
  departure_airport.iata_code AS departure_airport_iata_code,
  departure_airport.icao_code AS departure_airport_icao_code,
  departure_airport.type AS departure_airport_type,
  departure_airport.name AS departure_airport_name,
  departure_airport.municipality AS departure_airport_municipality,
  departure_airport.iso_country AS departure_airport_iso_country,
  departure_airport.iso_region AS departure_airport_iso_region,
  departure_airport.latitude AS departure_airport_latitude,
  departure_airport.longitude AS departure_airport_longitude,
  arrival_airport.id AS arrival_airport_catalog_id,
  arrival_airport.ident AS arrival_airport_ident,
  arrival_airport.iata_code AS arrival_airport_iata_code,
  arrival_airport.icao_code AS arrival_airport_icao_code,
  arrival_airport.type AS arrival_airport_type,
  arrival_airport.name AS arrival_airport_name,
  arrival_airport.municipality AS arrival_airport_municipality,
  arrival_airport.iso_country AS arrival_airport_iso_country,
  arrival_airport.iso_region AS arrival_airport_iso_region,
  arrival_airport.latitude AS arrival_airport_latitude,
  arrival_airport.longitude AS arrival_airport_longitude
FROM travel_segments
LEFT JOIN airports AS departure_airport ON departure_airport.id = travel_segments.departure_airport_id
LEFT JOIN airports AS arrival_airport ON arrival_airport.id = travel_segments.arrival_airport_id`;

function mapStay(row: StayRow): Stay {
  return {
    id: row.id,
    tripId: row.trip_id,
    status: row.status,
    tripStopId: row.trip_stop_id,
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

function mapPlan(row: PlanRow): TripPlan {
  return {
    id: row.id,
    tripId: row.trip_id,
    tripStopId: row.trip_stop_id,
    title: row.title,
    category: row.category,
    status: row.status,
    scheduledDate: row.scheduled_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTravel(database: D1Database, tripId: string): Promise<Travel[]> {
  const result = await database
    .prepare(`${travelSelect} WHERE trip_id = ? ORDER BY departure_at, created_at`)
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
        id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
        departure_airport_id, arrival_airport_id, departure_location, arrival_location, departure_at, arrival_at,
        carrier, reference_number, vehicle_description, confirmation_number, booking_url, notes,
        created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.kind,
      input.type,
      input.status,
      input.departureStopId,
      input.arrivalStopId,
      input.departureAirportId ?? null,
      input.arrivalAirportId ?? null,
      input.departureLocation,
      input.arrivalLocation,
      input.departureAt,
      input.arrivalAt,
      input.carrier,
      input.referenceNumber,
      input.vehicleDescription,
      input.confirmationNumber,
      input.bookingUrl,
      input.notes,
      userId,
      now,
      now,
    )
    .run();

  const travel = await getTravel(database, tripId, id);
  if (!travel) throw new Error("Created travel item could not be loaded.");
  return travel;
}

export async function getTravel(
  database: D1Database,
  tripId: string,
  travelId: string,
): Promise<Travel | null> {
  const row = await database
    .prepare(`${travelSelect} WHERE travel_segments.id = ? AND trip_id = ?`)
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
    kind: "kind",
    type: "type",
    status: "status",
    departureStopId: "departure_stop_id",
    arrivalStopId: "arrival_stop_id",
    departureAirportId: "departure_airport_id",
    arrivalAirportId: "arrival_airport_id",
    departureLocation: "departure_location",
    arrivalLocation: "arrival_location",
    departureAt: "departure_at",
    arrivalAt: "arrival_at",
    carrier: "carrier",
    referenceNumber: "reference_number",
    vehicleDescription: "vehicle_description",
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
        id, trip_id, status, trip_stop_id, property_name, address, check_in_date, check_out_date,
        confirmation_number, booking_url, notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.status,
      input.tripStopId,
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
    tripStopId: "trip_stop_id",
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

export async function listPlans(database: D1Database, tripId: string): Promise<TripPlan[]> {
  const result = await database
    .prepare(
      `SELECT * FROM trip_plans
       WHERE trip_id = ?
       ORDER BY
         CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END,
         scheduled_date,
         CASE WHEN start_time IS NULL THEN 1 ELSE 0 END,
         start_time,
         created_at`,
    )
    .bind(tripId)
    .all<PlanRow>();

  return result.results.map(mapPlan);
}

export async function createPlan(
  database: D1Database,
  tripId: string,
  userId: string,
  input: CreatePlanInput,
): Promise<TripPlan> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await database
    .prepare(
      `INSERT INTO trip_plans (
        id, trip_id, trip_stop_id, title, category, status, scheduled_date, start_time, end_time,
        location, confirmation_number, booking_url, notes, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      tripId,
      input.tripStopId,
      input.title,
      input.category,
      input.status,
      input.scheduledDate,
      input.startTime,
      input.endTime,
      input.location,
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

export async function getPlan(
  database: D1Database,
  tripId: string,
  planId: string,
): Promise<TripPlan | null> {
  const row = await database
    .prepare("SELECT * FROM trip_plans WHERE id = ? AND trip_id = ?")
    .bind(planId, tripId)
    .first<PlanRow>();

  return row ? mapPlan(row) : null;
}

export async function updatePlan(
  database: D1Database,
  tripId: string,
  planId: string,
  input: UpdatePlanInput,
): Promise<TripPlan | null> {
  const columns: Record<keyof UpdatePlanInput, string> = {
    tripStopId: "trip_stop_id",
    title: "title",
    category: "category",
    status: "status",
    scheduledDate: "scheduled_date",
    startTime: "start_time",
    endTime: "end_time",
    location: "location",
    confirmationNumber: "confirmation_number",
    bookingUrl: "booking_url",
    notes: "notes",
  };
  const fields = Object.entries(input) as [keyof UpdatePlanInput, unknown][];
  const updatedAt = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE trip_plans
       SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")}, updated_at = ?
       WHERE id = ? AND trip_id = ?`,
    )
    .bind(...fields.map(([, value]) => value), updatedAt, planId, tripId)
    .run();

  return result.meta.changes === 0 ? null : getPlan(database, tripId, planId);
}

export async function deletePlan(
  database: D1Database,
  tripId: string,
  planId: string,
): Promise<boolean> {
  const result = await database
    .prepare("DELETE FROM trip_plans WHERE id = ? AND trip_id = ?")
    .bind(planId, tripId)
    .run();

  return result.meta.changes > 0;
}
