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

function removeObsoleteHtml(html: string) {
  return html
    .replace(/<(?:s|del)\b[^>]*>[\s\S]*?<\/(?:s|del)>/gi, " ")
    .replace(
      /<([a-z][a-z0-9]*)\b[^>]*style=["'][^"']*text-decoration[^"']*line-through[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    );
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

function rentalPlaceLabel(value: unknown) {
  const place = firstRecord(value);
  const name = text(place.name);
  const address = postalAddress(place.address);
  if (name && address && !name.toLocaleLowerCase().includes(address.toLocaleLowerCase())) {
    return `${name} · ${address}`;
  }
  return name || address;
}

function rentalVehicleDescription(value: unknown) {
  const vehicle = firstRecord(value);
  const brand = text(firstRecord(vehicle.brand).name);
  const model = text(vehicle.model);
  const name = text(vehicle.name);
  const description = text(vehicle.description);
  const values = [name, [brand, model].filter(Boolean).join(" "), description].filter(Boolean);
  return [...new Map(values.map((item) => [item.toLocaleLowerCase(), item])).values()]
    .join(" · ")
    .slice(0, 200);
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

function microdataValues(html: string, property: string) {
  const values: string[] = [];
  for (const match of html.matchAll(/<[a-z][a-z0-9-]*\b([^>]*)>/gi)) {
    const attributes = match[1];
    const itemprop = attributes.match(/\bitemprop=["']([^"']+)["']/i)?.[1] ?? "";
    if (!itemprop.split(/\s+/).includes(property)) continue;
    const value =
      attributes.match(/\bcontent=["']([^"']*)["']/i)?.[1] ??
      attributes.match(/\bhref=["']([^"']*)["']/i)?.[1] ??
      attributes.match(/\bdatetime=["']([^"']*)["']/i)?.[1];
    if (value) values.push(decodeHtmlEntities(value).trim());
  }
  return values;
}

function microdataSection(html: string, property: string, until?: string) {
  const start = html.search(new RegExp(`\\bitemprop=["'][^"']*\\b${property}\\b[^"']*["']`, "i"));
  if (start < 0) return "";
  if (!until) return html.slice(start);
  const remainder = html.slice(start + 1);
  const end = remainder.search(new RegExp(`\\bitemprop=["'][^"']*\\b${until}\\b[^"']*["']`, "i"));
  return end < 0 ? html.slice(start) : html.slice(start, start + 1 + end);
}

function microdataRentalNodes(html: string): Record<string, unknown>[] {
  if (!/itemtype=["'][^"']*RentalCarReservation["']/i.test(html)) return [];
  const vehicleSection = microdataSection(html, "reservationFor", "pickupLocation");
  const pickupSection = microdataSection(html, "pickupLocation", "pickupTime");
  const returnSection = microdataSection(html, "dropoffLocation", "dropoffTime");
  const vehicleNames = microdataValues(vehicleSection, "name");
  const pickupNames = microdataValues(pickupSection, "name");
  const returnNames = microdataValues(returnSection, "name");
  const address = (section: string) => ({
    "@type": "PostalAddress",
    streetAddress: microdataValues(section, "streetAddress")[0],
    addressLocality: microdataValues(section, "addressLocality")[0],
    addressRegion: microdataValues(section, "addressRegion")[0],
    postalCode: microdataValues(section, "postalCode")[0],
    addressCountry: microdataValues(section, "addressCountry")[0],
  });
  return [
    {
      "@type": "RentalCarReservation",
      reservationNumber: microdataValues(html, "reservationNumber")[0],
      reservationStatus: microdataValues(html, "reservationStatus")[0],
      url: microdataValues(html, "url")[0],
      modifyReservationUrl: microdataValues(html, "modifyReservationUrl")[0],
      pickupTime: microdataValues(html, "pickupTime")[0],
      dropoffTime: microdataValues(html, "dropoffTime")[0],
      pickupLocation: {
        "@type": "Place",
        name: pickupNames[0],
        address: address(pickupSection),
      },
      dropoffLocation: {
        "@type": "Place",
        name: returnNames[0],
        address: address(returnSection),
      },
      reservationFor: {
        "@type": "RentalCar",
        name: vehicleNames[0],
        model: microdataValues(vehicleSection, "model")[0],
        description: microdataValues(vehicleSection, "description")[0],
        brand: { "@type": "Brand", name: vehicleNames[1] },
        rentalCompany: { "@type": "Organization", name: vehicleNames.at(-1) },
      },
    },
  ];
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
    links.find((url) =>
      /(?:cars\.booking\.com\/my-booking|rentalcars\.com\/(?:[^?#]+\/)?(?:manage|booking|reservation))/i.test(
        url,
      ),
    ) ??
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
    /(?:confirmation|record locator|booking(?:\s+(?:reference|number|no\.?))|reservation(?:\s+(?:code|reference|number|no\.?|id))|confirmation code|PNR)(?:\s+(?:number|no\.?))?\s*[:#-]?\s*([A-Z0-9]{5,14})/gi,
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

function dayMonthDateTimes(value: string, fallbackYear?: string) {
  const found: string[] = [];
  const pattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\t]+(${Object.keys(monthNumbers).join("|")})(?:,?[ \\t]+(\\d{4}))?(?:[^\\d\\n]{0,20})(\\d{1,2})[:.](\\d{2})\\s*(am|pm)?`,
    "gi",
  );
  for (const match of value.matchAll(pattern)) {
    const year = match[3] ?? fallbackYear;
    if (!year) continue;
    found.push(
      `${year}-${monthNumbers[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}T${normalizedTime(match[4], match[5], match[6])}`,
    );
  }
  return found;
}

function numericDateTimes(value: string) {
  const found: string[] = [];
  for (const match of value.matchAll(
    /\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})(?:[^\d\n]{0,20})(\d{1,2})[:.](\d{2})\s*(am|pm)?/gi,
  )) {
    found.push(
      `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${normalizedTime(match[4], match[5], match[6])}`,
    );
  }
  return found;
}

function allDateTimes(value: string, fallbackYear?: string) {
  return [
    ...namedDateTimes(value, fallbackYear),
    ...dayMonthDateTimes(value, fallbackYear),
    ...numericDateTimes(value),
  ];
}

function labeledSection(value: string, labels: RegExp) {
  const lines = value
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const index = lines.findIndex((line) => labels.test(line));
  if (index < 0) return "";
  const sameLine = lines[index]
    .replace(labels, "")
    .replace(/^\s*[:\-–—]\s*/, "")
    .trim();
  return [sameLine, ...lines.slice(index + 1, index + 6)].filter(Boolean).join("\n");
}

function firstLocationLine(section: string) {
  return (
    section
      .split("\n")
      .map((line) => line.trim())
      .find(
        (line) =>
          /[A-Za-zÀ-ž]{2}/.test(line) &&
          !allDateTimes(line).length &&
          !/\b(?:mon|tue|wed|thu|fri|sat|sun)(?:day)?\b/i.test(line) &&
          !/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(line) &&
          !/^(?:date|time|telephone|phone|hours?)\b/i.test(line) &&
          !/^(?:pick[ -]?up|drop[ -]?off|return)(?:\s*\/\s*(?:pick[ -]?up|drop[ -]?off|return))?(?:\s+(?:location|date|time|details?))?\s*:?$/i.test(
            line,
          ),
      ) ?? ""
  );
}

function cleanVehicleDescription(value: string) {
  const cleaned = value
    .replace(/^\s*(?:vehicle|car|vehicle\s+class|car\s+class|car\s+category)\s*[:\-–—]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (
    !cleaned ||
    /^(?:hire charge|car hire charge|car confirmation|rental charge|payment|price|total|\d+\s+days?)$/i.test(
      cleaned,
    )
  ) {
    return "";
  }
  return cleaned.length <= 120 ? cleaned : "";
}

function bookingRentalVehicle(visibleText: string) {
  const lineMatch = visibleText.match(
    /(?:^|\n)\s*(?:vehicle\s*:?\s*)?([^\n]{2,70}?\bor similar)\b(?:\s+(Automatic|Manual)(?:\s+(gearbox|transmission))?)?/im,
  );
  const compactMatch = visibleText.match(
    /\b((?:[A-Z0-9][A-Za-zÀ-ž0-9.'+-]*\s+){1,4}or similar)\s+(Automatic|Manual)(?:\s+(gearbox|transmission))?/,
  );
  const match = lineMatch ?? compactMatch;
  if (!match) return "";

  const model = cleanVehicleDescription(match[1]).replace(/^(?:your|a|the)\s+/i, "");
  if (!model) return "";
  const transmission = match[2]
    ? `${match[2][0].toUpperCase()}${match[2].slice(1).toLowerCase()} ${match[3]?.toLowerCase() ?? "transmission"}`
    : "";
  return [model, transmission].filter(Boolean).join(" · ");
}

function rentalEventType(subject: string, visibleText: string, reservationStatus?: unknown) {
  const status = text(reservationStatus);
  if (/cancel(?:led|ed|ation)/i.test(`${status}\n${subject}`)) return "cancellation" as const;
  if (/\b(?:modified|updated|changed|amended)\b/i.test(subject)) return "modification" as const;
  if (
    /\b(?:reservation|booking)\s+(?:has been|was)\s+(?:modified|updated|changed)\b/i.test(
      visibleText,
    )
  ) {
    return "modification" as const;
  }
  return "confirmation" as const;
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

function dayMonthDates(value: string, fallbackYear?: string) {
  const found: string[] = [];
  const pattern = new RegExp(
    `\\b(\\d{1,2})(?:st|nd|rd|th)?[ \\t]+(${Object.keys(monthNumbers).join("|")})(?:,?[ \\t]+(\\d{4}))?`,
    "gi",
  );
  for (const match of value.matchAll(pattern)) {
    const year = match[3] ?? fallbackYear;
    if (year) {
      found.push(`${year}-${monthNumbers[match[2].toLowerCase()]}-${match[1].padStart(2, "0")}`);
    }
  }
  return [...new Set(found)];
}

function shortDateRanges(value: string, fallbackYear?: string) {
  const found: [string, string][] = [];
  const pattern = new RegExp(
    `\\b(${Object.keys(monthNumbers).join("|")})[ \\t]+(\\d{1,2})(?:st|nd|rd|th)?[ \\t]*(?:–|—|-|to)[ \\t]*(\\d{1,2})(?:st|nd|rd|th)?(?:,?[ \\t]+(\\d{4}))?`,
    "gi",
  );
  for (const match of value.matchAll(pattern)) {
    const year = match[4] ?? fallbackYear;
    if (!year) continue;
    const month = monthNumbers[match[1].toLowerCase()];
    found.push([
      `${year}-${month}-${match[2].padStart(2, "0")}`,
      `${year}-${month}-${match[3].padStart(2, "0")}`,
    ]);
  }
  return found;
}

function numericDates(value: string) {
  const found: string[] = [];
  for (const match of value.matchAll(/\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2})\b/g)) {
    found.push(`${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`);
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
      kind: "journey",
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
      vehicleDescription: null,
      confirmationNumber: confirmation,
      bookingUrl: bookingLink(links),
      notes: null,
    });
    if (input.success) {
      candidates.push({
        kind: "travel",
        confidence: "high",
        eventType: "confirmation",
        source: sourceFor(message, subject, sender, `travel:chase:${index}`, accountEmail),
        input: input.data,
      });
    }
  }
  return candidates;
}

function extractBookingDotComFlight(
  message: GmailMessage,
  trip: Trip,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  if (!isBookingDotCom(subject, sender) || !/\bflight\b/i.test(`${subject}\n${visibleText}`)) {
    return [];
  }
  const route = visibleText.match(
    /([A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,80})\s*\(([A-Z]{3})\)\s*(?:to|[–—-])\s*([A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{1,80})\s*\(([A-Z]{3})\)/i,
  );
  const confirmation = confirmationNumber(`${subject}\n${visibleText}`);
  const dateTimes = namedDateTimes(visibleText, trip.startDate?.slice(0, 4)).filter((value) =>
    isWithinTrip(value, trip),
  );
  const flight = visibleText.match(
    /(?:^|\n)\s*([A-Za-zÀ-ž][A-Za-zÀ-ž .'-]{2,80})\s*[·•]\s*([A-Z][A-Z0-9]\s?\d{1,4})\b/im,
  );
  if (!route || !confirmation || dateTimes.length < 2) return [];
  const input = createTravelInputSchema.safeParse({
    kind: "journey",
    type: "flight",
    status: "booked",
    departureStopId: null,
    arrivalStopId: null,
    departureLocation: `${route[2].toUpperCase()} · ${route[1].trim()}`,
    arrivalLocation: `${route[4].toUpperCase()} · ${route[3].trim()}`,
    departureAt: dateTimes[0],
    arrivalAt: dateTimes[1],
    carrier: flight?.[1]?.trim() ?? "Booking.com Flights",
    referenceNumber: flight?.[2]?.replace(/\s+/g, "") ?? null,
    vehicleDescription: null,
    confirmationNumber: confirmation,
    bookingUrl: bookingLink(links),
    notes: null,
  });
  if (!input.success) return [];
  return [
    {
      kind: "travel" as const,
      confidence: "high" as const,
      eventType: "confirmation" as const,
      source: sourceFor(message, subject, sender, "travel:booking-flight", accountEmail),
      input: input.data,
    },
  ];
}

function extractFlightScheduleChange(
  message: GmailMessage,
  trip: Trip,
  html: string,
  subject: string,
  sender: string,
  links: string[],
  accountEmail?: string,
) {
  const originalText = htmlToText(html);
  const combined = `${subject}\n${originalText}`;
  if (!/\b(?:time change|schedule change|reschedul(?:e|ed|ing))\b/i.test(combined)) return [];
  const confirmation = confirmationNumber(combined);
  if (!confirmation) return [];
  const currentText = htmlToText(removeObsoleteHtml(html));
  const fallbackYear = trip.startDate?.slice(0, 4);
  const date = [
    ...dayMonthDates(currentText, fallbackYear),
    ...namedDates(currentText, fallbackYear),
  ].find((value) => isWithinTrip(`${value}T00:00`, trip));
  const times = [...currentText.matchAll(/\b(\d{1,2})[.:](\d{2})h?\b/g)].map((match) =>
    normalizedTime(match[1], match[2]),
  );
  const departure = currentText.match(/(?:^|\s)([A-Z][A-Za-zÀ-ž .'-]{1,40})\s+Departure\b/)?.[1];
  const arrival = currentText.match(/(?:^|\s)([A-Z][A-Za-zÀ-ž .'-]{1,40})\s+Arrival\b/)?.[1];
  const flightNumber = currentText.match(/\b([A-Z][A-Z0-9]\s?\d{1,4})\b/)?.[1];
  if (!date || times.length < 2 || !departure || !arrival) return [];
  const input = createTravelInputSchema.safeParse({
    kind: "journey",
    type: "flight",
    status: "booked",
    departureStopId: null,
    arrivalStopId: null,
    departureLocation: departure.trim(),
    arrivalLocation: arrival.trim(),
    departureAt: `${date}T${times[0]}`,
    arrivalAt: `${date}T${times[1]}`,
    carrier: /\bVolotea\b/i.test(currentText) ? "Volotea" : senderName(sender),
    referenceNumber: flightNumber?.replace(/\s+/g, "") ?? null,
    vehicleDescription: null,
    confirmationNumber: confirmation,
    bookingUrl: bookingLink(links),
    notes: null,
  });
  if (!input.success) return [];
  return [
    {
      kind: "travel" as const,
      confidence: "high" as const,
      eventType: "schedule_change" as const,
      source: sourceFor(message, subject, sender, "travel:schedule-change", accountEmail),
      input: input.data,
    },
  ];
}

function extractProviderStay(
  message: GmailMessage,
  trip: Trip,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  const combined = `${subject}\n${visibleText}`;
  const isAirbnb =
    /airbnb/i.test(`${subject}\n${sender}`) &&
    /(?:reservation|booking|check[ -]?in)/i.test(combined);
  const isVoi =
    /voihotels|voi colonna|voi hotels/i.test(`${subject}\n${sender}`) &&
    /(?:reservation|booking|confirmed|check[ -]?in)/i.test(combined);
  if (!isAirbnb && !isVoi) return [];

  const fallbackYear =
    trip.startDate?.slice(0, 4) ??
    (message.internalDate
      ? new Date(Number(message.internalDate)).getUTCFullYear().toString()
      : undefined);
  const range = shortDateRanges(combined, fallbackYear).find(
    ([start, end]) => isWithinTrip(`${start}T00:00`, trip) || isWithinTrip(`${end}T00:00`, trip),
  );
  const dates = [
    ...numericDates(combined),
    ...dayMonthDates(combined, fallbackYear),
    ...namedDates(combined, fallbackYear),
  ].filter((value) => isWithinTrip(`${value}T00:00`, trip));
  const checkInDate = range?.[0] ?? dates[0];
  const checkOutDate = range?.[1] ?? dates.find((date) => date > (checkInDate ?? ""));
  if (!checkInDate || !checkOutDate) return [];

  const property = (
    isAirbnb
      ? subject.match(
          /(?:reservation|booking)\s+for\s+(.+?)(?:\s+by\s+[^,]+)?\s*,\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
        )?.[1]
      : subject.match(/reservation\s+at\s+(.+?)\s+is\s+confirmed/i)?.[1]
  )?.trim();
  const bodyProperty = visibleText.match(
    /(?:Property|Hotel|Accommodation)\s*[:\n]+\s*([^\n]{3,120})/i,
  )?.[1];
  const providerAddress =
    (isVoi && /\bGolfo Aranci\b/i.test(visibleText)
      ? "Golfo Aranci, Sardinia, Italy"
      : bookingAddress(visibleText)) ??
    visibleText.match(
      /\b\d{1,6}\s+[A-Za-zÀ-ž0-9 .'-]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Via|Viale|Località|Loc\.)\b[^\n]*/i,
    )?.[0];
  const address =
    providerAddress && !/888\s+Brannan|San Francisco,?\s+CA\s+94103/i.test(providerAddress)
      ? providerAddress
      : tripDestination(trip);
  const confirmation =
    (isVoi ? visibleText.match(/VOIhotels\s*-\s*([A-Z0-9]{8,20})/i)?.[1]?.toUpperCase() : null) ??
    (isAirbnb ? null : confirmationNumber(combined));
  const input = createStayInputSchema.safeParse({
    status: "booked",
    tripStopId: stayStopId(trip, `${property ?? bodyProperty ?? ""} ${address}`, checkInDate),
    propertyName: property ?? bodyProperty ?? senderName(sender),
    address,
    checkInDate,
    checkOutDate,
    confirmationNumber: confirmation,
    bookingUrl: bookingLink(links),
    notes: null,
  });
  if (!input.success) return [];
  return [
    {
      kind: "stay" as const,
      confidence: confirmation ? ("high" as const) : ("medium" as const),
      eventType: "confirmation" as const,
      source: sourceFor(
        message,
        subject,
        sender,
        isAirbnb ? "stay:airbnb" : "stay:voi",
        accountEmail,
      ),
      input: input.data,
    },
  ];
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
  for (const node of [...structuredNodes(html), ...microdataRentalNodes(html)]) {
    if (typeMatches(node["@type"], "FlightReservation")) {
      const flight = firstRecord(node.reservationFor);
      const input = createTravelInputSchema.safeParse({
        kind: "journey",
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
        vehicleDescription: null,
        confirmationNumber: text(node.reservationNumber) || null,
        bookingUrl: bookingLink(links, node.url ?? node.modifyReservationUrl),
        notes: null,
      });
      if (input.success) {
        candidates.push({
          kind: "travel",
          confidence: "high",
          eventType: "confirmation",
          source: sourceFor(message, subject, sender, `travel:${index++}`, accountEmail),
          input: input.data,
        });
      }
    }

    if (typeMatches(node["@type"], "RentalCarReservation")) {
      const vehicle = firstRecord(node.reservationFor);
      const pickupAt = localDateTime(node.pickupTime);
      const returnAt = localDateTime(node.dropoffTime);
      const pickupLocation = rentalPlaceLabel(node.pickupLocation);
      const returnLocation = rentalPlaceLabel(node.dropoffLocation);
      const provider =
        text(firstRecord(vehicle.rentalCompany).name) ||
        text(firstRecord(node.provider).name) ||
        senderName(sender);
      const input = createTravelInputSchema.safeParse({
        kind: "rental",
        type: "car",
        status: "booked",
        departureStopId: stayStopId(trip, pickupLocation, pickupAt?.slice(0, 10) ?? null),
        arrivalStopId: stayStopId(trip, returnLocation, returnAt?.slice(0, 10) ?? null),
        departureLocation: pickupLocation,
        arrivalLocation: returnLocation,
        departureAt: pickupAt,
        arrivalAt: returnAt,
        carrier: provider || null,
        referenceNumber: null,
        vehicleDescription: rentalVehicleDescription(vehicle) || null,
        confirmationNumber: text(node.reservationNumber ?? node.reservationId) || null,
        bookingUrl: bookingLink(links, node.url ?? node.modifyReservationUrl),
        notes: null,
      });
      if (input.success) {
        candidates.push({
          kind: "travel",
          confidence: "high",
          eventType: rentalEventType(subject, visibleText, node.reservationStatus),
          source: sourceFor(message, subject, sender, `rental:${index++}`, accountEmail),
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
          eventType: "confirmation",
          source: sourceFor(message, subject, sender, `stay:${index++}`, accountEmail),
          input: input.data,
        });
      }
    }
  }
  return candidates;
}

function extractHeuristicRental(
  message: GmailMessage,
  trip: Trip,
  subject: string,
  sender: string,
  visibleText: string,
  links: string[],
  accountEmail?: string,
) {
  const combined = `${subject}\n${visibleText}`;
  if (
    !/\b(?:car|vehicle|auto)\s+(?:rental|hire)\b|\b(?:rental|hire)\s+car\b|\brent-a-car\b/i.test(
      combined,
    ) ||
    looksPromotional(subject, sender)
  ) {
    return [];
  }

  const pickup = labeledSection(
    visibleText,
    /^(?:pick[ -]?up|collect(?:ion)?)(?:\s+(?:location|date|time|details?))?\b/i,
  );
  const dropoff = labeledSection(
    visibleText,
    /^(?:drop[ -]?off|return)(?:\s+(?:location|date|time|details?))?\b/i,
  );
  if (!pickup || !dropoff) return [];

  const fallbackYear =
    trip.startDate?.slice(0, 4) ??
    (message.internalDate
      ? new Date(Number(message.internalDate)).getUTCFullYear().toString()
      : undefined);
  const pickupAt = allDateTimes(pickup, fallbackYear)[0];
  const returnAt = allDateTimes(dropoff, fallbackYear)[0];
  const pickupLocation = firstLocationLine(pickup);
  const returnLocation = firstLocationLine(dropoff);
  const companySection = labeledSection(
    visibleText,
    /^(?:rental\s+company|supplier|provider|company)\b/i,
  );
  const vehicleSection = labeledSection(
    visibleText,
    /^(?:vehicle|car|vehicle\s+class|car\s+class|car\s+category)\b/i,
  );
  const provider = firstLocationLine(companySection) || senderName(sender);
  const vehicleDescription =
    (isBookingDotCom(subject, sender) ? bookingRentalVehicle(visibleText) : "") ||
    cleanVehicleDescription(firstLocationLine(vehicleSection));
  const input = createTravelInputSchema.safeParse({
    kind: "rental",
    type: "car",
    status: "booked",
    departureStopId: stayStopId(trip, pickupLocation, pickupAt?.slice(0, 10) ?? null),
    arrivalStopId: stayStopId(trip, returnLocation, returnAt?.slice(0, 10) ?? null),
    departureLocation: pickupLocation,
    arrivalLocation: returnLocation,
    departureAt: pickupAt ?? "",
    arrivalAt: returnAt ?? null,
    carrier: provider || null,
    referenceNumber: null,
    vehicleDescription: vehicleDescription || null,
    confirmationNumber: confirmationNumber(combined),
    bookingUrl: bookingLink(links),
    notes: null,
  });
  if (!input.success) return [];
  return [
    {
      kind: "travel" as const,
      confidence: input.data.confirmationNumber ? ("high" as const) : ("medium" as const),
      eventType: rentalEventType(subject, visibleText),
      source: sourceFor(message, subject, sender, "rental:heuristic", accountEmail),
      input: input.data,
    },
  ];
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

  const rental = extractHeuristicRental(
    message,
    trip,
    subject,
    sender,
    visibleText,
    links,
    accountEmail,
  );
  if (rental.length) return rental;

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
      kind: "journey",
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
      vehicleDescription: null,
      confirmationNumber: confirmation,
      bookingUrl: bookingLink(links),
      notes: null,
    });
    if (input.success) {
      candidates.push({
        kind: "travel",
        confidence: "medium",
        eventType: "confirmation",
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
        eventType: "confirmation",
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
  const scheduleChange = extractFlightScheduleChange(
    message,
    trip,
    html,
    subject,
    sender,
    links,
    accountEmail,
  );
  if (scheduleChange.length > 0) return scheduleChange;
  const providerStay = extractProviderStay(
    message,
    trip,
    subject,
    sender,
    visibleText,
    links,
    accountEmail,
  );
  if (providerStay.length > 0) return providerStay;
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
  const bookingFlight = extractBookingDotComFlight(
    message,
    trip,
    subject,
    sender,
    visibleText,
    links,
    accountEmail,
  );
  if (bookingFlight.length > 0) return bookingFlight;
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
