import type { GmailImportCandidate, Travel } from "@voyage/contracts";
import type { GmailSearchQuery } from "./gmail-api";

export type ItineraryGap = {
  from: string;
  to: string;
};

type TravelLike = Pick<
  Travel,
  | "type"
  | "departureLocation"
  | "arrivalLocation"
  | "departureAt"
  | "arrivalAt"
  | "confirmationNumber"
>;

const ignoredLocationTokens = new Set(["airport", "international", "station", "terminal", "city"]);

function locationTokens(value: string) {
  const tokens = new Set<string>();
  for (const match of value.matchAll(/\b[A-Z]{3}\b/g)) tokens.add(match[0].toLocaleLowerCase());
  for (const token of value.toLocaleLowerCase().split(/[^a-zà-ž0-9]+/)) {
    if (token.length >= 3 && !ignoredLocationTokens.has(token)) tokens.add(token);
  }
  return [...tokens];
}

function sameLocation(left: string, right: string) {
  const rightTokens = new Set(locationTokens(right));
  return locationTokens(left).some((token) => rightTokens.has(token));
}

function travelKey(travel: TravelLike) {
  return [
    travel.departureLocation.toLocaleLowerCase(),
    travel.arrivalLocation.toLocaleLowerCase(),
    travel.departureAt,
    travel.confirmationNumber?.toLocaleLowerCase() ?? "",
  ].join("|");
}

export function findItineraryGaps(
  candidates: GmailImportCandidate[],
  existingTravel: TravelLike[] = [],
) {
  const combined = new Map<string, TravelLike>();
  for (const travel of existingTravel) {
    if (travel.type === "flight") combined.set(travelKey(travel), travel);
  }
  for (const candidate of candidates) {
    if (candidate.kind !== "travel" || candidate.input.type !== "flight") continue;
    combined.set(travelKey(candidate.input), candidate.input);
  }

  const flights = [...combined.values()].sort((left, right) =>
    left.departureAt.localeCompare(right.departureAt),
  );
  const gaps = new Map<string, ItineraryGap>();
  for (let index = 0; index < flights.length - 1; index += 1) {
    const current = flights[index];
    const next = flights[index + 1];
    if (!current.arrivalAt || current.arrivalAt > next.departureAt) continue;
    if (sameLocation(current.arrivalLocation, next.departureLocation)) continue;
    const gap = { from: current.arrivalLocation, to: next.departureLocation };
    gaps.set(`${gap.from.toLocaleLowerCase()}|${gap.to.toLocaleLowerCase()}`, gap);
  }
  return [...gaps.values()];
}

function queryGroup(value: string) {
  const terms = locationTokens(value)
    .filter((token) => token.length === 3 || token.length >= 4)
    .slice(0, 4)
    .map((token) => `"${token}"`);
  return `{${terms.join(" ")}}`;
}

export function followUpGmailSearchQueries(
  candidates: GmailImportCandidate[],
  gaps: ItineraryGap[],
) {
  const queries: GmailSearchQuery[] = [];
  const references = new Set(
    candidates
      .map((candidate) => candidate.input.confirmationNumber?.trim())
      .filter((value): value is string => Boolean(value && /^[A-Z0-9-]{5,20}$/i.test(value))),
  );
  for (const reference of [...references].slice(0, 20)) {
    queries.push({
      id: `reference:${reference.toLocaleLowerCase()}`,
      expression: `"${reference.replaceAll('"', "")}"`,
      weight: 80,
      scope: "range",
    });
  }
  for (const [index, gap] of gaps.slice(0, 5).entries()) {
    const from = queryGroup(gap.from);
    const to = queryGroup(gap.to);
    if (from === "{}" || to === "{}") continue;
    queries.push({
      id: `route-gap:${index}`,
      expression: `${from} ${to} {flight booking itinerary confirmation}`,
      weight: 90,
      scope: "range",
    });
  }
  return queries;
}
