import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Clock3,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Route,
} from "lucide-react";
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

  const sections = [
    {
      icon: LayoutDashboard,
      label: "Overview",
      value: "overview",
      to: `/trips/${trip.data.id}`,
    },
    {
      icon: ListChecks,
      label: "Itinerary",
      value: "itinerary",
      to: `/trips/${trip.data.id}/itinerary`,
    },
    {
      icon: Route,
      label: "Transportation",
      value: "travel",
      to: `/trips/${trip.data.id}/travel`,
    },
    {
      icon: BedDouble,
      label: "Stays",
      value: "stays",
      to: `/trips/${trip.data.id}/stays`,
    },
  ];

  return (
    <main className="pb-12 sm:pb-16">
      <section className="relative h-[30rem] overflow-hidden bg-[#e8ebe7] sm:h-[32rem] lg:h-[34rem]">
        <TripMapHeader
          trip={trip.data}
          eager
          className="absolute inset-0 h-full aspect-auto"
          imageClassName="object-contain object-top saturate-[0.72] contrast-[0.92] sm:object-cover sm:object-center"
        />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(248,247,242,0.98)_0%,rgba(248,247,242,0.91)_30%,rgba(248,247,242,0.46)_52%,rgba(248,247,242,0.08)_72%,transparent_100%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#f8f7f2]/80 to-transparent" />

        <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col px-5 py-5 sm:px-8 sm:py-7">
          <div className="flex items-start justify-between gap-6">
            <Link
              className="inline-flex items-center gap-2 rounded-full px-1 py-2 text-sm font-medium text-foreground outline-none transition-opacity hover:opacity-65 focus-visible:ring-2 focus-visible:ring-ring"
              to="/trips"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Your trips
            </Link>

            {trip.data.accessLevel === "viewer" ? (
              <span className="hidden rounded-full border border-foreground/10 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md sm:inline-flex">
                View only
              </span>
            ) : (
              <div className="hidden gap-2 sm:flex [&>button]:border-foreground/10 [&>button]:bg-background/75 [&>button]:shadow-none [&>button]:backdrop-blur-md [&>button]:hover:bg-background">
                <GmailImportDialog trip={trip.data} />
                <EditTripDialog trip={trip.data} open={editOpen} onOpenChange={setEditOpen} />
              </div>
            )}
          </div>

          <div className="mt-auto max-w-xl pb-14 sm:pb-16">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              <span>{formatTripDestinations(trip.data)}</span>
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
              {trip.data.name}
            </h1>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <CalendarDays className="size-4" aria-hidden="true" />
                {formatTripDates(trip.data)}
              </span>
              <span className="flex items-center gap-2">
                <Clock3 className="size-4" aria-hidden="true" />
                {formatTripDuration(trip.data)}
              </span>
            </div>

            <div className="mt-6 sm:hidden">
              {trip.data.accessLevel === "viewer" ? (
                <span className="inline-flex rounded-full border border-foreground/10 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-md">
                  View only
                </span>
              ) : (
                <div className="flex flex-wrap gap-2 [&>button]:border-foreground/10 [&>button]:bg-background/75 [&>button]:shadow-none [&>button]:backdrop-blur-md [&>button]:hover:bg-background">
                  <GmailImportDialog trip={trip.data} />
                  <EditTripDialog trip={trip.data} open={editOpen} onOpenChange={setEditOpen} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <nav
        className="relative z-10 mx-4 -mt-7 flex max-w-3xl gap-1 overflow-x-auto rounded-2xl border border-foreground/10 bg-background/95 p-1.5 shadow-[0_12px_36px_rgba(25,28,25,0.08)] backdrop-blur-xl sm:mx-auto sm:rounded-full"
        aria-label="Trip workspace"
      >
        {sections.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.value}
              to={item.to}
              end={item.value === "overview"}
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-11 min-w-max flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:rounded-full",
                  isActive &&
                    "bg-foreground text-background hover:bg-foreground hover:text-background",
                )
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="mx-auto mt-9 w-full max-w-7xl px-5 sm:mt-12 sm:px-8">
        <div>
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
    <main className="pb-12 sm:pb-16">
      <Skeleton className="h-[30rem] rounded-none sm:h-[32rem] lg:h-[34rem]" />
      <Skeleton className="relative z-10 mx-4 -mt-7 h-14 max-w-3xl rounded-2xl sm:mx-auto sm:rounded-full" />
      <div className="mx-auto mt-12 w-full max-w-7xl px-5 sm:px-8">
        <Skeleton className="h-36 rounded-none" />
        <div className="mt-8 grid gap-8 border-t pt-8 lg:grid-cols-[1fr_22rem]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </main>
  );
}

export default TripPage;
