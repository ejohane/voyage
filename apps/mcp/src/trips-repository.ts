import type {
  PlanCategory,
  PlanStatus,
  ReservationStatus,
  TransportationKind,
  TravelType,
  TripAccessLevel,
} from "@voyage/contracts";

type TripRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  access_level: TripAccessLevel;
  updated_at: string;
};

type StopRow = {
  id: string;
  trip_id: string;
  name: string;
  position: number;
  arrival_date: string | null;
  departure_date: string | null;
};

type AirportFields = {
  id: number;
  iataCode: string;
  icaoCode: string | null;
  name: string;
  municipality: string | null;
  countryCode: string;
};

type TravelRow = {
  id: string;
  kind: TransportationKind;
  type: TravelType;
  status: ReservationStatus;
  departure_stop_id: string | null;
  arrival_stop_id: string | null;
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
  updated_at: string;
  departure_airport_id: number | null;
  departure_airport_iata_code: string | null;
  departure_airport_icao_code: string | null;
  departure_airport_name: string | null;
  departure_airport_municipality: string | null;
  departure_airport_country_code: string | null;
  arrival_airport_id: number | null;
  arrival_airport_iata_code: string | null;
  arrival_airport_icao_code: string | null;
  arrival_airport_name: string | null;
  arrival_airport_municipality: string | null;
  arrival_airport_country_code: string | null;
};

type StayRow = {
  id: string;
  status: ReservationStatus;
  trip_stop_id: string | null;
  property_name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
  updated_at: string;
};

type PlanRow = {
  id: string;
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
  updated_at: string;
};

export type TripStop = {
  id: string;
  name: string;
  position: number;
  arrivalDate: string | null;
  departureDate: string | null;
};

export type TripSummary = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  accessLevel: TripAccessLevel;
  updatedAt: string;
  url: string;
  stops: TripStop[];
};

export type Transportation = {
  id: string;
  kind: TransportationKind;
  type: TravelType;
  status: ReservationStatus;
  departureStopId: string | null;
  arrivalStopId: string | null;
  departureLocation: string;
  arrivalLocation: string;
  departureAt: string;
  arrivalAt: string | null;
  departureAirport: AirportFields | null;
  arrivalAirport: AirportFields | null;
  carrier: string | null;
  referenceNumber: string | null;
  vehicleDescription: string | null;
  confirmationNumber: string | null;
  bookingUrl: string | null;
  notes: string | null;
  updatedAt: string;
};

export type Stay = {
  id: string;
  status: ReservationStatus;
  tripStopId: string | null;
  propertyName: string;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  confirmationNumber: string | null;
  bookingUrl: string | null;
  notes: string | null;
  updatedAt: string;
};

export type Plan = {
  id: string;
  tripStopId: string;
  title: string;
  category: PlanCategory;
  status: PlanStatus;
  scheduledDate: string | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  confirmationNumber: string | null;
  bookingUrl: string | null;
  notes: string | null;
  updatedAt: string;
};

export type TripWorkspace = {
  trip: TripSummary;
  transportation: Transportation[];
  stays: Stay[];
  plans: Plan[];
};

const tripSelect = `
  SELECT trips.id, trips.name, trips.start_date, trips.end_date,
    trip_memberships.access_level, trips.updated_at
  FROM trips
  INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
`;

function mapStop(row: StopRow): TripStop {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
  };
}

async function listStops(database: D1Database, tripIds: string[]) {
  const stopsByTrip = new Map<string, TripStop[]>();
  if (tripIds.length === 0) return stopsByTrip;

  const rows = await database
    .prepare(
      `SELECT id, trip_id, name, position, arrival_date, departure_date
       FROM trip_stops
       WHERE trip_id IN (${tripIds.map(() => "?").join(", ")})
       ORDER BY trip_id, position`,
    )
    .bind(...tripIds)
    .all<StopRow>();

  for (const row of rows.results) {
    const stops = stopsByTrip.get(row.trip_id) ?? [];
    stops.push(mapStop(row));
    stopsByTrip.set(row.trip_id, stops);
  }

  return stopsByTrip;
}

function mapTrip(row: TripRow, stops: TripStop[], appUrl: string): TripSummary {
  return {
    id: row.id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    accessLevel: row.access_level,
    updatedAt: row.updated_at,
    url: `${appUrl}/trips/${row.id}`,
    stops,
  };
}

export async function listTrips(
  database: D1Database,
  userId: string,
  appUrl: string,
  limit: number,
  offset: number,
) {
  const [count, rows] = await Promise.all([
    database
      .prepare("SELECT count(*) AS total FROM trip_memberships WHERE user_id = ?")
      .bind(userId)
      .first<{ total: number }>(),
    database
      .prepare(`${tripSelect}
        WHERE trip_memberships.user_id = ?
        ORDER BY
          CASE WHEN trips.end_date IS NOT NULL AND trips.end_date < date('now') THEN 1 ELSE 0 END,
          CASE WHEN trips.start_date IS NULL THEN 1 ELSE 0 END,
          trips.start_date ASC,
          trips.updated_at DESC
        LIMIT ? OFFSET ?`)
      .bind(userId, limit, offset)
      .all<TripRow>(),
  ]);
  const stopsByTrip = await listStops(
    database,
    rows.results.map((trip) => trip.id),
  );
  const total = count?.total ?? 0;

  return {
    trips: rows.results.map((trip) => mapTrip(trip, stopsByTrip.get(trip.id) ?? [], appUrl)),
    total,
    offset,
    hasMore: offset + rows.results.length < total,
  };
}

function mapAirport(row: TravelRow, prefix: "departure" | "arrival"): AirportFields | null {
  const id = row[`${prefix}_airport_id`];
  const iataCode = row[`${prefix}_airport_iata_code`];
  const name = row[`${prefix}_airport_name`];
  const countryCode = row[`${prefix}_airport_country_code`];
  if (id === null || iataCode === null || name === null || countryCode === null) return null;

  return {
    id,
    iataCode,
    icaoCode: row[`${prefix}_airport_icao_code`],
    name,
    municipality: row[`${prefix}_airport_municipality`],
    countryCode,
  };
}

function mapTransportation(row: TravelRow): Transportation {
  return {
    id: row.id,
    kind: row.kind,
    type: row.type,
    status: row.status,
    departureStopId: row.departure_stop_id,
    arrivalStopId: row.arrival_stop_id,
    departureLocation: row.departure_location,
    arrivalLocation: row.arrival_location,
    departureAt: row.departure_at,
    arrivalAt: row.arrival_at,
    departureAirport: mapAirport(row, "departure"),
    arrivalAirport: mapAirport(row, "arrival"),
    carrier: row.carrier,
    referenceNumber: row.reference_number,
    vehicleDescription: row.vehicle_description,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function mapStay(row: StayRow): Stay {
  return {
    id: row.id,
    status: row.status,
    tripStopId: row.trip_stop_id,
    propertyName: row.property_name,
    address: row.address,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
    updatedAt: row.updated_at,
  };
}

function mapPlan(row: PlanRow): Plan {
  return {
    id: row.id,
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
    updatedAt: row.updated_at,
  };
}

export async function getTripWorkspace(
  database: D1Database,
  userId: string,
  tripId: string,
  appUrl: string,
): Promise<TripWorkspace | null> {
  const tripRow = await database
    .prepare(`${tripSelect} WHERE trips.id = ? AND trip_memberships.user_id = ?`)
    .bind(tripId, userId)
    .first<TripRow>();
  if (!tripRow) return null;

  const [stopsByTrip, transportationRows, stayRows, planRows] = await Promise.all([
    listStops(database, [tripId]),
    database
      .prepare(
        `SELECT travel_segments.*,
          departure_airport.iata_code AS departure_airport_iata_code,
          departure_airport.icao_code AS departure_airport_icao_code,
          departure_airport.name AS departure_airport_name,
          departure_airport.municipality AS departure_airport_municipality,
          departure_airport.iso_country AS departure_airport_country_code,
          arrival_airport.iata_code AS arrival_airport_iata_code,
          arrival_airport.icao_code AS arrival_airport_icao_code,
          arrival_airport.name AS arrival_airport_name,
          arrival_airport.municipality AS arrival_airport_municipality,
          arrival_airport.iso_country AS arrival_airport_country_code
         FROM travel_segments
         LEFT JOIN airports AS departure_airport ON departure_airport.id = travel_segments.departure_airport_id
         LEFT JOIN airports AS arrival_airport ON arrival_airport.id = travel_segments.arrival_airport_id
         WHERE trip_id = ? ORDER BY departure_at, travel_segments.created_at`,
      )
      .bind(tripId)
      .all<TravelRow>(),
    database
      .prepare("SELECT * FROM stays WHERE trip_id = ? ORDER BY check_in_date, created_at")
      .bind(tripId)
      .all<StayRow>(),
    database
      .prepare(
        `SELECT * FROM trip_plans WHERE trip_id = ?
         ORDER BY
           CASE WHEN scheduled_date IS NULL THEN 1 ELSE 0 END,
           scheduled_date,
           CASE WHEN start_time IS NULL THEN 1 ELSE 0 END,
           start_time,
           created_at`,
      )
      .bind(tripId)
      .all<PlanRow>(),
  ]);

  return {
    trip: mapTrip(tripRow, stopsByTrip.get(tripId) ?? [], appUrl),
    transportation: transportationRows.results.map(mapTransportation),
    stays: stayRows.results.map(mapStay),
    plans: planRows.results.map(mapPlan),
  };
}
