import type { Trip } from "@voyage/contracts";
import { ArrowUpRight, CalendarDays, Clock3, MapPin, MapPinned } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CreateTripDialog } from "@/components/create-trip-dialog";
import { TripMapHeader } from "@/components/trip-map-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTripDates, formatTripDestinations, formatTripDuration } from "@/lib/format-trip";
import { useTrips } from "@/lib/trips";
import { cn } from "@/lib/utils";

function TripsPage() {
  const trips = useTrips();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your trips</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything you are planning, in one place.
          </p>
        </div>
        {trips.data?.length ? (
          <CreateTripDialog open={createOpen} onOpenChange={setCreateOpen} />
        ) : null}
      </div>

      {trips.isPending ? <TripsSkeleton /> : null}

      {trips.isError ? (
        <Card className="mt-8 border-dashed shadow-none">
          <CardContent className="flex min-h-60 flex-col items-center justify-center text-center">
            <p className="text-sm font-medium">We couldn’t load your trips.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Check your connection and try again.
            </p>
            <button
              className={cn(buttonVariants({ variant: "outline" }), "mt-4")}
              onClick={() => void trips.refetch()}
              type="button"
            >
              Try again
            </button>
          </CardContent>
        </Card>
      ) : null}

      {trips.data?.length === 0 ? (
        <Card className="mt-8 border-dashed shadow-none">
          <CardContent className="flex min-h-80 flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-xl border bg-background">
              <MapPinned className="size-5 text-muted-foreground" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-base font-medium">Create your first trip</h2>
            <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
              Give the trip a name and add each destination in order. Dates can stay flexible until
              the plan takes shape.
            </p>
            <div className="mt-5">
              <CreateTripDialog
                buttonLabel="Create your first trip"
                open={createOpen}
                onOpenChange={setCreateOpen}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {trips.data?.length ? (
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Trips">
          {trips.data.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </section>
      ) : null}
    </main>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  return (
    <Link
      className="group rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      to={`/trips/${trip.id}`}
    >
      <Card className="h-full gap-0 overflow-hidden rounded-2xl py-0 shadow-sm transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-foreground/20 group-hover:shadow-lg">
        <TripMapHeader trip={trip} />
        <CardContent className="px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-lg font-semibold leading-6 tracking-tight">{trip.name}</h2>
            <ArrowUpRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
        </CardContent>
        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 border-t bg-[#fafaf8] px-5 py-4 text-xs text-muted-foreground">
          <p className="col-span-2 flex min-w-0 items-center gap-2">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{formatTripDestinations(trip, 2)}</span>
          </p>
          <p className="flex min-w-0 items-center gap-2">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{formatTripDates(trip)}</span>
          </p>
          <p className="flex items-center gap-2 whitespace-nowrap">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {formatTripDuration(trip)}
          </p>
        </div>
      </Card>
    </Link>
  );
}

function TripsSkeleton() {
  return (
    <div
      className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Loading trips"
      role="status"
    >
      {[0, 1, 2].map((item) => (
        <Card className="gap-0 overflow-hidden rounded-2xl py-0" key={item}>
          <Skeleton className="aspect-[2/1] w-full rounded-none" />
          <CardContent className="px-5 py-5">
            <Skeleton className="h-5 w-1/2" />
          </CardContent>
          <div className="border-t px-5 py-4">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="mt-4 h-3 w-4/5" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export default TripsPage;
