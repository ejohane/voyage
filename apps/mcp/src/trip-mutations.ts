import type { TripSummary } from "./trips-repository";

export type TripCreationStop = {
  name: string;
  arrivalDate: string | null;
  departureDate: string | null;
};

export type TripCreationInput = {
  name: string;
  stops: TripCreationStop[];
};

export type TripCreationPreview = {
  name: string;
  startDate: string | null;
  endDate: string | null;
  stops: Array<TripCreationStop & { position: number }>;
};

export type CreateTripMutationResult = {
  trip: TripSummary;
  idempotentReplay: boolean;
};

type MutationRow = {
  request_hash: string;
  result_json: string;
};

export class ConfirmationTokenError extends Error {}
export class IdempotencyConflictError extends Error {}

const confirmationLifetimeMilliseconds = 30 * 60 * 1000;

function deriveTripDates(stops: TripCreationStop[]) {
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

function previewFor(input: TripCreationInput): TripCreationPreview {
  const stops = input.stops.map((stop, position) => ({ ...stop, position }));
  return {
    name: input.name,
    ...deriveTripDates(stops),
    stops,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestHash(input: TripCreationInput): Promise<string> {
  return sha256(JSON.stringify(previewFor(input)));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[a-f0-9]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function signConfirmation(secret: string, expiresAt: number, hash: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(`${expiresAt}:${hash}`),
  );
  return bytesToHex(signature);
}

async function verifyConfirmation(
  token: string,
  secret: string,
  hash: string,
  now: number,
): Promise<boolean> {
  const match = token.match(/^voyage-create-trip-v1:(\d{13}):([a-f0-9]{64})$/);
  if (!match) return false;

  const expiresAt = Number(match[1]);
  const signature = hexToBytes(match[2]);
  if (!signature || !Number.isSafeInteger(expiresAt) || expiresAt < now) return false;

  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(`${expiresAt}:${hash}`),
  );
}

export async function previewTripCreation(
  input: TripCreationInput,
  confirmationSecret: string,
  now = Date.now(),
) {
  const proposal = previewFor(input);
  const hash = await requestHash(input);
  const expiresAt = now + confirmationLifetimeMilliseconds;
  const signature = await signConfirmation(confirmationSecret, expiresAt, hash);
  return {
    proposal,
    confirmationToken: `voyage-create-trip-v1:${expiresAt}:${signature}`,
    confirmationExpiresAt: new Date(expiresAt).toISOString(),
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
       WHERE user_id = ? AND tool_name = 'create_trip' AND idempotency_key = ?`,
    )
    .bind(userId, idempotencyKey)
    .first<MutationRow>();
}

function replayMutation(row: MutationRow, hash: string): CreateTripMutationResult {
  if (row.request_hash !== hash) {
    throw new IdempotencyConflictError(
      "That idempotency key was already used for a different trip proposal.",
    );
  }

  return {
    trip: JSON.parse(row.result_json) as TripSummary,
    idempotentReplay: true,
  };
}

export async function createTripFromMcp(
  database: D1Database,
  userId: string,
  oauthClientId: string,
  appUrl: string,
  input: TripCreationInput,
  confirmationToken: string,
  idempotencyKey: string,
  confirmationSecret: string,
): Promise<CreateTripMutationResult> {
  const hash = await requestHash(input);
  const existing = await findMutation(database, userId, idempotencyKey);
  if (existing) return replayMutation(existing, hash);

  if (!(await verifyConfirmation(confirmationToken, confirmationSecret, hash, Date.now()))) {
    throw new ConfirmationTokenError(
      "The preview is invalid, expired, or no longer matches this trip. Preview it again before saving.",
    );
  }

  const tripId = crypto.randomUUID();
  const mutationId = crypto.randomUUID();
  const now = new Date().toISOString();
  const proposal = previewFor(input);
  const stops = proposal.stops.map((stop) => ({ ...stop, id: crypto.randomUUID() }));
  const trip: TripSummary = {
    id: tripId,
    name: proposal.name,
    startDate: proposal.startDate,
    endDate: proposal.endDate,
    accessLevel: "owner",
    updatedAt: now,
    url: `${appUrl}/trips/${tripId}`,
    stops: stops.map(({ id, name, position, arrivalDate, departureDate }) => ({
      id,
      name,
      position,
      arrivalDate,
      departureDate,
    })),
  };
  const resultJson = JSON.stringify(trip);

  try {
    await database.batch([
      database
        .prepare(
          `INSERT INTO trips (
             id, name, destination, start_date, end_date,
             created_by_user_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          tripId,
          proposal.name,
          proposal.stops[0].name,
          proposal.startDate,
          proposal.endDate,
          userId,
          now,
          now,
        ),
      database
        .prepare(
          `INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at)
           VALUES (?, ?, 'owner', ?)`,
        )
        .bind(tripId, userId, now),
      ...stops.map((stop) =>
        database
          .prepare(
            `INSERT INTO trip_stops (
               id, trip_id, name, position, arrival_date, departure_date, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            stop.id,
            tripId,
            stop.name,
            stop.position,
            stop.arrivalDate,
            stop.departureDate,
            now,
            now,
          ),
      ),
      database
        .prepare(
          `INSERT INTO mcp_mutations (
             id, user_id, oauth_client_id, tool_name, idempotency_key, request_hash,
             status, resource_type, resource_id, result_json, created_at, completed_at
           ) VALUES (?, ?, ?, 'create_trip', ?, ?, 'succeeded', 'trip', ?, ?, ?, ?)`,
        )
        .bind(
          mutationId,
          userId,
          oauthClientId,
          idempotencyKey,
          hash,
          tripId,
          resultJson,
          now,
          now,
        ),
    ]);
  } catch (error) {
    const racedMutation = await findMutation(database, userId, idempotencyKey);
    if (racedMutation) return replayMutation(racedMutation, hash);
    throw error;
  }

  return { trip, idempotentReplay: false };
}
