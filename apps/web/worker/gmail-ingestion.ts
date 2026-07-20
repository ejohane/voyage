import type { GmailImportCandidate, Travel, Trip } from "@voyage/contracts";
import {
  baseGmailSearchQueries,
  discoverTripMessageIds,
  type GmailDiscoveryResult,
  type GmailMessageMatch,
  readGmailMessages,
} from "./gmail-api";
import { consolidateGmailCandidates, relevantGmailCandidates } from "./gmail-candidates";
import { extractGmailCandidates } from "./gmail-extractor";
import {
  listCachedGmailProcessing,
  pruneStaleGmailProcessing,
  saveGmailProcessing,
} from "./gmail-ingestion-cache";
import { findItineraryGaps, followUpGmailSearchQueries } from "./gmail-query-planner";

type ScanMode = "standard" | "deep";

type ScanOptions = {
  database: D1Database;
  userId: string;
  fetcher: typeof fetch;
  accessToken: string;
  trip: Trip;
  accountEmail: string;
  existingTravel?: Travel[];
  mode?: ScanMode;
};

type ProcessingState = {
  candidates: GmailImportCandidate[];
  processedIds: Set<string>;
  fetched: number;
  reused: number;
  rejections: Record<string, number>;
};

function mergeMatches(...groups: GmailMessageMatch[][]) {
  const merged = new Map<string, GmailMessageMatch>();
  for (const group of groups) {
    for (const match of group) {
      const current = merged.get(match.id);
      if (!current) {
        merged.set(match.id, { ...match, reasons: [...match.reasons] });
        continue;
      }
      for (const reason of match.reasons) {
        if (!current.reasons.includes(reason)) {
          current.reasons.push(reason);
          current.score += match.score;
        }
      }
    }
  }
  return [...merged.values()].sort(
    (left, right) =>
      right.score - left.score ||
      right.reasons.length - left.reasons.length ||
      left.firstSeen - right.firstSeen,
  );
}

function addRejection(state: ProcessingState, reason: string) {
  state.rejections[reason] = (state.rejections[reason] ?? 0) + 1;
}

async function processMatches(
  options: ScanOptions,
  matches: GmailMessageMatch[],
  state: ProcessingState,
) {
  const pending = matches.filter((match) => !state.processedIds.has(match.id));
  if (!pending.length) return;
  const cached = await listCachedGmailProcessing(
    options.database,
    options.userId,
    options.trip.id,
    pending.map((match) => match.id),
  );
  const reads: GmailMessageMatch[] = [];
  for (const match of pending) {
    const entry = cached.get(match.id);
    state.processedIds.add(match.id);
    if (!entry) {
      reads.push(match);
      continue;
    }
    state.reused += 1;
    state.candidates.push(...entry.candidates);
    if (entry.rejectionReason) addRejection(state, entry.rejectionReason);
  }

  const messages = await readGmailMessages(options.fetcher, options.accessToken, reads);
  state.fetched += messages.length;
  for (const message of messages) {
    const candidates = extractGmailCandidates(message, options.trip, options.accountEmail);
    const rejectionReason = candidates.length ? null : "no_supported_booking";
    state.candidates.push(...candidates);
    if (rejectionReason) addRejection(state, rejectionReason);
    await saveGmailProcessing(
      options.database,
      options.userId,
      options.trip.id,
      message.id,
      message.threadId,
      candidates,
      rejectionReason,
    );
  }
}

function consolidatedCandidates(candidates: GmailImportCandidate[], trip: Trip) {
  return consolidateGmailCandidates(relevantGmailCandidates(candidates, trip));
}

export async function scanGmailBookings(options: ScanOptions) {
  await pruneStaleGmailProcessing(options.database, options.userId, options.trip.id);
  const mode = options.mode ?? "standard";
  const baseDepth = mode === "deep" ? 180 : 60;
  const followUpDepth = mode === "deep" ? 20 : 40;
  const base = await discoverTripMessageIds(
    options.fetcher,
    options.accessToken,
    options.trip,
    baseGmailSearchQueries(options.trip),
  );
  const state: ProcessingState = {
    candidates: [],
    processedIds: new Set(),
    fetched: 0,
    reused: 0,
    rejections: {},
  };
  await processMatches(options, base.matches.slice(0, baseDepth), state);

  const initial = consolidatedCandidates(state.candidates, options.trip);
  const gaps = findItineraryGaps(initial, options.existingTravel);
  const followUpQueries = followUpGmailSearchQueries(initial, gaps);
  let followUp: GmailDiscoveryResult | null = null;
  if (followUpQueries.length) {
    followUp = await discoverTripMessageIds(
      options.fetcher,
      options.accessToken,
      options.trip,
      followUpQueries,
      { pageSize: 50 },
    );
    await processMatches(options, followUp.matches.slice(0, followUpDepth), state);
  }

  const allMatches = mergeMatches(base.matches, followUp?.matches ?? []);
  const selectedLimit = baseDepth + followUpDepth;
  const limitReached =
    base.limitReached ||
    Boolean(followUp?.limitReached) ||
    allMatches.some((match) => !state.processedIds.has(match.id)) ||
    allMatches.length > selectedLimit;

  return {
    candidates: consolidatedCandidates(state.candidates, options.trip),
    messagesScanned: state.processedIds.size,
    search: {
      rangeStart: base.rangeStart,
      rangeEnd: base.rangeEnd,
      windowsSearched: base.windowsSearched,
      queriesRun: base.queriesRun + (followUp?.queriesRun ?? 0),
      followUpQueriesRun: followUp?.queriesRun ?? 0,
      messagesDiscovered: allMatches.length,
      messagesFetched: state.fetched,
      messagesReused: state.reused,
      gapsSearched: gaps.length,
      rejections: state.rejections,
      limitReached,
      stoppedReason: limitReached ? ("ranked_limit" as const) : ("complete" as const),
    },
  };
}
