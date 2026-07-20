import type { Trip } from "@voyage/contracts";

type Fetcher = typeof fetch;

export type GmailHeader = { name: string; value: string };
export type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string };
  parts?: GmailMessagePart[];
};

export type GmailMessage = {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailMessagePart;
};

type GmailMessageList = {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

type GmailAttachment = {
  data?: string;
};

const SEARCH_WINDOW_MONTHS = 3;
const MESSAGE_READ_BUDGET = 100;
const SEARCH_PAGE_SIZE = 25;

export type GmailSearchQuery = {
  id: string;
  expression: string;
  weight: number;
  scope: "windowed" | "range";
};

export type GmailMessageMatch = {
  id: string;
  threadId: string;
  score: number;
  reasons: string[];
  firstSeen: number;
};

type SearchWindow = { start: Date; end: Date };

export type GmailDiscoveryResult = {
  matches: GmailMessageMatch[];
  rangeStart: string;
  rangeEnd: string;
  windowsSearched: number;
  queriesRun: number;
  limitReached: boolean;
};

export type GmailSearchResult = GmailDiscoveryResult & {
  messages: GmailMessage[];
};

type GmailSearchOptions = {
  now?: Date;
  pageSize?: number;
  windowMonths?: number;
};

type ListTripMessagesOptions = GmailSearchOptions & {
  maximum?: number;
  queries?: GmailSearchQuery[];
};

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addUtcMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addUtcYears(value: Date, years: number) {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function gmailDate(value: Date) {
  return isoDate(value).replaceAll("-", "/");
}

export function gmailSearchWindows(
  trip: Pick<Trip, "startDate" | "endDate">,
  now = new Date(),
  windowMonths = SEARCH_WINDOW_MONTHS,
) {
  const today = startOfUtcDay(now);
  const defaultStart = addUtcYears(today, -2);
  const requestedStart = trip.startDate ? addUtcYears(utcDate(trip.startDate), -2) : defaultStart;
  const requestedEnd = trip.endDate ? addUtcDays(utcDate(trip.endDate), 30) : addUtcDays(today, 1);
  const end = new Date(Math.min(requestedEnd.getTime(), addUtcDays(today, 1).getTime()));
  const start = requestedStart < end ? requestedStart : defaultStart;
  const windows: SearchWindow[] = [];

  for (let cursor = start; cursor < end; ) {
    const next = addUtcMonths(cursor, windowMonths);
    const windowEnd = next < end ? next : end;
    windows.push({ start: cursor, end: windowEnd });
    cursor = windowEnd;
  }

  return windows;
}

function normalizedSearchTerms(trip: Trip) {
  const values = [trip.name, ...trip.stops.map((stop) => stop.name)];
  const terms = new Set<string>();
  for (const value of values) {
    const cleaned = value
      .replace(/[{}()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 4) terms.add(cleaned);
    for (const token of cleaned.split(/[^A-Za-zÀ-ž0-9]+/)) {
      if (token.length >= 4 && !/^(trip|travel|vacation)$/i.test(token)) terms.add(token);
    }
  }
  return [...terms].slice(0, 8);
}

function quoted(value: string) {
  return `"${value.replaceAll('"', "")}"`;
}

export function baseGmailSearchQueries(trip: Trip): GmailSearchQuery[] {
  const queries: GmailSearchQuery[] = [
    {
      id: "flight-booking",
      expression:
        '{subject:flight subject:itinerary subject:"e-ticket" "record locator" "airline confirmation" "booking reference"}',
      weight: 24,
      scope: "windowed",
    },
    {
      id: "stay-booking",
      expression:
        '{subject:hotel subject:reservation subject:"stay confirmed" subject:"booking confirmed" "check-in" "check out"}',
      weight: 20,
      scope: "windowed",
    },
    {
      id: "booking-update",
      expression:
        '{subject:"time change" subject:"schedule change" subject:rescheduled subject:cancelled "flight time change" "booking no."}',
      weight: 28,
      scope: "windowed",
    },
    {
      id: "provider-booking",
      expression: "from:booking.com {subject:booking subject:reservation subject:flight}",
      weight: 64,
      scope: "windowed",
    },
    {
      id: "provider-airbnb",
      expression: 'from:airbnb.com {subject:reservation subject:"Reservation confirmed"}',
      weight: 80,
      scope: "windowed",
    },
    {
      id: "provider-voi",
      expression:
        "{from:voihotels.com from:voihotels.it subject:VOIhotels} {subject:booking subject:reservation subject:confirmed}",
      weight: 80,
      scope: "windowed",
    },
    {
      id: "provider-flight",
      expression:
        "{from:chasetravel.com from:flightsonbooking.gotogate.support} {subject:flight subject:schedule subject:trip}",
      weight: 64,
      scope: "windowed",
    },
    {
      id: "generic-confirmation",
      expression:
        '{"confirmation number" "booking reference" "reservation code" "confirmation code" subject:booking subject:itinerary}',
      weight: 12,
      scope: "windowed",
    },
  ];

  const context = normalizedSearchTerms(trip);
  if (context.length) {
    queries.push({
      id: "trip-context",
      expression: `{${context.map(quoted).join(" ")}} {subject:flight subject:booking subject:reservation subject:itinerary "booking reference"}`,
      weight: 22,
      scope: "windowed",
    });
  }
  return queries;
}

function travelSearchQuery(window: SearchWindow, expression: string) {
  return [
    `after:${gmailDate(addUtcDays(window.start, -1))}`,
    `before:${gmailDate(window.end)}`,
    expression,
    "-category:promotions",
  ].join(" ");
}

async function gmailJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) throw new Error(`Gmail ${action} failed with status ${response.status}.`);
  return response.json<T>();
}

export async function discoverTripMessageIds(
  fetcher: Fetcher,
  accessToken: string,
  trip: Trip,
  queries: GmailSearchQuery[],
  options: GmailSearchOptions = {},
): Promise<GmailDiscoveryResult> {
  const windows = gmailSearchWindows(trip, options.now, options.windowMonths);
  const range = {
    start: windows[0]?.start ?? addUtcYears(startOfUtcDay(options.now ?? new Date()), -2),
    end: windows.at(-1)?.end ?? addUtcDays(startOfUtcDay(options.now ?? new Date()), 1),
  };
  const matches = new Map<string, GmailMessageMatch>();
  let queriesRun = 0;
  let limitReached = false;
  let firstSeen = 0;

  for (const query of queries) {
    const queryWindows = query.scope === "range" ? [range] : windows;
    for (const window of queryWindows) {
      const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      listUrl.search = new URLSearchParams({
        q: travelSearchQuery(window, query.expression),
        maxResults: String(options.pageSize ?? SEARCH_PAGE_SIZE),
      }).toString();
      const list = await gmailJson<GmailMessageList>(
        await fetcher(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } }),
        "message search",
      );
      queriesRun += 1;
      if (list.nextPageToken || (list.resultSizeEstimate ?? 0) > (list.messages?.length ?? 0)) {
        limitReached = true;
      }

      for (const message of list.messages ?? []) {
        const existing = matches.get(message.id);
        if (existing) {
          if (!existing.reasons.includes(query.id)) {
            existing.reasons.push(query.id);
            existing.score += query.weight;
          }
        } else {
          matches.set(message.id, {
            ...message,
            score: query.weight,
            reasons: [query.id],
            firstSeen: firstSeen++,
          });
        }
      }
    }
  }

  return {
    matches: [...matches.values()].sort(
      (left, right) =>
        right.score - left.score ||
        right.reasons.length - left.reasons.length ||
        left.firstSeen - right.firstSeen,
    ),
    rangeStart: isoDate(range.start),
    rangeEnd: isoDate(range.end),
    windowsSearched: windows.length,
    queriesRun,
    limitReached,
  };
}

async function hydrateTextAttachments(
  fetcher: Fetcher,
  accessToken: string,
  messageId: string,
  part: GmailMessagePart | undefined,
): Promise<void> {
  if (!part) return;

  const body = part.body;
  const attachmentId = body?.attachmentId;
  if (attachmentId && body && !body.data && part.mimeType?.startsWith("text/")) {
    const url = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    );
    const attachment = await gmailJson<GmailAttachment>(
      await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
      "message attachment read",
    );
    if (attachment.data) body.data = attachment.data;
  }

  await Promise.all(
    (part.parts ?? []).map((child) =>
      hydrateTextAttachments(fetcher, accessToken, messageId, child),
    ),
  );
}

export async function readGmailMessages(
  fetcher: Fetcher,
  accessToken: string,
  messages: Pick<GmailMessageMatch, "id" | "threadId">[],
) {
  const hydrated: GmailMessage[] = [];
  for (let index = 0; index < messages.length; index += 5) {
    const batch = messages.slice(index, index + 5);
    hydrated.push(
      ...(await Promise.all(
        batch.map(async ({ id }) => {
          const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`);
          url.searchParams.set("format", "full");
          const message = await gmailJson<GmailMessage>(
            await fetcher(url, { headers: { Authorization: `Bearer ${accessToken}` } }),
            "message read",
          );
          await hydrateTextAttachments(fetcher, accessToken, message.id, message.payload);
          return message;
        }),
      )),
    );
  }
  return hydrated;
}

export async function listTripMessages(
  fetcher: Fetcher,
  accessToken: string,
  trip: Trip,
  options: ListTripMessagesOptions = {},
): Promise<GmailSearchResult> {
  const discovery = await discoverTripMessageIds(
    fetcher,
    accessToken,
    trip,
    options.queries ?? baseGmailSearchQueries(trip),
    options,
  );
  const selected = discovery.matches.slice(0, options.maximum ?? MESSAGE_READ_BUDGET);
  return {
    ...discovery,
    messages: await readGmailMessages(fetcher, accessToken, selected),
  };
}
