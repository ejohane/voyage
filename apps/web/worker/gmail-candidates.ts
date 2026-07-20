import type {
  GmailCandidateSource,
  GmailImportCandidate,
  GmailStayCandidate,
  GmailTravelCandidate,
  Trip,
} from "@voyage/contracts";

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function normalizedRouteLocation(value: string) {
  return normalized(value.split("·").at(-1));
}

function shiftedTripDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isWithinTrip(candidate: GmailImportCandidate, trip: Trip) {
  if (!trip.startDate || !trip.endDate) return true;
  const start = shiftedTripDate(trip.startDate, -2);
  const end = shiftedTripDate(trip.endDate, 2);
  if (candidate.kind === "travel") {
    const departureDate = candidate.input.departureAt.slice(0, 10);
    return departureDate >= start && departureDate <= end;
  }
  return candidate.input.checkInDate <= end && candidate.input.checkOutDate >= start;
}

function destinationTokens(trip: Trip) {
  return normalized(trip.stops.map((stop) => stop.name).join(" "))
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !["trip", "travel"].includes(token));
}

function tripRelevance(candidate: GmailImportCandidate, trip: Trip) {
  let score = candidate.confidence === "high" ? 4 : 2;
  if (candidate.input.confirmationNumber) score += 2;
  const details =
    candidate.kind === "travel"
      ? `${candidate.input.departureLocation} ${candidate.input.arrivalLocation} ${candidate.input.carrier ?? ""}`
      : `${candidate.input.propertyName} ${candidate.input.address}`;
  const haystack = normalized(
    `${details} ${candidate.source.subject} ${candidate.source.sender} ${trip.name}`,
  );
  score += destinationTokens(trip).filter((token) => haystack.includes(token)).length * 2;
  return score;
}

function groupKey(candidate: GmailImportCandidate) {
  const confirmation = normalized(candidate.input.confirmationNumber);
  if (candidate.kind === "travel") {
    if (confirmation) {
      return [
        candidate.kind,
        `confirmation:${confirmation}`,
        candidate.input.departureAt.slice(0, 10),
        normalizedRouteLocation(candidate.input.departureLocation),
        normalizedRouteLocation(candidate.input.arrivalLocation),
      ].join(":");
    }
    return [
      candidate.kind,
      normalized(candidate.input.departureLocation),
      normalized(candidate.input.arrivalLocation),
      candidate.input.departureAt.slice(0, 10),
      normalized(candidate.input.referenceNumber),
    ].join(":");
  }

  if (confirmation) return `${candidate.kind}:confirmation:${confirmation}`;

  return [
    candidate.kind,
    normalized(candidate.input.propertyName),
    candidate.input.checkInDate,
    candidate.input.checkOutDate,
  ].join(":");
}

function candidateSources(candidate: GmailImportCandidate) {
  return candidate.sources ?? [candidate.source];
}

function uniqueSources(candidates: GmailImportCandidate[]) {
  const sources = new Map<string, GmailCandidateSource>();
  for (const candidate of candidates) {
    for (const source of candidateSources(candidate)) {
      const current = sources.get(source.messageId);
      if (!current || source.receivedAt > current.receivedAt) sources.set(source.messageId, source);
    }
  }
  return [...sources.values()].sort((left, right) =>
    right.receivedAt.localeCompare(left.receivedAt),
  );
}

function specificBookingUrl(value: string | null) {
  if (!value) return 0;
  if (/confirmation|manage|modify|reservation|itinerary|check.?in/i.test(value)) return 3;
  if (/booking|trip/i.test(value)) return 1;
  return 2;
}

function propertyQuality(value: string) {
  let score = Math.min(value.length, 80) / 80;
  if (!/[A-Za-zÀ-ž]{3}/.test(value)) score -= 10;
  if (/booking\.com/i.test(value)) score -= 3;
  if (/[@]|no-?reply/i.test(value)) score -= 8;
  return score;
}

function addressQuality(value: string) {
  let score = 0;
  if (/\d/.test(value)) score += 3;
  if (/,/.test(value)) score += 2;
  if (/\b\d{4,6}\b/.test(value)) score += 2;
  if (value.split(",").length >= 3) score += 2;
  if (value.length > 8 && value.length < 180) score += 1;
  if (/we(?:'|’)re happy|extra charge|special request|from .+\b(?:am|pm)\b/i.test(value)) {
    score -= 10;
  }
  return score;
}

function baseQuality(candidate: GmailImportCandidate) {
  let score = candidate.confidence === "high" ? 4 : 0;
  if (candidate.input.confirmationNumber) score += 2;
  score += specificBookingUrl(candidate.input.bookingUrl);
  if (
    /booking is confirmed|reservation confirmed|flight confirmation/i.test(candidate.source.subject)
  ) {
    score += 3;
  }
  if (candidate.kind === "stay") {
    score += propertyQuality(candidate.input.propertyName);
    score += addressQuality(candidate.input.address);
  } else {
    if (candidate.input.carrier) score += 1;
    if (candidate.input.arrivalAt) score += 1;
  }
  return score;
}

function candidateOrder(left: GmailImportCandidate, right: GmailImportCandidate) {
  return (
    baseQuality(right) - baseQuality(left) ||
    right.source.receivedAt.localeCompare(left.source.receivedAt)
  );
}

function bestValue<T extends GmailImportCandidate, V>(
  candidates: T[],
  value: (candidate: T) => V,
  quality: (value: V, candidate: T) => number,
) {
  return [...candidates].sort(
    (left, right) => quality(value(right), right) - quality(value(left), left),
  )[0];
}

function consolidateStays(candidates: GmailStayCandidate[]): GmailStayCandidate {
  const representative = [...candidates].sort(candidateOrder)[0];
  const property = bestValue(
    candidates,
    (candidate) => candidate.input.propertyName,
    propertyQuality,
  );
  const address = bestValue(candidates, (candidate) => candidate.input.address, addressQuality);
  const booking = bestValue(
    candidates,
    (candidate) => candidate.input.bookingUrl,
    specificBookingUrl,
  );
  const confirmation = bestValue(
    candidates,
    (candidate) => candidate.input.confirmationNumber,
    (value) => (value ? 1 : 0),
  );
  const merged = {
    ...representative,
    sources: uniqueSources(candidates),
    input: {
      ...representative.input,
      propertyName: property.input.propertyName,
      address: address.input.address,
      confirmationNumber: confirmation.input.confirmationNumber,
      bookingUrl: booking.input.bookingUrl,
    },
  };
  return {
    ...merged,
    confidence:
      addressQuality(merged.input.address) >= 7 && merged.input.confirmationNumber
        ? "high"
        : merged.confidence,
  };
}

function consolidateTravel(candidates: GmailTravelCandidate[]): GmailTravelCandidate {
  const scheduleChange = candidates
    .filter((candidate) => candidate.eventType === "schedule_change")
    .sort((left, right) => right.source.receivedAt.localeCompare(left.source.receivedAt))[0];
  const representative = scheduleChange ?? [...candidates].sort(candidateOrder)[0];
  const booking = bestValue(
    candidates,
    (candidate) => candidate.input.bookingUrl,
    specificBookingUrl,
  );
  const departure = bestValue(
    candidates,
    (candidate) => candidate.input.departureLocation,
    (value) => (/\b[A-Z]{3}\b/.test(value) ? 5 : 0) + Math.min(value.length, 80) / 80,
  );
  const arrival = bestValue(
    candidates,
    (candidate) => candidate.input.arrivalLocation,
    (value) => (/\b[A-Z]{3}\b/.test(value) ? 5 : 0) + Math.min(value.length, 80) / 80,
  );
  const carrier = bestValue(
    candidates,
    (candidate) => candidate.input.carrier,
    (value) => (value && !/booking\.com|gotogate|chase travel/i.test(value) ? 3 : value ? 1 : 0),
  );
  const reference = bestValue(
    candidates,
    (candidate) => candidate.input.referenceNumber,
    (value) => (value ? 1 : 0),
  );
  return {
    ...representative,
    sources: uniqueSources(candidates),
    input: {
      ...representative.input,
      departureLocation: departure.input.departureLocation,
      arrivalLocation: arrival.input.arrivalLocation,
      carrier: carrier.input.carrier,
      referenceNumber: reference.input.referenceNumber,
      bookingUrl: booking.input.bookingUrl,
    },
  };
}

export function consolidateGmailCandidates(candidates: GmailImportCandidate[]) {
  const groups = new Map<string, GmailImportCandidate[]>();
  for (const candidate of candidates) {
    const key = groupKey(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }

  return [...groups.values()].map((matches): GmailImportCandidate => {
    const stays = matches.filter(
      (candidate): candidate is GmailStayCandidate => candidate.kind === "stay",
    );
    if (stays.length) return consolidateStays(stays);
    return consolidateTravel(matches as GmailTravelCandidate[]);
  });
}

export function relevantGmailCandidates(candidates: GmailImportCandidate[], trip: Trip) {
  return candidates
    .filter((candidate) => isWithinTrip(candidate, trip))
    .sort((left, right) => tripRelevance(right, trip) - tripRelevance(left, trip));
}

export function gmailCandidateSources(candidate: GmailImportCandidate) {
  return candidate.sources ?? [candidate.source];
}
