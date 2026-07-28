import type {
  CreatePlanInput,
  CreateStayInput,
  CreateTravelInput,
  TripAccessLevel,
  UpdatePlanInput,
  UpdateStayInput,
  UpdateTravelInput,
} from "@voyage/contracts";
import {
  createPlanInputSchema,
  createTravelInputSchema,
  stayFieldsSchema,
} from "@voyage/contracts";
import {
  ConfirmationTokenError,
  createConfirmationToken,
  hashJson,
  IdempotencyConflictError,
  verifyConfirmationToken,
} from "./confirmed-mutation";
import type { TripStop, TripSummary } from "./trips-repository";

export type TripStopUpdate = {
  id: string;
  name?: string;
  arrivalDate?: string | null;
  departureDate?: string | null;
};

export type TripUpdateInput = {
  tripId: string;
  expectedUpdatedAt: string;
  name?: string;
  stops?: TripStopUpdate[];
};

type TripUpdateState = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  stops: TripStop[];
};

export type TripUpdateProposal = {
  trip: { id: string; name: string; url: string };
  expectedUpdatedAt: string;
  before: TripUpdateState;
  after: TripUpdateState;
};

export type TripUpdateResult = {
  trip: TripSummary;
  idempotentReplay: boolean;
};

type TransportationFields = Omit<CreateTravelInput, "departureAirportId" | "arrivalAirportId">;
type StayFields = CreateStayInput;
type PlanFields = CreatePlanInput;

export type ItineraryUpdatesInput = {
  tripId: string;
  transportation: Array<{
    id: string;
    expectedUpdatedAt: string;
    changes: Omit<UpdateTravelInput, "departureAirportId" | "arrivalAirportId">;
  }>;
  stays: Array<{ id: string; expectedUpdatedAt: string; changes: UpdateStayInput }>;
  plans: Array<{ id: string; expectedUpdatedAt: string; changes: UpdatePlanInput }>;
};

type ProposedUpdate<T> = {
  id: string;
  expectedUpdatedAt: string;
  before: T;
  after: T;
};

export type ItineraryUpdatesProposal = {
  trip: { id: string; name: string; url: string };
  updates: {
    transportation: Array<ProposedUpdate<TransportationFields>>;
    stays: Array<ProposedUpdate<StayFields>>;
    plans: Array<ProposedUpdate<PlanFields>>;
  };
  counts: { transportation: number; stays: number; plans: number; total: number };
};

type UpdatedItem = { id: string; label: string; updatedAt: string };
type ItineraryUpdatesBaseResult = {
  trip: { id: string; name: string; url: string };
  updated: {
    transportation: UpdatedItem[];
    stays: UpdatedItem[];
    plans: UpdatedItem[];
  };
};

export type ItineraryUpdatesResult = ItineraryUpdatesBaseResult & {
  idempotentReplay: boolean;
};

type MutationRow = { request_hash: string; result_json: string };
type TripRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  updated_at: string;
  access_level: TripAccessLevel;
};
type StopRow = {
  id: string;
  name: string;
  position: number;
  arrival_date: string | null;
  departure_date: string | null;
};
type TransportationRow = {
  id: string;
  updated_at: string;
  kind: TransportationFields["kind"];
  type: TransportationFields["type"];
  status: TransportationFields["status"];
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
};
type StayRow = {
  id: string;
  updated_at: string;
  status: StayFields["status"];
  trip_stop_id: string | null;
  property_name: string;
  address: string;
  check_in_date: string;
  check_out_date: string;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
};
type PlanRow = {
  id: string;
  updated_at: string;
  trip_stop_id: string;
  title: string;
  category: PlanFields["category"];
  status: PlanFields["status"];
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  confirmation_number: string | null;
  booking_url: string | null;
  notes: string | null;
};

export class UpdateAccessError extends Error {}
export class UpdateReferenceError extends Error {}
export class StaleRevisionError extends Error {}
export class NoChangesError extends Error {}

const tripToolName = "update_trip";
const itineraryToolName = "update_itinerary_items";
const tripConfirmationPrefix = "voyage-update-trip-v1";
const itineraryConfirmationPrefix = "voyage-update-itinerary-items-v1";

function mapStop(row: StopRow): TripStop {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    arrivalDate: row.arrival_date,
    departureDate: row.departure_date,
  };
}

async function editableTrip(database: D1Database, userId: string, tripId: string, appUrl: string) {
  const trip = await database
    .prepare(
      `SELECT trips.id, trips.name, trips.start_date, trips.end_date, trips.updated_at,
              trip_memberships.access_level
       FROM trips
       INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
       WHERE trips.id = ? AND trip_memberships.user_id = ?`,
    )
    .bind(tripId, userId)
    .first<TripRow>();

  if (!trip || trip.access_level === "viewer") {
    throw new UpdateAccessError(
      "Trip not found or the connected account does not have editing access.",
    );
  }

  const stops = await database
    .prepare(
      `SELECT id, name, position, arrival_date, departure_date
       FROM trip_stops WHERE trip_id = ? ORDER BY position`,
    )
    .bind(tripId)
    .all<StopRow>();

  return {
    trip,
    stops: stops.results.map(mapStop),
    link: { id: trip.id, name: trip.name, url: `${appUrl}/trips/${trip.id}` },
  };
}

function deriveTripDates(stops: TripStop[]) {
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

function validateStop(stop: TripStop) {
  if (stop.departureDate && !stop.arrivalDate) {
    throw new UpdateReferenceError(
      `Destination ${stop.name} needs an arrival date before its departure date.`,
    );
  }
  if (stop.arrivalDate && stop.departureDate && stop.departureDate < stop.arrivalDate) {
    throw new UpdateReferenceError(
      `Destination ${stop.name} must depart on or after its arrival date.`,
    );
  }
}

function tripProposal(
  context: Awaited<ReturnType<typeof editableTrip>>,
  input: TripUpdateInput,
): TripUpdateProposal {
  if (context.trip.updated_at !== input.expectedUpdatedAt) {
    throw new StaleRevisionError(
      "The trip changed since it was read. Load the trip again before previewing corrections.",
    );
  }

  const originalStops = context.stops.map((stop) => ({ ...stop }));
  const afterStops = context.stops.map((stop) => ({ ...stop }));
  const stopById = new Map(afterStops.map((stop) => [stop.id, stop]));
  const seen = new Set<string>();
  for (const update of input.stops ?? []) {
    if (seen.has(update.id)) {
      throw new UpdateReferenceError("Each destination can be updated only once per proposal.");
    }
    seen.add(update.id);
    const stop = stopById.get(update.id);
    if (!stop) {
      throw new UpdateReferenceError(
        "Every destination update must identify a destination on the selected trip.",
      );
    }
    Object.assign(stop, {
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.arrivalDate !== undefined ? { arrivalDate: update.arrivalDate } : {}),
      ...(update.departureDate !== undefined ? { departureDate: update.departureDate } : {}),
    });
  }
  afterStops.forEach(validateStop);
  const dates = deriveTripDates(afterStops);
  const before: TripUpdateState = {
    name: context.trip.name,
    startDate: context.trip.start_date,
    endDate: context.trip.end_date,
    stops: originalStops,
  };

  const after: TripUpdateState = {
    name: input.name ?? context.trip.name,
    ...dates,
    stops: afterStops,
  };
  if (JSON.stringify(before) === JSON.stringify(after)) {
    throw new NoChangesError("The proposed trip correction does not change any values.");
  }

  return {
    trip: context.link,
    expectedUpdatedAt: input.expectedUpdatedAt,
    before,
    after,
  };
}

async function findMutation(
  database: D1Database,
  userId: string,
  toolName: string,
  idempotencyKey: string,
) {
  return database
    .prepare(
      `SELECT request_hash, result_json FROM mcp_mutations
       WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?`,
    )
    .bind(userId, toolName, idempotencyKey)
    .first<MutationRow>();
}

function replayTrip(row: MutationRow, requestHash: string): TripUpdateResult {
  if (row.request_hash !== requestHash) {
    throw new IdempotencyConflictError(
      "That idempotency key was already used for a different trip correction.",
    );
  }
  return {
    ...(JSON.parse(row.result_json) as Omit<TripUpdateResult, "idempotentReplay">),
    idempotentReplay: true,
  };
}

export async function previewTripUpdate(
  database: D1Database,
  userId: string,
  appUrl: string,
  input: TripUpdateInput,
  confirmationSecret: string,
  now = Date.now(),
) {
  const context = await editableTrip(database, userId, input.tripId, appUrl);
  const proposal = tripProposal(context, input);
  return {
    proposal,
    ...(await createConfirmationToken(
      tripConfirmationPrefix,
      await hashJson(proposal),
      confirmationSecret,
      now,
    )),
  };
}

export async function updateTripFromMcp(
  database: D1Database,
  userId: string,
  oauthClientId: string,
  appUrl: string,
  input: TripUpdateInput,
  confirmationToken: string,
  idempotencyKey: string,
  confirmationSecret: string,
): Promise<TripUpdateResult> {
  const context = await editableTrip(database, userId, input.tripId, appUrl);
  const requestHash = await hashJson(input);
  const existing = await findMutation(database, userId, tripToolName, idempotencyKey);
  if (existing) return replayTrip(existing, requestHash);
  const proposal = tripProposal(context, input);
  if (
    !(await verifyConfirmationToken(
      confirmationToken,
      tripConfirmationPrefix,
      confirmationSecret,
      await hashJson(proposal),
    ))
  ) {
    throw new ConfirmationTokenError(
      "The preview is invalid, expired, or no longer matches this trip correction. Preview it again before saving.",
    );
  }

  const updatedAt = new Date().toISOString();
  const trip: TripSummary = {
    id: context.trip.id,
    name: proposal.after.name,
    startDate: proposal.after.startDate,
    endDate: proposal.after.endDate,
    accessLevel: context.trip.access_level,
    updatedAt,
    url: context.link.url,
    stops: proposal.after.stops,
  };
  const resultBase = { trip };
  const mutationId = crypto.randomUUID();
  const resultJson = JSON.stringify(resultBase);
  const stopUpdates = new Map((input.stops ?? []).map((update) => [update.id, update]));

  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO mcp_mutations (
             id, user_id, oauth_client_id, tool_name, idempotency_key, request_hash,
             status, resource_type, resource_id, result_json, created_at, completed_at
           )
           SELECT ?, ?, ?, ?, ?, ?, 'succeeded', 'trip', ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM trips
             INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
             WHERE trips.id = ? AND trips.updated_at = ?
               AND trip_memberships.user_id = ?
               AND trip_memberships.access_level IN ('owner', 'editor')
           )`,
        )
        .bind(
          mutationId,
          userId,
          oauthClientId,
          tripToolName,
          idempotencyKey,
          requestHash,
          input.tripId,
          resultJson,
          updatedAt,
          updatedAt,
          input.tripId,
          input.expectedUpdatedAt,
          userId,
        ),
      database
        .prepare(
          `UPDATE trips
           SET name = ?, destination = ?, start_date = ?, end_date = ?, updated_at = ?
           WHERE id = ? AND EXISTS (SELECT 1 FROM mcp_mutations WHERE id = ?)`,
        )
        .bind(
          proposal.after.name,
          proposal.after.stops[0]?.name ?? proposal.after.name,
          proposal.after.startDate,
          proposal.after.endDate,
          updatedAt,
          input.tripId,
          mutationId,
        ),
      ...proposal.after.stops
        .filter((stop) => stopUpdates.has(stop.id))
        .map((stop) =>
          database
            .prepare(
              `UPDATE trip_stops
               SET name = ?, arrival_date = ?, departure_date = ?, updated_at = ?
               WHERE id = ? AND trip_id = ?
                 AND EXISTS (SELECT 1 FROM mcp_mutations WHERE id = ?)`,
            )
            .bind(
              stop.name,
              stop.arrivalDate,
              stop.departureDate,
              updatedAt,
              stop.id,
              input.tripId,
              mutationId,
            ),
        ),
    ]);
  } catch (error) {
    const raced = await findMutation(database, userId, tripToolName, idempotencyKey);
    if (raced) return replayTrip(raced, requestHash);
    throw error;
  }

  const committed = await findMutation(database, userId, tripToolName, idempotencyKey);
  if (!committed) {
    throw new StaleRevisionError(
      "The trip changed while this correction was being saved. Load it again and preview the correction again.",
    );
  }
  return { ...resultBase, idempotentReplay: false };
}

function mapTransportation(row: TransportationRow): TransportationFields {
  return {
    kind: row.kind,
    type: row.type,
    status: row.status,
    departureStopId: row.departure_stop_id,
    arrivalStopId: row.arrival_stop_id,
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
  };
}

function mapStay(row: StayRow): StayFields {
  return {
    status: row.status,
    tripStopId: row.trip_stop_id,
    propertyName: row.property_name,
    address: row.address,
    checkInDate: row.check_in_date,
    checkOutDate: row.check_out_date,
    confirmationNumber: row.confirmation_number,
    bookingUrl: row.booking_url,
    notes: row.notes,
  } as StayFields;
}

function mapPlan(row: PlanRow): PlanFields {
  return {
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
  };
}

function assertUniqueIds(input: ItineraryUpdatesInput) {
  const ids = [
    ...input.transportation.map((update) => update.id),
    ...input.stays.map((update) => update.id),
    ...input.plans.map((update) => update.id),
  ];
  if (new Set(ids).size !== ids.length) {
    throw new UpdateReferenceError("Each itinerary item can be updated only once per proposal.");
  }
}

async function itineraryProposal(
  database: D1Database,
  context: Awaited<ReturnType<typeof editableTrip>>,
  input: ItineraryUpdatesInput,
): Promise<ItineraryUpdatesProposal> {
  assertUniqueIds(input);
  const [transportation, stays, plans] = await Promise.all([
    Promise.all(
      input.transportation.map((update) =>
        database
          .prepare("SELECT * FROM travel_segments WHERE id = ? AND trip_id = ?")
          .bind(update.id, input.tripId)
          .first<TransportationRow>(),
      ),
    ),
    Promise.all(
      input.stays.map((update) =>
        database
          .prepare("SELECT * FROM stays WHERE id = ? AND trip_id = ?")
          .bind(update.id, input.tripId)
          .first<StayRow>(),
      ),
    ),
    Promise.all(
      input.plans.map((update) =>
        database
          .prepare("SELECT * FROM trip_plans WHERE id = ? AND trip_id = ?")
          .bind(update.id, input.tripId)
          .first<PlanRow>(),
      ),
    ),
  ]);
  if ([...transportation, ...stays, ...plans].some((row) => !row)) {
    throw new UpdateReferenceError(
      "Every itinerary update must identify an item on the selected trip.",
    );
  }

  const destinationIds = new Set(context.stops.map((stop) => stop.id));
  const proposedTransportation = input.transportation.map((update, index) => {
    const row = transportation[index] as TransportationRow;
    if (row.updated_at !== update.expectedUpdatedAt) {
      throw new StaleRevisionError(
        "A transportation item changed since it was read. Load the trip again before previewing corrections.",
      );
    }
    const before = mapTransportation(row);
    const after = { ...before, ...update.changes };
    const parsed = createTravelInputSchema.safeParse({
      ...after,
      departureAirportId: null,
      arrivalAirportId: null,
    });
    if (!parsed.success) throw new UpdateReferenceError("A transportation correction is invalid.");
    return { id: update.id, expectedUpdatedAt: update.expectedUpdatedAt, before, after };
  });
  const proposedStays = input.stays.map((update, index) => {
    const row = stays[index] as StayRow;
    if (row.updated_at !== update.expectedUpdatedAt) {
      throw new StaleRevisionError(
        "A stay changed since it was read. Load the trip again before previewing corrections.",
      );
    }
    const before = mapStay(row);
    const after = { ...before, ...update.changes };
    const parsed = stayFieldsSchema.safeParse(after);
    if (!parsed.success) throw new UpdateReferenceError("A stay correction is invalid.");
    return { id: update.id, expectedUpdatedAt: update.expectedUpdatedAt, before, after };
  });
  const proposedPlans = input.plans.map((update, index) => {
    const row = plans[index] as PlanRow;
    if (row.updated_at !== update.expectedUpdatedAt) {
      throw new StaleRevisionError(
        "A plan changed since it was read. Load the trip again before previewing corrections.",
      );
    }
    const before = mapPlan(row);
    const after = { ...before, ...update.changes };
    const parsed = createPlanInputSchema.safeParse(after);
    if (!parsed.success) throw new UpdateReferenceError("A plan correction is invalid.");
    return { id: update.id, expectedUpdatedAt: update.expectedUpdatedAt, before, after };
  });
  const references = [
    ...proposedTransportation.flatMap(({ after }) => [after.departureStopId, after.arrivalStopId]),
    ...proposedStays.map(({ after }) => after.tripStopId),
    ...proposedPlans.map(({ after }) => after.tripStopId),
  ].filter((value): value is string => value !== null);
  if (references.some((reference) => !destinationIds.has(reference))) {
    throw new UpdateReferenceError(
      "Every destination reference must identify a destination on the selected trip.",
    );
  }
  const updates = {
    transportation: proposedTransportation,
    stays: proposedStays,
    plans: proposedPlans,
  };
  if (
    [...updates.transportation, ...updates.stays, ...updates.plans].every(
      (update) => JSON.stringify(update.before) === JSON.stringify(update.after),
    )
  ) {
    throw new NoChangesError("The proposed itinerary corrections do not change any values.");
  }
  return {
    trip: context.link,
    updates,
    counts: {
      transportation: updates.transportation.length,
      stays: updates.stays.length,
      plans: updates.plans.length,
      total: updates.transportation.length + updates.stays.length + updates.plans.length,
    },
  };
}

function replayItinerary(row: MutationRow, requestHash: string): ItineraryUpdatesResult {
  if (row.request_hash !== requestHash) {
    throw new IdempotencyConflictError(
      "That idempotency key was already used for different itinerary corrections.",
    );
  }
  return {
    ...(JSON.parse(row.result_json) as ItineraryUpdatesBaseResult),
    idempotentReplay: true,
  };
}

export async function previewItineraryUpdates(
  database: D1Database,
  userId: string,
  appUrl: string,
  input: ItineraryUpdatesInput,
  confirmationSecret: string,
  now = Date.now(),
) {
  const context = await editableTrip(database, userId, input.tripId, appUrl);
  const proposal = await itineraryProposal(database, context, input);
  return {
    proposal,
    ...(await createConfirmationToken(
      itineraryConfirmationPrefix,
      await hashJson(proposal),
      confirmationSecret,
      now,
    )),
  };
}

function itineraryGuardSql(input: ItineraryUpdatesInput) {
  const checks = [
    ...input.transportation.map(
      () =>
        "EXISTS (SELECT 1 FROM travel_segments WHERE id = ? AND trip_id = ? AND updated_at = ?)",
    ),
    ...input.stays.map(
      () => "EXISTS (SELECT 1 FROM stays WHERE id = ? AND trip_id = ? AND updated_at = ?)",
    ),
    ...input.plans.map(
      () => "EXISTS (SELECT 1 FROM trip_plans WHERE id = ? AND trip_id = ? AND updated_at = ?)",
    ),
  ];
  return checks.length ? ` AND ${checks.join(" AND ")}` : "";
}

function itineraryGuardBindings(input: ItineraryUpdatesInput) {
  return [
    ...input.transportation.flatMap((update) => [
      update.id,
      input.tripId,
      update.expectedUpdatedAt,
    ]),
    ...input.stays.flatMap((update) => [update.id, input.tripId, update.expectedUpdatedAt]),
    ...input.plans.flatMap((update) => [update.id, input.tripId, update.expectedUpdatedAt]),
  ];
}

export async function updateItineraryItemsFromMcp(
  database: D1Database,
  userId: string,
  oauthClientId: string,
  appUrl: string,
  input: ItineraryUpdatesInput,
  confirmationToken: string,
  idempotencyKey: string,
  confirmationSecret: string,
): Promise<ItineraryUpdatesResult> {
  const context = await editableTrip(database, userId, input.tripId, appUrl);
  const requestHash = await hashJson(input);
  const existing = await findMutation(database, userId, itineraryToolName, idempotencyKey);
  if (existing) return replayItinerary(existing, requestHash);
  const proposal = await itineraryProposal(database, context, input);
  if (
    !(await verifyConfirmationToken(
      confirmationToken,
      itineraryConfirmationPrefix,
      confirmationSecret,
      await hashJson(proposal),
    ))
  ) {
    throw new ConfirmationTokenError(
      "The preview is invalid, expired, or no longer matches these itinerary corrections. Preview them again before saving.",
    );
  }

  const updatedAt = new Date().toISOString();
  const resultBase: ItineraryUpdatesBaseResult = {
    trip: context.link,
    updated: {
      transportation: proposal.updates.transportation.map((update) => ({
        id: update.id,
        label: `${update.after.departureLocation} to ${update.after.arrivalLocation}`,
        updatedAt,
      })),
      stays: proposal.updates.stays.map((update) => ({
        id: update.id,
        label: update.after.propertyName,
        updatedAt,
      })),
      plans: proposal.updates.plans.map((update) => ({
        id: update.id,
        label: update.after.title,
        updatedAt,
      })),
    },
  };
  const mutationId = crypto.randomUUID();
  const resultJson = JSON.stringify(resultBase);

  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO mcp_mutations (
             id, user_id, oauth_client_id, tool_name, idempotency_key, request_hash,
             status, resource_type, resource_id, result_json, created_at, completed_at
           )
           SELECT ?, ?, ?, ?, ?, ?, 'succeeded', 'trip_itinerary_update_batch', ?, ?, ?, ?
           WHERE EXISTS (
             SELECT 1 FROM trip_memberships
             WHERE trip_id = ? AND user_id = ? AND access_level IN ('owner', 'editor')
           )${itineraryGuardSql(input)}`,
        )
        .bind(
          mutationId,
          userId,
          oauthClientId,
          itineraryToolName,
          idempotencyKey,
          requestHash,
          input.tripId,
          resultJson,
          updatedAt,
          updatedAt,
          input.tripId,
          userId,
          ...itineraryGuardBindings(input),
        ),
      ...proposal.updates.transportation.map((update) =>
        database
          .prepare(
            `UPDATE travel_segments SET
               kind = ?, type = ?, status = ?, departure_stop_id = ?, arrival_stop_id = ?,
               departure_location = ?, arrival_location = ?, departure_at = ?, arrival_at = ?,
               carrier = ?, reference_number = ?, vehicle_description = ?,
               confirmation_number = ?, booking_url = ?, notes = ?, updated_at = ?
             WHERE id = ? AND trip_id = ?
               AND EXISTS (SELECT 1 FROM mcp_mutations WHERE id = ?)`,
          )
          .bind(
            update.after.kind,
            update.after.type,
            update.after.status,
            update.after.departureStopId,
            update.after.arrivalStopId,
            update.after.departureLocation,
            update.after.arrivalLocation,
            update.after.departureAt,
            update.after.arrivalAt,
            update.after.carrier,
            update.after.referenceNumber,
            update.after.vehicleDescription,
            update.after.confirmationNumber,
            update.after.bookingUrl,
            update.after.notes,
            updatedAt,
            update.id,
            input.tripId,
            mutationId,
          ),
      ),
      ...proposal.updates.stays.map((update) =>
        database
          .prepare(
            `UPDATE stays SET status = ?, trip_stop_id = ?, property_name = ?, address = ?,
               check_in_date = ?, check_out_date = ?, confirmation_number = ?,
               booking_url = ?, notes = ?, updated_at = ?
             WHERE id = ? AND trip_id = ?
               AND EXISTS (SELECT 1 FROM mcp_mutations WHERE id = ?)`,
          )
          .bind(
            update.after.status,
            update.after.tripStopId,
            update.after.propertyName,
            update.after.address,
            update.after.checkInDate,
            update.after.checkOutDate,
            update.after.confirmationNumber,
            update.after.bookingUrl,
            update.after.notes,
            updatedAt,
            update.id,
            input.tripId,
            mutationId,
          ),
      ),
      ...proposal.updates.plans.map((update) =>
        database
          .prepare(
            `UPDATE trip_plans SET trip_stop_id = ?, title = ?, category = ?, status = ?,
               scheduled_date = ?, start_time = ?, end_time = ?, location = ?,
               confirmation_number = ?, booking_url = ?, notes = ?, updated_at = ?
             WHERE id = ? AND trip_id = ?
               AND EXISTS (SELECT 1 FROM mcp_mutations WHERE id = ?)`,
          )
          .bind(
            update.after.tripStopId,
            update.after.title,
            update.after.category,
            update.after.status,
            update.after.scheduledDate,
            update.after.startTime,
            update.after.endTime,
            update.after.location,
            update.after.confirmationNumber,
            update.after.bookingUrl,
            update.after.notes,
            updatedAt,
            update.id,
            input.tripId,
            mutationId,
          ),
      ),
    ]);
  } catch (error) {
    const raced = await findMutation(database, userId, itineraryToolName, idempotencyKey);
    if (raced) return replayItinerary(raced, requestHash);
    throw error;
  }

  const committed = await findMutation(database, userId, itineraryToolName, idempotencyKey);
  if (!committed) {
    throw new StaleRevisionError(
      "An itinerary item changed while these corrections were being saved. Load the trip and preview the corrections again.",
    );
  }
  return { ...resultBase, idempotentReplay: false };
}
