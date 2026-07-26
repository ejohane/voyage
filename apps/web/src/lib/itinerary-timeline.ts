import type { Trip, TripStop } from "@voyage/contracts";
import { eachDayOfInterval, format, parse } from "date-fns";

type TimelineTrip = Pick<Trip, "startDate" | "endDate" | "stops">;

function itineraryDates(trip: TimelineTrip, entryDates: string[]): string[] {
  const dates = new Set(entryDates);

  if (trip.startDate && trip.endDate) {
    const start = parse(trip.startDate, "yyyy-MM-dd", new Date());
    const end = parse(trip.endDate, "yyyy-MM-dd", new Date());
    if (start <= end) {
      for (const day of eachDayOfInterval({ start, end })) {
        dates.add(format(day, "yyyy-MM-dd"));
      }
    }
  } else {
    if (trip.startDate) dates.add(trip.startDate);
    if (trip.endDate) dates.add(trip.endDate);
  }

  return [...dates].sort();
}

function stopsForDate(stops: TripStop[], date: string): TripStop[] {
  return stops.filter((stop) => {
    const beginsBeforeDate = !stop.arrivalDate || stop.arrivalDate <= date;
    const endsAfterDate = !stop.departureDate || stop.departureDate >= date;
    return beginsBeforeDate && endsAfterDate;
  });
}

function destinationNamesForDate(stops: TripStop[], date: string): string[] {
  return stopsForDate(stops, date).map((stop) => stop.name);
}

function initialStopIdForDate(stops: TripStop[], date: string): string | undefined {
  return stopsForDate(stops, date)[0]?.id;
}

export { destinationNamesForDate, initialStopIdForDate, itineraryDates };
