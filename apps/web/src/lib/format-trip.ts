import type { Trip } from "@voyage/contracts";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`));
}

function formatTripDates(trip: Pick<Trip, "startDate" | "endDate">) {
  if (!trip.startDate) {
    return "Dates not set";
  }

  if (!trip.endDate) {
    return `${formatDate(trip.startDate)} – flexible`;
  }

  if (trip.endDate === trip.startDate) {
    return formatDate(trip.startDate);
  }

  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;
}

function formatTripDestinations(trip: Pick<Trip, "stops">, limit = Number.POSITIVE_INFINITY) {
  const names = trip.stops.map((stop) => stop.name);

  if (names.length <= limit) return names.join(" → ");

  return `${names.slice(0, limit).join(" → ")} +${names.length - limit}`;
}

function formatTripDuration(trip: Pick<Trip, "startDate" | "endDate">) {
  if (!trip.startDate || !trip.endDate) return "Flexible";

  const start = new Date(`${trip.startDate}T00:00:00Z`);
  const end = new Date(`${trip.endDate}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  return `${days} ${days === 1 ? "day" : "days"}`;
}

function formatTripDurationDays(trip: Pick<Trip, "startDate" | "endDate">) {
  if (!trip.startDate || !trip.endDate) return "Days not set";
  return formatTripDuration(trip);
}

export { formatTripDates, formatTripDestinations, formatTripDuration, formatTripDurationDays };
