import type { Trip } from "@voyage/contracts";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  MapPinned,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CreateTripDialog } from "@/components/create-trip-dialog";
import { TripMapHeader } from "@/components/trip-map-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatTripDates, formatTripDestinations, formatTripDurationDays } from "@/lib/format-trip";
import { useDeleteTrip, useTrips } from "@/lib/trips";
import { cn } from "@/lib/utils";

function TripsPage() {
  const trips = useTrips();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main className="mx-auto w-full max-w-[96rem] p-4 md:p-6">
      <div className="border-b pb-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Workspace
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">All trips</h1>
        </div>
      </div>

      {trips.isPending ? <TripsSkeleton /> : null}

      {trips.isError ? (
        <Card className="mt-4 border-dashed shadow-none">
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
        <Card className="mt-4 border-dashed shadow-none">
          <CardContent className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <span className="grid size-10 place-items-center rounded-md border bg-background">
              <MapPinned className="size-4 text-muted-foreground" aria-hidden="true" />
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
        <section
          className="mt-4 overflow-hidden rounded-lg border bg-background"
          aria-label="Trips"
        >
          <div className="hidden grid-cols-[8.5rem_minmax(12rem,1.2fr)_minmax(10rem,1fr)_10rem_7rem_2.5rem] items-center gap-4 border-b bg-muted/35 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid">
            <span>Route</span>
            <span>Project</span>
            <span>Destinations</span>
            <span>Dates</span>
            <span>Duration</span>
            <span className="sr-only">Actions</span>
          </div>
          <div className="divide-y">
            {trips.data.map((trip) => (
              <TripRow key={trip.id} trip={trip} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}

function TripRow({ trip }: { trip: Trip }) {
  const removeTrip = useDeleteTrip(trip.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  async function handleDelete() {
    setDeleteError(false);

    try {
      await removeTrip.mutateAsync();
    } catch {
      setDeleteError(true);
    }
  }

  return (
    <div>
      <div className="group grid grid-cols-[minmax(0,1fr)_2.5rem] transition-colors hover:bg-muted/30 focus-within:bg-muted/30">
        <Link
          className="grid min-h-24 gap-3 p-3 pr-1 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-center lg:grid-cols-[8.5rem_minmax(12rem,1.2fr)_minmax(10rem,1fr)_10rem_7rem] lg:gap-4"
          to={`/trips/${trip.id}`}
        >
          <TripMapHeader trip={trip} className="h-16 w-full rounded-md border sm:w-[8.5rem]" />
          <div className="min-w-0">
            <h2 className="truncate font-medium">{trip.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground lg:hidden">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {formatTripDates(trip)}
            </p>
          </div>
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground sm:col-start-2 lg:col-start-auto">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{formatTripDestinations(trip, 3)}</span>
          </p>
          <p className="hidden text-sm text-muted-foreground lg:block">{formatTripDates(trip)}</p>
          <p className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
            <Clock3 className="size-3.5" aria-hidden="true" />
            {formatTripDurationDays(trip)}
          </p>
        </Link>

        <div className="flex items-center justify-center pr-2">
          {trip.accessLevel === "owner" ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Trip actions for ${trip.name}`}
                  className="text-muted-foreground hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground"
                  size="icon"
                  variant="ghost"
                >
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600 focus:bg-red-50 focus:text-red-700"
                  onSelect={() => {
                    setDeleteError(false);
                    setConfirmingDelete(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Delete trip
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          )}
        </div>
      </div>

      {confirmingDelete ? (
        <div className="flex flex-col gap-3 border-t bg-red-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium">Delete {trip.name}?</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This permanently removes the itinerary, ideas, bookings, and member access.
            </p>
            {deleteError ? (
              <p className="mt-1 text-xs text-red-700" role="alert">
                We couldn’t delete this trip. Try again.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2">
            <Button
              disabled={removeTrip.isPending}
              onClick={() => {
                setConfirmingDelete(false);
                setDeleteError(false);
              }}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={removeTrip.isPending}
              onClick={() => void handleDelete()}
              size="sm"
            >
              {removeTrip.isPending ? (
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
              {removeTrip.isPending ? "Deleting…" : "Delete trip"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TripsSkeleton() {
  return (
    <div
      className="mt-4 overflow-hidden rounded-lg border bg-background"
      aria-label="Loading trips"
      role="status"
    >
      {[0, 1, 2].map((item) => (
        <div className="flex items-center gap-4 border-b p-3 last:border-b-0" key={item}>
          <Skeleton className="h-16 w-[8.5rem] shrink-0" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="mt-3 h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default TripsPage;
