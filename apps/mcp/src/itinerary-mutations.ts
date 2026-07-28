import type {
  CreatePlanInput,
  CreateStayInput,
  CreateTravelInput,
  TripAccessLevel,
} from "@voyage/contracts";
import {
  ConfirmationTokenError,
  createConfirmationToken,
  hashJson,
  IdempotencyConflictError,
  verifyConfirmationToken,
} from "./confirmed-mutation";

export type ItineraryTransportationInput = Omit<
  CreateTravelInput,
  "departureAirportId" | "arrivalAirportId"
>;
export type ItineraryStayInput = Omit<CreateStayInput, "tripStopId"> & {
  tripStopId: string;
};
export type ItineraryPlanInput = CreatePlanInput;

export type ItineraryBatchInput = {
  tripId: string;
  transportation: ItineraryTransportationInput[];
  stays: ItineraryStayInput[];
  plans: ItineraryPlanInput[];
};

type EditableTripContext = {
  trip: { id: string; name: string; url: string };
  destinations: Array<{ id: string; name: string }>;
};

export type ItineraryBatchPreview = EditableTripContext & {
  items: Omit<ItineraryBatchInput, "tripId">;
  counts: { transportation: number; stays: number; plans: number; total: number };
};

type CreatedItem = { id: string; label: string };
type ItineraryMutationBaseResult = {
  trip: { id: string; name: string; url: string };
  created: {
    transportation: CreatedItem[];
    stays: CreatedItem[];
    plans: CreatedItem[];
  };
};

export type ItineraryMutationResult = ItineraryMutationBaseResult & {
  idempotentReplay: boolean;
};

type TripContextRow = {
  id: string;
  name: string;
  access_level: TripAccessLevel;
};

type TripStopRow = { id: string; name: string };
type MutationRow = { request_hash: string; result_json: string };

export class ItineraryAccessError extends Error {}
export class ItineraryReferenceError extends Error {}

const toolName = "add_itinerary_items";
const confirmationPrefix = "voyage-add-itinerary-items-v1";

async function editableTripContext(
  database: D1Database,
  userId: string,
  tripId: string,
  appUrl: string,
): Promise<EditableTripContext> {
  const trip = await database
    .prepare(
      `SELECT trips.id, trips.name, trip_memberships.access_level
       FROM trips
       INNER JOIN trip_memberships ON trip_memberships.trip_id = trips.id
       WHERE trips.id = ? AND trip_memberships.user_id = ?`,
    )
    .bind(tripId, userId)
    .first<TripContextRow>();

  if (!trip || trip.access_level === "viewer") {
    throw new ItineraryAccessError(
      "Trip not found or the connected account does not have editing access.",
    );
  }

  const stops = await database
    .prepare("SELECT id, name FROM trip_stops WHERE trip_id = ? ORDER BY position")
    .bind(tripId)
    .all<TripStopRow>();

  return {
    trip: { id: trip.id, name: trip.name, url: `${appUrl}/trips/${trip.id}` },
    destinations: stops.results,
  };
}

function validateReferences(context: EditableTripContext, input: ItineraryBatchInput) {
  const destinationIds = new Set(context.destinations.map((destination) => destination.id));
  const references = [
    ...input.transportation.flatMap((item) => [item.departureStopId, item.arrivalStopId]),
    ...input.stays.map((item) => item.tripStopId),
    ...input.plans.map((item) => item.tripStopId),
  ].filter((value): value is string => value !== null);

  if (references.some((reference) => !destinationIds.has(reference))) {
    throw new ItineraryReferenceError(
      "Every destination reference must identify a destination on the selected trip.",
    );
  }
}

function previewFor(
  context: EditableTripContext,
  input: ItineraryBatchInput,
): ItineraryBatchPreview {
  const { transportation, stays, plans } = input;
  return {
    ...context,
    items: { transportation, stays, plans },
    counts: {
      transportation: transportation.length,
      stays: stays.length,
      plans: plans.length,
      total: transportation.length + stays.length + plans.length,
    },
  };
}

async function findMutation(
  database: D1Database,
  userId: string,
  idempotencyKey: string,
): Promise<MutationRow | null> {
  return database
    .prepare(
      `SELECT request_hash, result_json
       FROM mcp_mutations
       WHERE user_id = ? AND tool_name = ? AND idempotency_key = ?`,
    )
    .bind(userId, toolName, idempotencyKey)
    .first<MutationRow>();
}

function replayMutation(row: MutationRow, hash: string): ItineraryMutationResult {
  if (row.request_hash !== hash) {
    throw new IdempotencyConflictError(
      "That idempotency key was already used for a different itinerary proposal.",
    );
  }

  return {
    ...(JSON.parse(row.result_json) as ItineraryMutationBaseResult),
    idempotentReplay: true,
  };
}

export async function previewItineraryItems(
  database: D1Database,
  userId: string,
  appUrl: string,
  input: ItineraryBatchInput,
  confirmationSecret: string,
  now = Date.now(),
) {
  const context = await editableTripContext(database, userId, input.tripId, appUrl);
  validateReferences(context, input);
  const proposal = previewFor(context, input);
  const confirmationHash = await hashJson(proposal);

  return {
    proposal,
    ...(await createConfirmationToken(
      confirmationPrefix,
      confirmationHash,
      confirmationSecret,
      now,
    )),
  };
}

export async function addItineraryItemsFromMcp(
  database: D1Database,
  userId: string,
  oauthClientId: string,
  appUrl: string,
  input: ItineraryBatchInput,
  confirmationToken: string,
  idempotencyKey: string,
  confirmationSecret: string,
): Promise<ItineraryMutationResult> {
  const context = await editableTripContext(database, userId, input.tripId, appUrl);
  const requestHash = await hashJson(input);
  const existing = await findMutation(database, userId, idempotencyKey);
  if (existing) return replayMutation(existing, requestHash);

  validateReferences(context, input);
  const proposal = previewFor(context, input);
  const confirmationHash = await hashJson(proposal);
  if (
    !(await verifyConfirmationToken(
      confirmationToken,
      confirmationPrefix,
      confirmationSecret,
      confirmationHash,
    ))
  ) {
    throw new ConfirmationTokenError(
      "The preview is invalid, expired, or no longer matches this itinerary. Preview it again before saving.",
    );
  }

  const now = new Date().toISOString();
  const transportation = input.transportation.map((item) => ({
    ...item,
    id: crypto.randomUUID(),
  }));
  const stays = input.stays.map((item) => ({ ...item, id: crypto.randomUUID() }));
  const plans = input.plans.map((item) => ({ ...item, id: crypto.randomUUID() }));
  const result: ItineraryMutationBaseResult = {
    trip: context.trip,
    created: {
      transportation: transportation.map((item) => ({
        id: item.id,
        label: `${item.departureLocation} to ${item.arrivalLocation}`,
      })),
      stays: stays.map((item) => ({ id: item.id, label: item.propertyName })),
      plans: plans.map((item) => ({ id: item.id, label: item.title })),
    },
  };
  const resultJson = JSON.stringify(result);
  const mutationId = crypto.randomUUID();

  try {
    await database.batch([
      ...transportation.map((item) =>
        database
          .prepare(
            `INSERT INTO travel_segments (
               id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
               departure_location, arrival_location, departure_at, arrival_at,
               carrier, reference_number, vehicle_description, confirmation_number,
               booking_url, notes, created_by_user_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            item.id,
            input.tripId,
            item.kind,
            item.type,
            item.status,
            item.departureStopId,
            item.arrivalStopId,
            item.departureLocation,
            item.arrivalLocation,
            item.departureAt,
            item.arrivalAt,
            item.carrier,
            item.referenceNumber,
            item.vehicleDescription,
            item.confirmationNumber,
            item.bookingUrl,
            item.notes,
            userId,
            now,
            now,
          ),
      ),
      ...stays.map((item) =>
        database
          .prepare(
            `INSERT INTO stays (
               id, trip_id, status, trip_stop_id, property_name, address,
               check_in_date, check_out_date, confirmation_number, booking_url,
               notes, created_by_user_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            item.id,
            input.tripId,
            item.status,
            item.tripStopId,
            item.propertyName,
            item.address,
            item.checkInDate,
            item.checkOutDate,
            item.confirmationNumber,
            item.bookingUrl,
            item.notes,
            userId,
            now,
            now,
          ),
      ),
      ...plans.map((item) =>
        database
          .prepare(
            `INSERT INTO trip_plans (
               id, trip_id, trip_stop_id, title, category, status, scheduled_date,
               start_time, end_time, location, confirmation_number, booking_url,
               notes, created_by_user_id, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            item.id,
            input.tripId,
            item.tripStopId,
            item.title,
            item.category,
            item.status,
            item.scheduledDate,
            item.startTime,
            item.endTime,
            item.location,
            item.confirmationNumber,
            item.bookingUrl,
            item.notes,
            userId,
            now,
            now,
          ),
      ),
      database
        .prepare(
          `INSERT INTO mcp_mutations (
             id, user_id, oauth_client_id, tool_name, idempotency_key, request_hash,
             status, resource_type, resource_id, result_json, created_at, completed_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'succeeded', 'trip_itinerary_batch', ?, ?, ?, ?)`,
        )
        .bind(
          mutationId,
          userId,
          oauthClientId,
          toolName,
          idempotencyKey,
          requestHash,
          input.tripId,
          resultJson,
          now,
          now,
        ),
    ]);
  } catch (error) {
    const racedMutation = await findMutation(database, userId, idempotencyKey);
    if (racedMutation) return replayMutation(racedMutation, requestHash);
    throw error;
  }

  return { ...result, idempotentReplay: false };
}
