import {
  createStayInputSchema,
  createTravelInputSchema,
  type GmailImportCandidate,
  type Trip,
} from "@voyage/contracts";
import type { GmailHeader, GmailMessage, GmailMessagePart } from "./gmail-api";

const monthNumbers: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

const ignoredAirportCodes = new Set([
  "AND",
  "THE",
  "FOR",
  "YOU",
  "YOUR",
  "FROM",
  "TO",
  "AM",
  "PM",
  "USD",
  "GATE",
]);

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function header(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectParts(part: GmailMessagePart | undefined, content: Map<string, string[]>) {
  if (!part) return;
  if (part.body?.data && part.mimeType) {
    const values = content.get(part.mimeType) ?? [];
    values.push(decodeBase64Url(part.body.data));
    content.set(part.mimeType, values);
  }
  for (const child of part.parts ?? []) collectParts(child, content);
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
}

function htmlToText(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/p\s*>/gi, "\n")
      .replace(/<\/div\s*>/gi, "\n")
      .replace(/<\/(?:td|th|tr|li)\s*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function senderName(value: string) {
  const name = value
    .replace(/<[^>]+>/g, "")
    .replaceAll('"', "")
    .trim();
  return name || value.trim();
}

function localDateTime(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  return match ? `${match[1]}T${match[2]}:${match[3]}` : null;
}

function dateOnly(value: unknown) {
  if (typeof value !== "string") return null;
  return value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function typeMatches(value: unknown, expected: string) {
  const types = Array.isArray(value) ? value : [value];
  return types.some((type) => typeof type === "string" && type.endsWith(expected));
}

function objects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(objects)];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstRecord(value: unknown) {
  return objects(value)[0] ?? {};
}

function placeLabel(value: unknown) {
  const place = firstRecord(value);
  const code = text(place.iataCode) || text(place.identifier);
  const name = text(place.name);
  return code && name && !name.includes(code) ? `${code} · ${name}` : code || name;
}

function postalAddress(value: unknown) {
  if (typeof value === "string") return value.trim();
  const address = firstRecord(value);
  return [
    text(address.streetAddress),
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.postalCode),
    text(address.addressCountry),
  ]
    .filter(Boolean)
    .join(", ");
}

function structuredNodes(html: string) {
  const nodes: Record<string, unknown>[] = [];
  for (const match of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      nodes.push(...objects(JSON.parse(decodeHtmlEntities(match[1].trim()))));
    } catch {
      // Ignore malformed third-party markup and continue with the visible message text.
    }
  }
  return nodes;
}

function linksFromHtml(html: string) {
  return [...html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((match) => decodeHtmlEntities(match[1]))
    .filter((url) => !/unsubscribe|preferences|privacy|doubleclick|googleadservices/i.test(url));
}

function bookingLink(links: string[], preferred?: unknown) {
  const explicit = text(preferred);
  if (explicit.startsWith("http")) return explicit;
  return (
    links.find(
      (url) =>
        /confirmation|manage|modify|reservation|itinerary|check.?in/i.test(url) &&
        !/^https?:\/\/(?:www\.)?booking\.com\/?$/i.test(url),
    ) ??
    links.find((url) => /booking|reservation|itinerary|manage|check.?in|trip/i.test(url)) ??
    null
  );
}

function isBookingDotCom(subject: string, sender: string) {
  return /booking\.com/i.test(`${subject}\n${sender}`);
}

function cleanBookingProperty(value: string) {
  const cleaned = value
    .replace(/\s+through\s+Booking\.com\s*$/i, "")
    .replace(/^noreply@booking\.com$/i, "")
    .trim();
  return /[A-Za-zÀ-ž]{3}/.test(cleaned) ? cleaned : "";
}

function bookingProperty(subject: string, sender: string, visibleText: string) {
  const subjectMatch = subject.match(
    /(?:booking\s+is\s+confirmed\s+at|booking\s+(?:at|for)|stay\s+at)\s+(.+?)(?:\s*[|–—-]|$)/i,
  )?.[1];
  const bodyMatch = visibleText.match(
    /(?:Thanks[^\n]*Your booking (?:in [^\n]+ )?is confirmed\.?\s*\n+|^)([^\n]{3,160}?)\s+(?:is expecting you|Reservation details)/im,
  )?.[1];
  const senderProperty = cleanBookingProperty(senderName(sender));
  return cleanBookingProperty(subjectMatch ?? senderProperty ?? bodyMatch ?? "");
}

function plausibleAddress(value: string | null | undefined) {
  const address = value?.replace(/\s+/g, " ").trim() ?? "";
  if (address.length < 8 || address.length > 180) return null;
  if (!/\d/.test(address) || !/,/.test(address) || !/[A-Za-zÀ-ž]/.test(address)) return null;
  if (/we(?:'|’)re happy|extra charge|special request|from .+\b(?:am|pm)\b/i.test(address)) {
    return null;
  }
  return address;
}

function bookingAddress(visibleText: string) {
  const labeled = visibleText.match(
    /(?:^|\n)\s*(?:Location|Address)\s*[:,]?\s*\n+\s*([^\n]{8,180})/im,
  )?.[1];
  const checkIn = visibleText.match(/check-in is at\s+([^\n.]{8,180}(?:\.[^\n]{0,20})?)/i)?.[1];
  return plausibleAddress(labeled) ?? plausibleAddress(checkIn);
}

function confirmationNumber(value: string) {
  const urlValue = value.match(/[?&]confirmationNumber=([A-Z0-9]{5,14})/i)?.[1];
  if (urlValue) return urlValue.toUpperCase();

  for (const match of value.matchAll(
    /(?:confirmation|record locator|booking reference|reservation code|confirmation code|PNR)(?:\s+(?:number|no\.?))?\s*[:#-]?\s*([A-Z0-9]{5,14})/gi,
  )) {
    const candidate = match[1].toUpperCase();
    if (candidate !== "HTTP" && candidate !== "HTTPS") return candidate;
  }
  return null;
}

function looksPromotional(subject: string, sender: string) {
  return (
    /\b(deals?|offers?|promo(?:tion)?s?|newsletter|sale|savings?|bonus|free|earn miles?)\b/i.test(
      subject,
    ) || /(?:^|[<@._+-])deals?(?:[>@._+-]|$)/i.test(sender)
  );
}

function normalizedTime(hourValue: string, minuteValue: string, meridiem?: string) {
  let hour = Number(hourValue);
  if (meridiem?.toLowerCase() === "pm" && hour < 12) hour += 12;
  if (meridiem?.toLowerCase() === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minuteValue}`;
}

function namedDateTimes(value: string, fallbackYear?: string) {
  const found: string[] = [];
  const pattern = new RegExp(
    `\\b(${Object.keys(monthNumbers).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ \\t]+(\\d{4}))?(?:[^\\d\\n]{0,20})(\\d{1,2}):(\\d{2})\\s*(am|pm)?`,
    "gi",
  );
  for (const match of value.matchAll(pattern)) {
    const year = match[3] ?? fallbackYear;
    if (!year) continue;
    found.push(
      `${year}-${monthNumbers[match[1].toLowerCase()]}-${match[2].padStart(2, "0")}T${normalizedTime(match[4], match[5], match[6])}`,
    );
  }
  return found;
}

function namedDates(value: string, fallbackYear?: string) {
  const found: string[] = [];
  const pattern = new RegExp(
    `\\b(${Object.keys(monthNumbers).join("|")})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ \\t]+(\\d{4}))?`,
    "gi",
  );
  for (const match of value.matchAll(pattern)) {
    const year = match[3] ?? fallbackYear;
    if (year) {
      found.push(`${year}-${monthNumbers[match[1].toLowerCase()]}-${match[2].padStart(2, "0")}`);
    }
  }
  return [...new Set(found)];
}

function shiftedDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function tripDestination(trip: Trip) {
  return trip.stops.map((stop) => stop.name).join(", ");
}

function stayStopId(trip: Trip, details: string, checkInDate: string | null) {
  const normalizedDetails = details.toLocaleLowerCase();
  const named = [...trip.stops]
    .sort((left, right) => right.name.length - left.name.length)
    .find((stop) => normalizedDetails.includes(stop.name.toLocaleLowerCase()));
  if (named) return named.id;

  if (checkInDate) {
    const dated = trip.stops.find(
      (stop) =>
        (!stop.arrivalDate || stop.arrivalDate <= checkInDate) &&
        (!stop.departureDate || stop.departureDate >= checkInDate),
    );
    if (dated) return dated.id;
  }

  return trip.stops[0]?.id ?? null;
}

function locationTimePairs(value: string) {
  const pairs = new Map<string, { location: string; time: string }>();
  const pattern = /(?:^|\n)\s*([^\n]{2,160}?)\s*\n\s*(\d{1,2}):(\d{2})\s*(am|pm)\b/gi;
  for (const match of value.matchAll(pattern)) {
    const location = match[1].replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]/.test(location)) continue;
    const pair = {
      location,
      time: normalizedTime(match[2], match[3], match[4]),
    };
    pairs.set(`${pair.location.toLowerCase()}|${pair.time}`, pair);
  }
  return [...pairs.values()];
}

function itineraryFlightNumber(value: string) {
  const match = value.match(/(?:^|\n)\s*([A-Z]{2}\s*)?(\d{2,4})\s*\n\s*Operated\b/i);
  if (!match) return null;
  return `${match[1] ?? ""}${match[2]}`.replace(/\s+/g, " ").trim();
}

function airportCodes(value: string) {
  return [...new Set(value.match(/\b[A-Z]{3}\b/g) ?? [])].filter(
    (code) => !ignoredAirportCodes.has(code),
  );
}

function isWithinTrip(value: string, trip: Trip) {
  if (!trip.startDate || !trip.endDate) return true;
  const date = value.slice(0, 10);
  const start = new Date(`${trip.startDate}T00:00:00Z`);
  const end = new Date(`${trip.endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 2);
  end.setUTCDate(end.getUTCDate() + 2);
  return date >= start.toISOString().slice(0, 10) && date <= end.toISOString().slice(0, 10);
}

function sourceFor(
  message: GmailMessage,
  subject: string,
  sender: string,
  keySuffix: string,
  accountEmail?: string,
) {
  const mailbox = accountEmail ? `?authuser=${encodeURIComponent(accountEmail)}` : "u/0/";
  return {
    key: `${message.id}:${keySuffix}`,
    messageId: message.id,
    threadId: message.threadId,
    subject,
    sender,
    receivedAt: message.internalDate
      ? new Date(Number(message.internalDate)).toISOString()
      : new Date(0).toISOString(),
    messageUrl: `https://mail.google.com/mail/${mailbox}#inbox/${message.threadId}`,
  };
}

function extractChaseTravel(
  message: GmailMessage,
  trip: Trip,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  if (!/chasetravel\.com/i.test(sender) || !/\bFlight\s+\d+:/i.test(visibleText)) return [];

  const confirmation =
    visibleText.match(/Airline confirmation\s*:\s*([A-Z0-9]{5,14})/i)?.[1]?.toUpperCase() ??
    confirmationNumber(`${subject}\n${visibleText}`);
  if (!confirmation) return [];

  const routePlaces = [
    ...visibleText.matchAll(/([A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,80})\s+\(([A-Z]{3})\)/g),
  ].map((match) => ({ code: match[2], name: match[1].trim() }));

  const candidates: GmailImportCandidate[] = [];
  const dates = namedDates(visibleText, trip.startDate?.slice(0, 4)).filter((date) =>
    isWithinTrip(`${date}T00:00`, trip),
  );
  const legs = [
    ...visibleText.matchAll(
      /(\d{1,2}):(\d{2})\s*(am|pm)\s+([A-Z]{3})(?:\s+(?:to|--?>))?\s+(\d{1,2}):(\d{2})\s*(am|pm)\s+([A-Z]{3})(\s+Next day arrival)?/gi,
    ),
  ];
  for (const [index, times] of legs.entries()) {
    const date = dates[index] ?? dates[0];
    if (!date) continue;
    const matchStart = times.index ?? 0;
    const nextMatchStart = legs[index + 1]?.index ?? visibleText.length;
    const remainingLeg = visibleText.slice(matchStart, nextMatchStart);
    const fareIndex = remainingLeg.search(/\bFare\s*:/i);
    const block = fareIndex >= 0 ? remainingLeg.slice(0, fareIndex) : remainingLeg;

    const departureTime = normalizedTime(times[1], times[2], times[3]);
    const arrivalTime = normalizedTime(times[5], times[6], times[7]);
    const nextDay = Boolean(times[9]) || arrivalTime < departureTime;
    const departurePlace = routePlaces.find((place) => place.code === times[4].toUpperCase());
    const arrivalPlace = routePlaces.find((place) => place.code === times[8].toUpperCase());
    const references = [
      ...new Set(block.match(/\b[A-Z]{2}\s?\d{2,4}\b/g)?.map((value) => value.trim()) ?? []),
    ];
    const carrier =
      block.match(/([A-Za-z][A-Za-z ]{2,80}(?:Airlines?|Airways?))/i)?.[1] ?? "Chase Travel";
    const input = createTravelInputSchema.safeParse({
      type: "flight",
      status: "booked",
      departureStopId: null,
      arrivalStopId: null,
      departureLocation:
        departurePlace?.code === times[4].toUpperCase()
          ? `${departurePlace.code} · ${departurePlace.name}`
          : times[4].toUpperCase(),
      arrivalLocation:
        arrivalPlace?.code === times[8].toUpperCase()
          ? `${arrivalPlace.code} · ${arrivalPlace.name}`
          : times[8].toUpperCase(),
      departureAt: `${date}T${departureTime}`,
      arrivalAt: `${nextDay ? shiftedDate(date, 1) : date}T${arrivalTime}`,
      carrier: carrier.trim(),
      referenceNumber: references.length ? references.join(" · ") : null,
      confirmationNumber: confirmation,
      bookingUrl: bookingLink(links),
      notes: null,
    });
    if (input.success) {
      candidates.push({
        kind: "travel",
        confidence: "high",
        source: sourceFor(message, subject, sender, `travel:chase:${index}`, accountEmail),
        input: input.data,
      });
    }
  }
  return candidates;
}

function extractStructured(
  message: GmailMessage,
  trip: Trip,
  html: string,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  const candidates: GmailImportCandidate[] = [];
  let index = 0;
  for (const node of structuredNodes(html)) {
    if (typeMatches(node["@type"], "FlightReservation")) {
      const flight = firstRecord(node.reservationFor);
      const input = createTravelInputSchema.safeParse({
        type: "flight",
        status: "booked",
        departureStopId: null,
        arrivalStopId: null,
        departureLocation: placeLabel(flight.departureAirport),
        arrivalLocation: placeLabel(flight.arrivalAirport),
        departureAt: localDateTime(flight.departureTime),
        arrivalAt: localDateTime(flight.arrivalTime),
        carrier: text(firstRecord(flight.airline).name) || null,
        referenceNumber: text(flight.flightNumber) || null,
        confirmationNumber: text(node.reservationNumber) || null,
        bookingUrl: bookingLink(links, node.url ?? node.modifyReservationUrl),
        notes: null,
      });
      if (input.success) {
        candidates.push({
          kind: "travel",
          confidence: "high",
          source: sourceFor(message, subject, sender, `travel:${index++}`, accountEmail),
          input: input.data,
        });
      }
    }

    if (typeMatches(node["@type"], "LodgingReservation")) {
      const lodging = firstRecord(node.reservationFor);
      const bookingProvider = isBookingDotCom(subject, sender);
      const providerProperty = bookingProvider
        ? bookingProperty(subject, sender, visibleText)
        : null;
      const providerAddress = bookingProvider ? bookingAddress(visibleText) : null;
      const propertyName = providerProperty || text(lodging.name);
      const address = providerAddress || postalAddress(lodging.address);
      const checkInDate = dateOnly(node.checkinTime ?? node.checkInTime);
      const input = createStayInputSchema.safeParse({
        status: "booked",
        tripStopId: stayStopId(trip, `${propertyName} ${address}`, checkInDate),
        propertyName,
        address,
        checkInDate,
        checkOutDate: dateOnly(node.checkoutTime ?? node.checkOutTime),
        confirmationNumber: text(node.reservationNumber) || null,
        bookingUrl: bookingLink(links, node.url ?? node.modifyReservationUrl),
        notes: null,
      });
      if (input.success) {
        candidates.push({
          kind: "stay",
          confidence: "high",
          source: sourceFor(message, subject, sender, `stay:${index++}`, accountEmail),
          input: input.data,
        });
      }
    }
  }
  return candidates;
}

function extractHeuristic(
  message: GmailMessage,
  trip: Trip,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  const combined = `${subject}\n${visibleText}`;
  const fallbackYear =
    trip.startDate?.slice(0, 4) ??
    (message.internalDate
      ? new Date(Number(message.internalDate)).getUTCFullYear().toString()
      : undefined);
  const candidates: GmailImportCandidate[] = [];
  const confirmation = confirmationNumber(combined);
  if (looksPromotional(subject, sender)) return candidates;

  if (confirmation && /\b(flight|airlines?|airways?|departure|boarding)\b/i.test(combined)) {
    const codes = airportCodes(combined);
    const dateTimes = namedDateTimes(combined, fallbackYear).filter((value) =>
      isWithinTrip(value, trip),
    );
    const sharedDate = namedDates(combined, fallbackYear).find((value) =>
      isWithinTrip(value, trip),
    );
    const locationTimes = locationTimePairs(combined);
    if (dateTimes.length < 2 && sharedDate && locationTimes.length >= 2) {
      dateTimes.splice(
        0,
        dateTimes.length,
        `${sharedDate}T${locationTimes[0].time}`,
        `${sharedDate}T${locationTimes[1].time}`,
      );
    }
    const flightNumber = combined
      .match(/\b([A-Z0-9]{2})\s?(\d{1,4})\b/)
      ?.slice(1)
      .join(" ");
    const input = createTravelInputSchema.safeParse({
      type: "flight",
      status: "booked",
      departureStopId: null,
      arrivalStopId: null,
      departureLocation: locationTimes[0]?.location ?? codes[0] ?? "",
      arrivalLocation: locationTimes[1]?.location ?? codes[1] ?? "",
      departureAt: dateTimes[0] ?? "",
      arrivalAt: dateTimes[1] ?? null,
      carrier: senderName(sender) || null,
      referenceNumber: itineraryFlightNumber(combined) ?? flightNumber ?? null,
      confirmationNumber: confirmation,
      bookingUrl: bookingLink(links),
      notes: null,
    });
    if (input.success) {
      candidates.push({
        kind: "travel",
        confidence: "medium",
        source: sourceFor(message, subject, sender, "travel:heuristic", accountEmail),
        input: input.data,
      });
    }
  }

  if (
    confirmation &&
    /\b(hotel|lodging|accommodation|check[ -]?in|check[ -]?out)\b/i.test(combined)
  ) {
    const dates = namedDates(combined, fallbackYear).filter((value) => isWithinTrip(value, trip));
    const bookingProvider = isBookingDotCom(subject, sender);
    const property = bookingProvider
      ? bookingProperty(subject, sender, visibleText)
      : (subject.match(/(?:reservation|booking|stay)\s+(?:at|for)\s+(.+?)(?:\s*[|–—-]|$)/i)?.[1] ??
        senderName(sender));
    const address =
      (bookingProvider ? bookingAddress(visibleText) : null) ??
      visibleText.match(
        /\b\d{1,6}\s+[A-Za-z0-9 .'-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way)\b[^\n]*/i,
      )?.[0] ??
      tripDestination(trip);
    const checkInDate = dates[0] ?? "";
    const input = createStayInputSchema.safeParse({
      status: "booked",
      tripStopId: stayStopId(trip, `${property} ${address}`, checkInDate),
      propertyName: property,
      address,
      checkInDate,
      checkOutDate: dates[1] ?? "",
      confirmationNumber: confirmation,
      bookingUrl: bookingLink(links),
      notes: null,
    });
    if (input.success) {
      candidates.push({
        kind: "stay",
        confidence: "medium",
        source: sourceFor(message, subject, sender, "stay:heuristic", accountEmail),
        input: input.data,
      });
    }
  }

  return candidates;
}

export function extractGmailCandidates(message: GmailMessage, trip: Trip, accountEmail?: string) {
  const content = new Map<string, string[]>();
  collectParts(message.payload, content);
  const html = (content.get("text/html") ?? []).join("\n");
  const plain = (content.get("text/plain") ?? []).join("\n");
  const subject = header(message.payload?.headers, "subject");
  const sender = header(message.payload?.headers, "from");
  const links = linksFromHtml(html);
  const visibleText = `${plain}\n${htmlToText(html)}`;
  const chaseTravel = extractChaseTravel(
    message,
    trip,
    subject,
    sender,
    visibleText,
    links,
    accountEmail,
  );
  if (chaseTravel.length > 0) return chaseTravel;
  const structured = extractStructured(
    message,
    trip,
    html,
    subject,
    sender,
    visibleText,
    links,
    accountEmail,
  );

  if (structured.length > 0) return structured;
  return extractHeuristic(message, trip, subject, sender, visibleText, links, accountEmail);
}
