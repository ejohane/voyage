import { ArrowLeft, CalendarDays, Clock3, MapPin } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { EditTripDialog } from "@/components/edit-trip-dialog";
import { GmailImportDialog } from "@/components/gmail-import-dialog";
import { ItinerarySection } from "@/components/trip-itinerary-section";
import { TripMapHeader } from "@/components/trip-map-header";
import { OverviewSection, StaysSection, TravelSection } from "@/components/trip-planning-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { formatTripDates, formatTripDestinations, formatTripDuration } from "@/lib/format-trip";
import { useTrip } from "@/lib/trips";
import { cn } from "@/lib/utils";

type TripSection = "overview" | "itinerary" | "travel" | "stays";

function TripPage({ section = "overview" }: { section?: TripSection }) {
  const { tripId = "" } = useParams();
  const trip = useTrip(tripId);
  const [editOpen, setEditOpen] = useState(false);

  if (trip.isPending) return <TripPageSkeleton />;

  if (trip.isError) {
    const notFound = trip.error instanceof ApiRequestError && trip.error.status === 404;

    return (
      <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
        <Link className="inline-flex items-center gap-2 text-sm text-muted-foreground" to="/trips">
          <ArrowLeft className="size-4" aria-hidden="true" />
          Your trips
        </Link>
        <Card className="mt-8 border-dashed shadow-none">
          <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
            <h1 className="text-base font-medium">
              {notFound ? "This trip isn’t available." : "We couldn’t load this trip."}
            </h1>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
              {notFound
                ? "It may have been removed, or you may not have access."
                : "Check your connection and try again."}
            </p>
            {notFound ? (
              <Link className={cn(buttonVariants({ variant: "outline" }), "mt-4")} to="/trips">
                Back to your trips
              </Link>
            ) : (
              <button
                className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
                onClick={() => void trip.refetch()}
                type="button"
              >
                Try again
              </button>
            )}
          </CardContent>
        </Card>
      </main>
    );
  }

  const sections: { label: string; value: TripSection; to: string }[] = [
    { label: "Overview", value: "overview", to: `/trips/${trip.data.id}` },
    { label: "Itinerary", value: "itinerary", to: `/trips/${trip.data.id}/itinerary` },
    { label: "Transportation", value: "travel", to: `/trips/${trip.data.id}/travel` },
    { label: "Stays", value: "stays", to: `/trips/${trip.data.id}/stays` },
  ];

  return (
    <main className="pb-12 sm:pb-16">
      <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-8 sm:pt-8">
        <section className="relative overflow-hidden rounded-2xl border bg-[#e9e8e1] shadow-sm sm:rounded-3xl">
          <TripMapHeader trip={trip.data} eager className="h-56 aspect-auto sm:h-72 lg:h-[22rem]" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/18 via-transparent to-black/28" />
          <Link
            className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-sm font-medium text-foreground shadow-sm backdrop-blur-md outline-none transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-white sm:left-6 sm:top-6"
            to="/trips"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Your trips
          </Link>
        </section>

        <section className="relative z-10 mx-3 -mt-9 rounded-2xl border bg-background/95 p-5 shadow-lg backdrop-blur-md sm:mx-8 sm:-mt-16 sm:p-7 lg:mx-12 lg:flex lg:items-end lg:justify-between lg:gap-8">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{formatTripDestinations(trip.data)}</span>
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              {trip.data.name}
            </h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4" aria-hidden="true" />
                {formatTripDates(trip.data)}
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="size-4" aria-hidden="true" />
                {formatTripDuration(trip.data)}
              </span>
            </div>
          </div>

          <div className="mt-6 shrink-0 lg:mt-0">
            {trip.data.accessLevel === "viewer" ? (
              <span className="inline-flex rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                View only
              </span>
            ) : (
              <div className="flex flex-wrap gap-2 [&>button]:flex-1 sm:[&>button]:flex-none">
                <GmailImportDialog trip={trip.data} />
                <EditTripDialog trip={trip.data} open={editOpen} onOpenChange={setEditOpen} />
              </div>
            )}
          </div>
        </section>

        <nav
          className="mt-5 flex gap-1 overflow-x-auto border-b px-1 sm:mt-7 sm:px-3"
          aria-label="Trip workspace"
        >
          {sections.map((item) => (
            <NavLink
              key={item.value}
              to={item.to}
              end={item.value === "overview"}
              className={({ isActive }) =>
                cn(
                  "relative shrink-0 px-3 py-3.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  isActive &&
                    "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 sm:mt-8">
          {section === "overview" ? <OverviewSection trip={trip.data} /> : null}
          {section === "itinerary" ? <ItinerarySection trip={trip.data} /> : null}
          {section === "travel" ? <TravelSection trip={trip.data} /> : null}
          {section === "stays" ? <StaysSection trip={trip.data} /> : null}
        </div>
      </div>
    </main>
  );
}

function TripPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-8 sm:py-8">
      <Skeleton className="h-56 rounded-2xl sm:h-72 sm:rounded-3xl lg:h-[22rem]" />
      <Skeleton className="relative mx-3 -mt-9 h-44 rounded-2xl sm:mx-8 sm:-mt-16 sm:h-48 lg:mx-12" />
      <Skeleton className="mt-7 h-12 w-full" />
      <div className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Skeleton className="h-72" />
        <div className="grid gap-5">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </main>
  );
}

export default TripPage;
