import { ArrowLeft, CalendarDays } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useParams } from "react-router-dom";
import { EditTripDialog } from "@/components/edit-trip-dialog";
import { GmailImportDialog } from "@/components/gmail-import-dialog";
import { ItinerarySection } from "@/components/trip-itinerary-section";
import { OverviewSection, StaysSection, TravelSection } from "@/components/trip-planning-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { formatTripDates, formatTripDestinations } from "@/lib/format-trip";
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
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        className="inline-flex items-center gap-2 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        to="/trips"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Your trips
      </Link>

      <div className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
        <div>
          <p className="text-sm text-muted-foreground">{formatTripDestinations(trip.data)}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{trip.data.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatTripDates(trip.data)}
          </p>
        </div>
        {trip.data.accessLevel === "viewer" ? (
          <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            View only
          </span>
        ) : (
          <div className="flex flex-wrap gap-2">
            <GmailImportDialog trip={trip.data} />
            <EditTripDialog trip={trip.data} open={editOpen} onOpenChange={setEditOpen} />
          </div>
        )}
      </div>

      <nav className="mt-9 flex gap-1 border-b" aria-label="Trip workspace">
        {sections.map((item) => (
          <NavLink
            key={item.value}
            to={item.to}
            end={item.value === "overview"}
            className={({ isActive }) =>
              cn(
                "relative px-3 py-3 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isActive &&
                  "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-foreground",
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-8">
        {section === "overview" ? <OverviewSection trip={trip.data} /> : null}
        {section === "itinerary" ? <ItinerarySection trip={trip.data} /> : null}
        {section === "travel" ? <TravelSection trip={trip.data} /> : null}
        {section === "stays" ? <StaysSection trip={trip.data} /> : null}
      </div>
    </main>
  );
}

function TripPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-8 h-4 w-32" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-4 h-4 w-48" />
      <Skeleton className="mt-10 h-11 w-full" />
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
