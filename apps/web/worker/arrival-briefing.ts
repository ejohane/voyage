import type {
  Airport,
  ArrivalBriefingSection,
  BriefingFlightArrivalItem,
  BriefingIssue,
  BriefingRentalPickupItem,
  BriefingStayArrivalItem,
  Stay,
  Travel,
  Trip,
} from "@voyage/contracts";

export type ArrivalBriefingResult = {
  sections: ArrivalBriefingSection[];
  issues: BriefingIssue[];
};

export const arrivalBriefingGeneratorVersion = "arrival-v1";

type BuildArrivalBriefingInput = {
  trip: Trip;
  travel: Travel[];
  stays: Stay[];
};

type AirportResolver = (iataCode: string) => Promise<Airport | null>;

const oneDayMilliseconds = 24 * 60 * 60 * 1_000;

function localDate(value: string) {
  return value.slice(0, 10);
}

function dayNumber(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function localDateTimeNumber(value: string) {
  const [date, time] = value.split("T");
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

function issue(code: BriefingIssue["code"], suffix: string): BriefingIssue {
  return {
    id: `arrival-issue:${code}:${suffix}`,
    code,
    provenance: "needs_attention",
  };
}

function flightItem(flight: Travel): BriefingFlightArrivalItem {
  const airport = flight.arrivalAirport;
  if (!flight.arrivalAt || !airport) throw new Error("Arrival flight is incomplete.");
  return {
    id: `arrival-flight:${flight.id}`,
    kind: "flight_arrival",
    provenance: "booked",
    sourceTravelId: flight.id,
    arrivalAt: flight.arrivalAt,
    airport: {
      id: airport.id,
      iataCode: airport.iataCode,
      name: airport.name,
      municipality: airport.municipality,
      latitude: airport.latitude,
      longitude: airport.longitude,
    },
    carrier: flight.carrier,
    referenceNumber: flight.referenceNumber,
  };
}

function rentalItem(rental: Travel): BriefingRentalPickupItem {
  return {
    id: `arrival-rental:${rental.id}`,
    kind: "rental_pickup",
    provenance: "booked",
    sourceTravelId: rental.id,
    pickupAt: rental.departureAt,
    pickupLocation: rental.departureLocation,
    company: rental.carrier,
    confirmationNumber: rental.confirmationNumber,
  };
}

function stayItem(stay: Stay): BriefingStayArrivalItem {
  return {
    id: `arrival-stay:${stay.id}`,
    kind: "stay_arrival",
    provenance: "booked",
    sourceStayId: stay.id,
    propertyName: stay.propertyName,
    address: stay.address,
    checkInDate: stay.checkInDate,
    checkInWindow: stay.bookingDetails?.checkInWindow ?? null,
  };
}

function isPlaceholderAddress(value: string) {
  return ["tbd", "unknown", "not set", "n/a", "na"].includes(value.trim().toLocaleLowerCase());
}

function normalized(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
}

function legacyIataCode(location: string) {
  const candidates = [
    location.match(/^\s*([A-Za-z]{3})\s*(?:[·•|]|[-–—])\s*/)?.[1],
    location.match(/\(([A-Za-z]{3})\)\s*$/)?.[1],
    location.match(/^\s*([A-Za-z]{3})\s*$/)?.[1],
  ]
    .filter((candidate): candidate is string => candidate !== undefined)
    .map((candidate) => candidate.toUpperCase());
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

export async function resolveLegacyArrivalAirports(
  travel: Travel[],
  resolveAirport: AirportResolver,
): Promise<Travel[]> {
  const resolvedByCode = new Map<string, Airport | null>();

  return Promise.all(
    travel.map(async (segment) => {
      if (segment.type !== "flight" || segment.arrivalAirport) return segment;
      const code = legacyIataCode(segment.arrivalLocation);
      if (!code) return segment;

      let airport = resolvedByCode.get(code);
      if (airport === undefined) {
        airport = await resolveAirport(code);
        resolvedByCode.set(code, airport);
      }
      if (!airport) return segment;

      return {
        ...segment,
        arrivalAirportId: airport.id,
        arrivalAirport: airport,
      };
    }),
  );
}

function rentalMatchesArrival(rental: Travel, flight: Travel, stay: Stay) {
  if (rental.departureAirportId && rental.departureAirportId === flight.arrivalAirportId)
    return true;
  if (rental.departureStopId && rental.departureStopId !== stay.tripStopId) return false;

  const airport = flight.arrivalAirport;
  if (!airport) return false;
  const pickup = normalized(rental.departureLocation);
  const iata = airport.iataCode.toLocaleLowerCase();
  const municipality = normalized(airport.municipality ?? "");
  return (
    pickup.includes(iata) ||
    (pickup.includes("airport") && municipality.length >= 3 && pickup.includes(municipality))
  );
}

function matchingRental(flight: Travel, stay: Stay, travel: Travel[]) {
  if (!flight.arrivalAt) return null;
  const arrival = localDateTimeNumber(flight.arrivalAt);
  const candidates = travel.filter((candidate) => {
    if (candidate.kind !== "rental" || candidate.status !== "booked") return false;
    const pickup = localDateTimeNumber(candidate.departureAt);
    return (
      pickup >= arrival &&
      pickup <= arrival + oneDayMilliseconds &&
      rentalMatchesArrival(candidate, flight, stay)
    );
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function candidateFlights(travel: Travel[], firstStayDate: string, firstStayStopIDs: Set<string>) {
  const stayDay = dayNumber(firstStayDate);
  const candidates = travel.filter((candidate) => {
    if (
      candidate.kind !== "journey" ||
      candidate.type !== "flight" ||
      candidate.status !== "booked" ||
      !candidate.arrivalAt ||
      !candidate.arrivalAirport
    ) {
      return false;
    }
    const arrivalDay = dayNumber(localDate(candidate.arrivalAt));
    return arrivalDay >= stayDay - oneDayMilliseconds && arrivalDay <= stayDay;
  });
  const strong = candidates.filter(
    (candidate) => candidate.arrivalStopId && firstStayStopIDs.has(candidate.arrivalStopId),
  );
  return strong.length > 0 ? strong : candidates;
}

export async function buildArrivalBriefing({
  travel,
  stays,
}: BuildArrivalBriefingInput): Promise<ArrivalBriefingResult> {
  const bookedStays = stays
    .filter((stay) => stay.status === "booked")
    .sort((left, right) =>
      left.checkInDate === right.checkInDate
        ? left.createdAt.localeCompare(right.createdAt)
        : left.checkInDate.localeCompare(right.checkInDate),
    );
  const firstStayDate = bookedStays[0]?.checkInDate;
  if (!firstStayDate) return { sections: [], issues: [] };

  const firstStays = bookedStays.filter((stay) => stay.checkInDate === firstStayDate);
  const firstStayStopIDs = new Set(
    firstStays.flatMap((stay) => (stay.tripStopId ? [stay.tripStopId] : [])),
  );
  const flights = candidateFlights(travel, firstStayDate, firstStayStopIDs);
  if (flights.length === 0) return { sections: [], issues: [] };
  if (flights.length > 1) {
    return {
      sections: [],
      issues: [
        issue(
          "ambiguous_flight",
          flights
            .map((flight) => flight.id)
            .sort()
            .join(":"),
        ),
      ],
    };
  }

  const flight = flights[0];
  const arrivalAt = flight.arrivalAt;
  if (!arrivalAt) return { sections: [], issues: [] };
  const items: ArrivalBriefingSection["items"] = [flightItem(flight)];
  const sectionIssues: BriefingIssue[] = [];

  if (firstStays.length > 1) {
    sectionIssues.push(
      issue(
        "ambiguous_stay",
        firstStays
          .map((stay) => stay.id)
          .sort()
          .join(":"),
      ),
    );
  } else {
    const stay = firstStays[0];
    const rental = matchingRental(flight, stay, travel);
    if (rental) items.push(rentalItem(rental));

    if (isPlaceholderAddress(stay.address)) {
      sectionIssues.push(issue("stay_location_unresolved", stay.id));
    }
    items.push(stayItem(stay));
  }

  return {
    sections: [
      {
        id: `arrival:${flight.id}:${firstStayDate}`,
        kind: "arrival",
        date: localDate(arrivalAt),
        items,
        issues: sectionIssues,
      },
    ],
    issues: [],
  };
}
