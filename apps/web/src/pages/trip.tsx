import { ArrowLeft, CalendarDays, Check, MapPin, Route } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { EditTripDialog } from "@/components/edit-trip-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { formatTripDates } from "@/lib/format-trip";
import { useTrip } from "@/lib/trips";
import { cn } from "@/lib/utils";

function TripPage() {
  const { tripId = "" } = useParams();
  const trip = useTrip(tripId);
  const [editOpen, setEditOpen] = useState(false);

  if (trip.isPending) {
    return <TripPageSkeleton />;
  }

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
          <p className="text-sm text-muted-foreground">{trip.data.destination}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{trip.data.name}</h1>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatTripDates(trip.data)}
          </p>
        </div>
        <EditTripDialog trip={trip.data} open={editOpen} onOpenChange={setEditOpen} />
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Trip overview</CardTitle>
            <CardDescription>The shared basics everyone can trust.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            <Detail icon={MapPin} label="Destination" value={trip.data.destination} />
            <Detail icon={CalendarDays} label="Dates" value={formatTripDates(trip.data)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Planning starts here</CardTitle>
            <CardDescription>Your shared workspace is ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <p className="flex items-start gap-3">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-background">
                <Check className="size-3" aria-hidden="true" />
              </span>
              <span>
                <span className="font-medium">Trip created</span>
                <span className="mt-0.5 block leading-5 text-muted-foreground">
                  The overview is saved and available whenever you return.
                </span>
              </span>
            </p>
            <p className="flex items-start gap-3 border-t pt-4">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border">
                <Route className="size-3 text-muted-foreground" aria-hidden="true" />
              </span>
              <span>
                <span className="font-medium">More planning tools are next</span>
                <span className="mt-0.5 block leading-5 text-muted-foreground">
                  Itinerary, ideas, and invitations will build on this trip.
                </span>
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value}</p>
    </div>
  );
}

function TripPageSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 sm:py-14">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-8 h-4 w-32" />
      <Skeleton className="mt-3 h-9 w-64" />
      <Skeleton className="mt-4 h-4 w-48" />
      <div className="mt-10 grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </main>
  );
}

export default TripPage;
