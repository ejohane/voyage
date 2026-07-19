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
};

type GmailAttachment = {
  data?: string;
};

const SEARCH_WINDOW_MONTHS = 3;
const MESSAGE_READ_BUDGET = 200;
const SEARCH_PAGE_SIZE = 5;

const searchFamilies = [
  [
    "subject:itinerary",
    'subject:"flight confirmation"',
    'subject:"flight details"',
    'subject:"e-ticket"',
    '"record locator"',
    '"airline confirmation"',
  ],
  [
    "subject:hotel",
    "subject:reservation",
    'subject:"stay confirmed"',
    'subject:"booking confirmed"',
    '"check-in"',
    '"check out"',
  ],
  [
    'subject:"car rental"',
    "subject:train",
    "subject:rail",
    "subject:ferry",
    "subject:cruise",
    '"rental confirmation"',
  ],
  [
    '"confirmation number"',
    '"booking reference"',
    '"reservation code"',
    '"confirmation code"',
    "subject:itinerary",
    "subject:booking",
  ],
] as const;

type SearchWindow = { start: Date; end: Date };

export type GmailSearchResult = {
  messages: GmailMessage[];
  rangeStart: string;
  rangeEnd: string;
  windowsSearched: number;
  queriesRun: number;
  limitReached: boolean;
};

type ListTripMessagesOptions = {
  maximum?: number;
  now?: Date;
  pageSize?: number;
  windowMonths?: number;
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

function travelSearchQuery(window: SearchWindow, terms: readonly string[]) {
  return [
    `after:${gmailDate(addUtcDays(window.start, -1))}`,
    `before:${gmailDate(window.end)}`,
    `{${terms.join(" ")}}`,
    "-category:promotions",
  ].join(" ");
}

async function gmailJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) throw new Error(`Gmail ${action} failed with status ${response.status}.`);
  return response.json<T>();
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

export async function listTripMessages(
  fetcher: Fetcher,
  accessToken: string,
  trip: Pick<Trip, "startDate" | "endDate">,
  options: ListTripMessagesOptions = {},
): Promise<GmailSearchResult> {
  const maximum = options.maximum ?? MESSAGE_READ_BUDGET;
  const pageSize = options.pageSize ?? SEARCH_PAGE_SIZE;
  const windows = gmailSearchWindows(trip, options.now, options.windowMonths);
  const ids = new Map<string, { id: string; threadId: string }>();
  let queriesRun = 0;
  let limitReached = false;

  for (const [windowIndex, window] of windows.entries()) {
    const baseBudget = Math.floor(maximum / windows.length);
    const windowBudget = baseBudget + (windowIndex < maximum % windows.length ? 1 : 0);
    const windowIds = new Map<string, { id: string; threadId: string }>();
    const states = searchFamilies.map((terms) => ({
      terms,
      nextPageToken: undefined as string | undefined,
      firstPage: true,
      complete: false,
    }));

    while (windowIds.size < windowBudget && states.some((state) => !state.complete)) {
      for (const state of states) {
        if (state.complete || windowIds.size >= windowBudget) continue;
        const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
        const parameters = new URLSearchParams({
          q: travelSearchQuery(window, state.terms),
          maxResults: String(Math.min(pageSize, windowBudget - windowIds.size)),
        });
        if (!state.firstPage && state.nextPageToken) {
          parameters.set("pageToken", state.nextPageToken);
        }
        listUrl.search = parameters.toString();
        const list = await gmailJson<GmailMessageList>(
          await fetcher(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } }),
          "message search",
        );
        queriesRun += 1;
        state.firstPage = false;
        state.nextPageToken = list.nextPageToken;
        state.complete = !list.nextPageToken;
        for (const message of list.messages ?? []) {
          windowIds.set(message.id, message);
          if (windowIds.size >= windowBudget) break;
        }
      }
    }

    if (windowIds.size >= windowBudget && states.some((state) => !state.complete)) {
      limitReached = true;
    }
    for (const message of windowIds.values()) ids.set(message.id, message);
  }

  const messages: GmailMessage[] = [];
  const selectedIds = [...ids.values()].slice(0, maximum);
  for (let index = 0; index < selectedIds.length; index += 5) {
    const batch = selectedIds.slice(index, index + 5);
    messages.push(
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

  return {
    messages,
    rangeStart: isoDate(
      windows[0]?.start ?? addUtcYears(startOfUtcDay(options.now ?? new Date()), -2),
    ),
    rangeEnd: isoDate(
      windows.at(-1)?.end ?? addUtcDays(startOfUtcDay(options.now ?? new Date()), 1),
    ),
    windowsSearched: windows.length,
    queriesRun,
    limitReached,
  };
}
