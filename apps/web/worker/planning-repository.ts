import type {
  Airport,
  CreatePlanInput,
  CreateStayInput,
  CreateTravelInput,
  PlanCategory,
  PlanStatus,
  ReservationStatus,
  Stay,
  StayAmenity,
  TransportationKind,
  Travel,
  TravelType,
  TripPlan,
  UpdatePlanInput,
  UpdateStayInput,
  UpdateTravelInput,
  V1ScheduledPlan,
} from "@voyage/contracts";
import { stayAmenitySchema, v1ScheduledPlanSchema } from "@voyage/contracts";

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
  property_place_provider: "google" | null;
  property_place_id: string | null;
  created_at: string;
  updated_at: string;
  details_stay_id: string | null;
  details_check_in_window: string | null;
  details_check_out_window: string | null;
  details_room_type: string | null;
  details_guest_summary: string | null;
  details_meal_plan: string | null;
  details_cancellation_summary: string | null;
  details_cancellation_deadline: string | null;
  details_total_price_text: string | null;
  details_amenities_json: string | null;
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
  revision: number;
  created_at: string;
  updated_at: string;
};

type IdempotencyRecordRow = {
  request_hash: string;
  response_json: string | null;
  resource_deleted_at: string | null;
};

export const v1PlanCreateIdempotencyRetentionMilliseconds = 7 * 24 * 60 * 60 * 1_000;

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
  let amenities: StayAmenity[] = [];
  try {
    const parsed = JSON.parse(row.details_amenities_json ?? "[]");
    if (Array.isArray(parsed)) {
      amenities = parsed.flatMap((value): StayAmenity[] => {
        const amenity = stayAmenitySchema.safeParse(value);
        return amenity.success ? [amenity.data] : [];
      });
    }
  } catch {
    amenities = [];
  }

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
    propertyRef:
      row.property_place_provider === "google" && row.property_place_id
        ? { provider: "google", placeId: row.property_place_id }
        : null,
    bookingDetails: row.details_stay_id
      ? {
          checkInWindow: row.details_check_in_window,
          checkOutWindow: row.details_check_out_window,
          roomType: row.details_room_type,
          guestSummary: row.details_guest_summary,
          mealPlan: row.details_meal_plan,
          cancellationSummary: row.details_cancellation_summary,
          cancellationDeadline: row.details_cancellation_deadline,
          totalPriceText: row.details_total_price_text,
          amenities,
        }
      : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const staySelect = `SELECT
  stays.*,
  stay_booking_details.stay_id AS details_stay_id,
  stay_booking_details.check_in_window AS details_check_in_window,
  stay_booking_details.check_out_window AS details_check_out_window,
  stay_booking_details.room_type AS details_room_type,
  stay_booking_details.guest_summary AS details_guest_summary,
  stay_booking_details.meal_plan AS details_meal_plan,
  stay_booking_details.cancellation_summary AS details_cancellation_summary,
  stay_booking_details.cancellation_deadline AS details_cancellation_deadline,
  stay_booking_details.total_price_text AS details_total_price_text,
  stay_booking_details.amenities_json AS details_amenities_json
FROM stays
LEFT JOIN stay_booking_details ON stay_booking_details.stay_id = stays.id`;

function bookingDetailsStatement(
  database: D1Database,
  stayId: string,
  details: NonNullable<CreateStayInput["bookingDetails"]>,
  now: string,
) {
  return database
    .prepare(
      `INSERT INTO stay_booking_details (
        stay_id, check_in_window, check_out_window, room_type, guest_summary, meal_plan,
        cancellation_summary, cancellation_deadline, total_price_text, amenities_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stay_id) DO UPDATE SET
        check_in_window = excluded.check_in_window,
        check_out_window = excluded.check_out_window,
        room_type = excluded.room_type,
        guest_summary = excluded.guest_summary,
        meal_plan = excluded.meal_plan,
        cancellation_summary = excluded.cancellation_summary,
        cancellation_deadline = excluded.cancellation_deadline,
        total_price_text = excluded.total_price_text,
        amenities_json = excluded.amenities_json,
        updated_at = excluded.updated_at`,
    )
    .bind(
      stayId,
      details.checkInWindow,
      details.checkOutWindow,
      details.roomType,
      details.guestSummary,
      details.mealPlan,
      details.cancellationSummary,
      details.cancellationDeadline,
      details.totalPriceText,
      JSON.stringify(details.amenities),
      now,
      now,
    );
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

function mapV1ScheduledPlan(row: PlanRow): V1ScheduledPlan {
  return v1ScheduledPlanSchema.parse({ ...mapPlan(row), revision: row.revision });
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
    .prepare(`${staySelect} WHERE stays.trip_id = ? ORDER BY stays.check_in_date, stays.created_at`)
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

  const statements = [
    database
      .prepare(
        `INSERT INTO stays (
        id, trip_id, status, trip_stop_id, property_name, address, check_in_date, check_out_date,
        confirmation_number, booking_url, notes, property_place_provider, property_place_id,
        property_match_method, property_matched_at, created_by_user_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.propertyRef?.provider ?? null,
        input.propertyRef?.placeId ?? null,
        input.propertyRef ? "user" : null,
        input.propertyRef ? now : null,
        userId,
        now,
        now,
      ),
  ];
  if (input.bookingDetails) {
    statements.push(bookingDetailsStatement(database, id, input.bookingDetails, now));
  }
  await database.batch(statements);

  const created = await getStay(database, tripId, id);
  if (!created) throw new Error("Created stay could not be read.");
  return created;
}

export async function getStay(
  database: D1Database,
  tripId: string,
  stayId: string,
): Promise<Stay | null> {
  const row = await database
    .prepare(`${staySelect} WHERE stays.id = ? AND stays.trip_id = ?`)
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
    propertyRef: "property_ref",
    bookingDetails: "booking_details",
  };
  const fields = (Object.entries(input) as [keyof UpdateStayInput, unknown][]).filter(
    ([field]) => field !== "propertyRef" && field !== "bookingDetails",
  );
  const updatedAt = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  if (fields.length) {
    statements.push(
      database
        .prepare(
          `UPDATE stays
           SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")}, updated_at = ?
           WHERE id = ? AND trip_id = ?`,
        )
        .bind(...fields.map(([, value]) => value), updatedAt, stayId, tripId),
    );
  }
  if (input.propertyRef !== undefined) {
    statements.push(
      database
        .prepare(
          `UPDATE stays SET property_place_provider = ?, property_place_id = ?,
           property_match_method = ?, property_matched_at = ?, updated_at = ?
           WHERE id = ? AND trip_id = ?`,
        )
        .bind(
          input.propertyRef?.provider ?? null,
          input.propertyRef?.placeId ?? null,
          input.propertyRef ? "user" : null,
          input.propertyRef ? updatedAt : null,
          updatedAt,
          stayId,
          tripId,
        ),
    );
  }
  if (input.bookingDetails !== undefined) {
    statements.push(
      input.bookingDetails
        ? bookingDetailsStatement(database, stayId, input.bookingDetails, updatedAt)
        : database.prepare("DELETE FROM stay_booking_details WHERE stay_id = ?").bind(stayId),
    );
  }
  if (!statements.length) return getStay(database, tripId, stayId);
  await database.batch(statements);
  return getStay(database, tripId, stayId);
}

export async function applyStayPropertyMatch(
  database: D1Database,
  tripId: string,
  stayId: string,
  placeId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await database
    .prepare(
      `UPDATE stays SET property_place_provider = 'google', property_place_id = ?,
       property_match_method = 'backfill', property_matched_at = ?, updated_at = ?
       WHERE id = ? AND trip_id = ? AND property_place_id IS NULL`,
    )
    .bind(placeId, now, now, stayId, tripId)
    .run();
  return result.meta.changes > 0;
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

export async function listV1ScheduledPlans(
  database: D1Database,
  tripId: string,
): Promise<V1ScheduledPlan[]> {
  const result = await database
    .prepare(
      `SELECT * FROM trip_plans
       WHERE trip_id = ? AND scheduled_date IS NOT NULL AND status IN ('planned', 'booked')
       ORDER BY scheduled_date,
         CASE WHEN start_time IS NULL THEN 1 ELSE 0 END,
         start_time,
         title,
         created_at`,
    )
    .bind(tripId)
    .all<PlanRow>();

  return result.results.map(mapV1ScheduledPlan);
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

function idempotencyExpiry(createdAt: Date) {
  return new Date(createdAt.getTime() + v1PlanCreateIdempotencyRetentionMilliseconds).toISOString();
}

export async function deleteExpiredV1IdempotencyRecords(
  database: D1Database,
  currentTime = new Date(),
) {
  const result = await database
    .prepare("DELETE FROM api_idempotency_records WHERE expires_at <= ?")
    .bind(currentTime.toISOString())
    .run();

  return result.meta.changes;
}

async function getIdempotencyRecord(
  database: D1Database,
  userId: string,
  idempotencyKey: string,
  currentTime: Date,
) {
  return database
    .prepare(
      `SELECT request_hash, response_json, resource_deleted_at
       FROM api_idempotency_records
       WHERE user_id = ? AND operation = 'create_plan' AND idempotency_key = ?
         AND expires_at > ?`,
    )
    .bind(userId, idempotencyKey, currentTime.toISOString())
    .first<IdempotencyRecordRow>();
}

function replayedCreateResult(record: IdempotencyRecordRow, requestHash: string) {
  if (record.request_hash !== requestHash) return { kind: "conflict" as const };
  if (record.resource_deleted_at || !record.response_json) return { kind: "conflict" as const };

  return {
    kind: "replayed" as const,
    plan: v1ScheduledPlanSchema.parse(JSON.parse(record.response_json)),
  };
}

export type IdempotentPlanCreateResult =
  | { kind: "created" | "replayed"; plan: V1ScheduledPlan }
  | { kind: "conflict" };

export async function createV1ScheduledPlanIdempotently(
  database: D1Database,
  tripId: string,
  userId: string,
  idempotencyKey: string,
  requestHash: string,
  input: CreatePlanInput,
): Promise<IdempotentPlanCreateResult> {
  const createdAt = new Date();
  await deleteExpiredV1IdempotencyRecords(database, createdAt);

  const existingRecord = await getIdempotencyRecord(database, userId, idempotencyKey, createdAt);
  if (existingRecord) return replayedCreateResult(existingRecord, requestHash);

  const id = crypto.randomUUID();
  const now = createdAt.toISOString();
  const expiresAt = idempotencyExpiry(createdAt);
  const plan = v1ScheduledPlanSchema.parse({
    id,
    tripId,
    ...input,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  });

  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO trip_plans (
            id, trip_id, trip_stop_id, title, category, status, scheduled_date, start_time,
            end_time, location, confirmation_number, booking_url, notes, created_by_user_id,
            revision, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
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
        ),
      database
        .prepare(
          `INSERT INTO api_idempotency_records (
            user_id, operation, idempotency_key, request_hash, trip_id, resource_id,
            response_json, resource_deleted_at, created_at, expires_at
          ) VALUES (?, 'create_plan', ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          userId,
          idempotencyKey,
          requestHash,
          tripId,
          id,
          JSON.stringify(plan),
          now,
          expiresAt,
        ),
    ]);

    return { kind: "created", plan };
  } catch (error) {
    const concurrentRecord = await getIdempotencyRecord(
      database,
      userId,
      idempotencyKey,
      createdAt,
    );
    if (concurrentRecord) return replayedCreateResult(concurrentRecord, requestHash);
    throw error;
  }
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

export async function getV1ScheduledPlan(
  database: D1Database,
  tripId: string,
  planId: string,
): Promise<V1ScheduledPlan | null> {
  const row = await database
    .prepare(
      `SELECT * FROM trip_plans
       WHERE id = ? AND trip_id = ? AND scheduled_date IS NOT NULL
         AND status IN ('planned', 'booked')`,
    )
    .bind(planId, tripId)
    .first<PlanRow>();

  return row ? mapV1ScheduledPlan(row) : null;
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
       SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")},
           revision = revision + 1, updated_at = ?
       WHERE id = ? AND trip_id = ?`,
    )
    .bind(...fields.map(([, value]) => value), updatedAt, planId, tripId)
    .run();

  return result.meta.changes === 0 ? null : getPlan(database, tripId, planId);
}

export type RevisionProtectedPlanMutationResult =
  | { kind: "updated"; plan: V1ScheduledPlan }
  | { kind: "deleted" }
  | { kind: "conflict"; currentRevision: number }
  | { kind: "not_found" };

export async function updateV1ScheduledPlanIfRevision(
  database: D1Database,
  tripId: string,
  planId: string,
  expectedRevision: number,
  input: UpdatePlanInput,
): Promise<RevisionProtectedPlanMutationResult> {
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
  const updated = await database
    .prepare(
      `UPDATE trip_plans
       SET ${fields.map(([field]) => `${columns[field]} = ?`).join(", ")},
           revision = revision + 1, updated_at = ?
       WHERE id = ? AND trip_id = ? AND revision = ?
         AND scheduled_date IS NOT NULL AND status IN ('planned', 'booked')
       RETURNING *`,
    )
    .bind(...fields.map(([, value]) => value), updatedAt, planId, tripId, expectedRevision)
    .first<PlanRow>();

  if (updated) return { kind: "updated", plan: mapV1ScheduledPlan(updated) };

  const current = await getV1ScheduledPlan(database, tripId, planId);
  return current ? { kind: "conflict", currentRevision: current.revision } : { kind: "not_found" };
}

export async function deleteV1ScheduledPlanIfRevision(
  database: D1Database,
  tripId: string,
  planId: string,
  expectedRevision: number,
): Promise<RevisionProtectedPlanMutationResult> {
  const deletedAt = new Date().toISOString();
  const [deletion] = await database.batch<{ revision: number }>([
    database
      .prepare(
        `DELETE FROM trip_plans
         WHERE id = ? AND trip_id = ? AND revision = ?
           AND scheduled_date IS NOT NULL AND status IN ('planned', 'booked')
         RETURNING revision`,
      )
      .bind(planId, tripId, expectedRevision),
    database
      .prepare(
        `UPDATE api_idempotency_records
         SET response_json = NULL, resource_deleted_at = ?
         WHERE trip_id = ? AND resource_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trip_plans WHERE id = ? AND trip_id = ?
           )`,
      )
      .bind(deletedAt, tripId, planId, planId, tripId),
  ]);
  const deleted = deletion.results[0];

  if (deleted) return { kind: "deleted" };

  const current = await getV1ScheduledPlan(database, tripId, planId);
  return current ? { kind: "conflict", currentRevision: current.revision } : { kind: "not_found" };
}

export async function deletePlan(
  database: D1Database,
  tripId: string,
  planId: string,
): Promise<boolean> {
  const deletedAt = new Date().toISOString();
  const [deletion] = await database.batch<{ id: string }>([
    database
      .prepare("DELETE FROM trip_plans WHERE id = ? AND trip_id = ? RETURNING id")
      .bind(planId, tripId),
    database
      .prepare(
        `UPDATE api_idempotency_records
         SET response_json = NULL, resource_deleted_at = ?
         WHERE trip_id = ? AND resource_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM trip_plans WHERE id = ? AND trip_id = ?
           )`,
      )
      .bind(deletedAt, tripId, planId, planId, tripId),
  ]);

  return deletion.results.length > 0;
}
