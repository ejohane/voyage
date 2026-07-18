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

  if (!trip.endDate || trip.endDate === trip.startDate) {
    return formatDate(trip.startDate);
  }

  return `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`;
}

export { formatTripDates };
