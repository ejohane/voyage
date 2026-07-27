import {
  BedDouble,
  CheckCircle2,
  LayoutDashboard,
  Lightbulb,
  ListChecks,
  Route,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useLocation, useParams } from "react-router-dom";
import { TripIdeasSection } from "@/components/trip-ideas-section";
import { ItinerarySection } from "@/components/trip-itinerary-section";
import { TripPeopleSection } from "@/components/trip-people-section";
import { OverviewSection, StaysSection, TravelSection } from "@/components/trip-planning-sections";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { useTrip } from "@/lib/trips";
import { cn } from "@/lib/utils";

type TripSection = "overview" | "itinerary" | "ideas" | "travel" | "stays" | "people";

const sectionDefinitions = [
  { icon: LayoutDashboard, label: "Overview", value: "overview", path: "" },
  { icon: ListChecks, label: "Itinerary", value: "itinerary", path: "/itinerary" },
  { icon: Lightbulb, label: "Ideas", value: "ideas", path: "/ideas" },
  { icon: Route, label: "Transportation", value: "travel", path: "/travel" },
  { icon: BedDouble, label: "Stays", value: "stays", path: "/stays" },
  { icon: Users, label: "People", value: "people", path: "/people" },
] as const;

function TripPage({ section = "overview" }: { section?: TripSection }) {
  const { tripId = "" } = useParams();
  const trip = useTrip(tripId);
  const location = useLocation();
  const joinedState = location.state as { joinedTrip?: boolean; invitedByName?: string } | null;
  const [welcomeOpen, setWelcomeOpen] = useState(Boolean(joinedState?.joinedTrip));

  if (trip.isPending) return <TripPageSkeleton />;

  if (trip.isError) {
    const notFound = trip.error instanceof ApiRequestError && trip.error.status === 404;

    return (
      <main className="p-4 md:p-6">
        <Card className="mx-auto max-w-3xl border-dashed shadow-none">
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
                Back to trips
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
    <main className="min-w-0 pb-8">
      <nav
        className="sticky top-14 z-20 overflow-x-auto border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-6"
        aria-label="Trip workspace"
      >
        <div className="mx-auto flex min-w-max max-w-[96rem] items-center gap-7">
          {sectionDefinitions.map((item) => {
            const Icon = item.icon;
            const href = `/trips/${trip.data.id}${item.path}`;

            return (
              <NavLink
                key={item.value}
                to={href}
                end={item.value === "overview"}
                className={({ isActive }) =>
                  cn(
                    "relative inline-flex h-12 min-w-max items-center gap-1.5 rounded-sm px-0.5 text-sm font-medium text-muted-foreground outline-none transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-transparent hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground",
                    isActive && "text-foreground after:bg-blue-600",
                  )
                }
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-[96rem] p-4 md:p-6">
        {welcomeOpen && section === "overview" ? (
          <div
            className="mb-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-950"
            role="status"
          >
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">Welcome to {trip.data.name}</p>
              <p className="mt-0.5 text-emerald-900/75">
                {joinedState?.invitedByName ? `${joinedState.invitedByName} invited you. ` : ""}
                You can see the complete, current trip without managing the plan.
              </p>
            </div>
            <button
              aria-label="Dismiss welcome"
              className="rounded-md p-1 text-emerald-900/60 hover:bg-emerald-100 hover:text-emerald-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
              onClick={() => setWelcomeOpen(false)}
              type="button"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {section === "overview" ? <OverviewSection trip={trip.data} /> : null}
        {section === "itinerary" ? <ItinerarySection trip={trip.data} /> : null}
        {section === "ideas" ? <TripIdeasSection trip={trip.data} /> : null}
        {section === "travel" ? <TravelSection trip={trip.data} /> : null}
        {section === "stays" ? <StaysSection trip={trip.data} /> : null}
        {section === "people" ? <TripPeopleSection trip={trip.data} /> : null}
      </div>
    </main>
  );
}

function TripPageSkeleton() {
  return (
    <main className="min-w-0 pb-8">
      <div className="flex h-12 items-center gap-7 border-b bg-background px-4 md:px-6">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="mx-auto w-full max-w-[96rem] p-4 md:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </main>
  );
}

export default TripPage;
