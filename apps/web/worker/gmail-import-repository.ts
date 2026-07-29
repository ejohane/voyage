import type { GmailCandidateSource, GmailImportCandidate } from "@voyage/contracts";
import { gmailCandidateSources } from "./gmail-candidates";

type ImportedItem = {
  sourceKey: string;
  kind: "travel" | "stay";
  itemId: string;
};

async function existingSource(
  database: D1Database,
  userId: string,
  tripId: string,
  sourceKey: string,
) {
  return database
    .prepare(
      `SELECT item_id FROM gmail_import_sources
       WHERE user_id = ? AND trip_id = ? AND source_key = ?`,
    )
    .bind(userId, tripId, sourceKey)
    .first<{ item_id: string }>();
}

async function duplicateItem(
  database: D1Database,
  tripId: string,
  candidate: GmailImportCandidate,
) {
  if (candidate.kind === "travel") {
    if (candidate.input.kind === "rental") {
      return database
        .prepare(
          `SELECT id FROM travel_segments
           WHERE trip_id = ? AND kind = 'rental' AND (
             (? IS NOT NULL AND confirmation_number = ?)
             OR (departure_at = ? AND departure_location = ? AND COALESCE(carrier, '') = COALESCE(?, ''))
           )
           LIMIT 1`,
        )
        .bind(
          tripId,
          candidate.input.confirmationNumber,
          candidate.input.confirmationNumber,
          candidate.input.departureAt,
          candidate.input.departureLocation,
          candidate.input.carrier,
        )
        .first<{ id: string }>();
    }
    return database
      .prepare(
        `SELECT id FROM travel_segments
         WHERE trip_id = ? AND (
           (
             ? IS NOT NULL AND confirmation_number = ?
             AND departure_at = ? AND departure_location = ? AND arrival_location = ?
           )
           OR (
             departure_at = ? AND departure_location = ? AND arrival_location = ?
             AND COALESCE(reference_number, '') = COALESCE(?, '')
           )
         )
         LIMIT 1`,
      )
      .bind(
        tripId,
        candidate.input.confirmationNumber,
        candidate.input.confirmationNumber,
        candidate.input.departureAt,
        candidate.input.departureLocation,
        candidate.input.arrivalLocation,
        candidate.input.departureAt,
        candidate.input.departureLocation,
        candidate.input.arrivalLocation,
        candidate.input.referenceNumber,
      )
      .first<{ id: string }>();
  }

  return database
    .prepare(
      `SELECT id FROM stays
       WHERE trip_id = ? AND (
         (? IS NOT NULL AND confirmation_number = ?)
         OR (property_name = ? AND check_in_date = ? AND check_out_date = ?)
       )
       LIMIT 1`,
    )
    .bind(
      tripId,
      candidate.input.confirmationNumber,
      candidate.input.confirmationNumber,
      candidate.input.propertyName,
      candidate.input.checkInDate,
      candidate.input.checkOutDate,
    )
    .first<{ id: string }>();
}

function sourceStatement(
  database: D1Database,
  userId: string,
  tripId: string,
  source: GmailCandidateSource,
  kind: GmailImportCandidate["kind"],
  itemId: string,
  now: string,
) {
  return database
    .prepare(
      `INSERT INTO gmail_import_sources (
        user_id, trip_id, source_key, gmail_message_id, gmail_thread_id,
        item_type, item_id, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(userId, tripId, source.key, source.messageId, source.threadId, kind, itemId, now);
}

function bookingDetailsStatement(
  database: D1Database,
  stayId: string,
  details: NonNullable<Extract<GmailImportCandidate, { kind: "stay" }>["input"]["bookingDetails"]>,
  now: string,
  fillMissingOnly: boolean,
) {
  const value = (column: string) =>
    fillMissingOnly
      ? `${column} = COALESCE(stay_booking_details.${column}, excluded.${column})`
      : `${column} = excluded.${column}`;
  return database
    .prepare(
      `INSERT INTO stay_booking_details (
        stay_id, check_in_window, check_out_window, room_type, guest_summary, meal_plan,
        cancellation_summary, cancellation_deadline, total_price_text, amenities_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stay_id) DO UPDATE SET
        ${value("check_in_window")},
        ${value("check_out_window")},
        ${value("room_type")},
        ${value("guest_summary")},
        ${value("meal_plan")},
        ${value("cancellation_summary")},
        ${value("cancellation_deadline")},
        ${value("total_price_text")},
        amenities_json = CASE
          WHEN stay_booking_details.amenities_json = '[]' THEN excluded.amenities_json
          ELSE stay_booking_details.amenities_json
        END,
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

export async function importGmailCandidate(
  database: D1Database,
  userId: string,
  tripId: string,
  candidate: GmailImportCandidate,
): Promise<{ result: "imported" | "already_imported" | "duplicate"; item?: ImportedItem }> {
  const sources = gmailCandidateSources(candidate);
  const newSources = [];
  for (const source of sources) {
    if (!(await existingSource(database, userId, tripId, source.key))) newSources.push(source);
  }
  if (!newSources.length) {
    return { result: "already_imported" };
  }

  const duplicate = await duplicateItem(database, tripId, candidate);
  const now = new Date().toISOString();
  if (duplicate) {
    const statements = newSources.map((source) =>
      sourceStatement(database, userId, tripId, source, candidate.kind, duplicate.id, now),
    );
    if (candidate.kind === "stay") {
      if (candidate.input.propertyRef) {
        statements.push(
          database
            .prepare(
              `UPDATE stays SET
                property_place_provider = COALESCE(property_place_provider, ?),
                property_place_id = COALESCE(property_place_id, ?),
                property_match_method = COALESCE(property_match_method, 'gmail_auto'),
                property_matched_at = COALESCE(property_matched_at, ?),
                updated_at = ?
               WHERE id = ? AND trip_id = ?`,
            )
            .bind(
              candidate.input.propertyRef.provider,
              candidate.input.propertyRef.placeId,
              now,
              now,
              duplicate.id,
              tripId,
            ),
        );
      }
      if (candidate.input.bookingDetails) {
        statements.push(
          bookingDetailsStatement(
            database,
            duplicate.id,
            candidate.input.bookingDetails,
            now,
            true,
          ),
        );
      }
    }
    await database.batch(statements);
    return { result: "duplicate" };
  }

  const itemId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [];
  if (candidate.kind === "travel") {
    statements.push(
      database
        .prepare(
          `INSERT INTO travel_segments (
            id, trip_id, kind, type, status, departure_stop_id, arrival_stop_id,
            departure_location, arrival_location,
            departure_at, arrival_at, carrier, reference_number, vehicle_description, confirmation_number,
            booking_url, notes, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          itemId,
          tripId,
          candidate.input.kind,
          candidate.input.type,
          candidate.input.status,
          candidate.input.departureStopId,
          candidate.input.arrivalStopId,
          candidate.input.departureLocation,
          candidate.input.arrivalLocation,
          candidate.input.departureAt,
          candidate.input.arrivalAt,
          candidate.input.carrier,
          candidate.input.referenceNumber,
          candidate.input.vehicleDescription,
          candidate.input.confirmationNumber,
          candidate.input.bookingUrl,
          candidate.input.notes,
          userId,
          now,
          now,
        ),
    );
  } else {
    statements.push(
      database
        .prepare(
          `INSERT INTO stays (
            id, trip_id, status, trip_stop_id, property_name, address, check_in_date, check_out_date,
            confirmation_number, booking_url, notes, property_place_provider, property_place_id,
            property_match_method, property_matched_at, created_by_user_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          itemId,
          tripId,
          candidate.input.status,
          candidate.input.tripStopId,
          candidate.input.propertyName,
          candidate.input.address,
          candidate.input.checkInDate,
          candidate.input.checkOutDate,
          candidate.input.confirmationNumber,
          candidate.input.bookingUrl,
          candidate.input.notes,
          candidate.input.propertyRef?.provider ?? null,
          candidate.input.propertyRef?.placeId ?? null,
          candidate.input.propertyRef ? "gmail_auto" : null,
          candidate.input.propertyRef ? now : null,
          userId,
          now,
          now,
        ),
    );
    if (candidate.input.bookingDetails) {
      statements.push(
        bookingDetailsStatement(database, itemId, candidate.input.bookingDetails, now, false),
      );
    }
  }
  statements.push(
    ...newSources.map((source) =>
      sourceStatement(database, userId, tripId, source, candidate.kind, itemId, now),
    ),
  );
  await database.batch(statements);

  return {
    result: "imported",
    item: { sourceKey: candidate.source.key, kind: candidate.kind, itemId },
  };
}
