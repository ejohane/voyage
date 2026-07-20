import type { Stay, Travel, Trip, TripPlan, TripStop } from "@voyage/contracts";
import { format, parse } from "date-fns";
import {
  BedDouble,
  BusFront,
  CalendarDays,
  CarFront,
  ExternalLink,
  Landmark,
  Lightbulb,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  Route,
  Ship,
  Sparkles,
  Ticket,
  TrainFront,
  Trash2,
  Utensils,
} from "lucide-react";
import { type ComponentType, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { PlanDialog } from "@/components/planning-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeletePlan, usePlans, useStays, useTravel } from "@/lib/planning";
import { cn } from "@/lib/utils";

type ItineraryView = "schedule" | "ideas";

type TimelineEntry = {
  id: string;
  date: string;
  time: string | null;
  endTime?: string | null;
  icon: ComponentType<{ className?: string }>;
  eyebrow: string;
  title: string;
  detail?: string;
  href?: string;
  plan?: TripPlan;
};

const categoryIcons: Record<TripPlan["category"], ComponentType<{ className?: string }>> = {
  activity: Sparkles,
  food: Utensils,
  event: Ticket,
  sightseeing: Landmark,
  other: MapPin,
};

const transportationIcons: Record<Travel["type"], ComponentType<{ className?: string }>> = {
  flight: Plane,
  train: TrainFront,
  bus: BusFront,
  drive: CarFront,
  ferry: Ship,
  car: CarFront,
  other: Route,
};

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatDay(value: string) {
  return format(parse(value, "yyyy-MM-dd", new Date()), "EEEE, MMMM d");
}

function formatTime(value: string) {
  return format(parse(value, "HH:mm", new Date()), "h:mm a");
}

function formatTimeRange(startTime: string, endTime?: string | null) {
  return endTime ? `${formatTime(startTime)} – ${formatTime(endTime)}` : formatTime(startTime);
}

function buildTimelineEntries(
  trip: Trip,
  travel: Travel[],
  stays: Stay[],
  plans: TripPlan[],
): TimelineEntry[] {
  const stopNames = new Map(trip.stops.map((stop) => [stop.id, stop.name]));
  const entries: TimelineEntry[] = [];

  for (const item of travel) {
    const departureDate = item.departureAt.slice(0, 10);
    const departureTime = item.departureAt.slice(11);
    const arrivalDate = item.arrivalAt?.slice(0, 10);
    const arrivalTime = item.arrivalAt?.slice(11);

    if (item.kind === "rental") {
      const rentalTitle = [item.carrier ?? "Rental car", item.vehicleDescription]
        .filter(Boolean)
        .join(" · ");
      entries.push({
        id: `rental-pickup-${item.id}`,
        date: departureDate,
        time: departureTime,
        icon: CarFront,
        eyebrow: "Rental car pickup",
        title: rentalTitle,
        detail: item.departureLocation,
        href: `/trips/${trip.id}/travel`,
      });
      if (arrivalDate && arrivalTime) {
        entries.push({
          id: `rental-return-${item.id}`,
          date: arrivalDate,
          time: arrivalTime,
          icon: CarFront,
          eyebrow: "Rental car return",
          title: rentalTitle,
          detail: item.arrivalLocation,
          href: `/trips/${trip.id}/travel`,
        });
      }
      continue;
    }

    entries.push({
      id: `travel-departure-${item.id}`,
      date: departureDate,
      time: departureTime,
      icon: transportationIcons[item.type],
      eyebrow: `${titleCase(item.type)} departure`,
      title: `${item.departureLocation} → ${item.arrivalLocation}`,
      detail: item.departureStopId ? stopNames.get(item.departureStopId) : undefined,
      href: `/trips/${trip.id}/travel`,
    });

    if (arrivalDate && arrivalTime && arrivalDate !== departureDate) {
      entries.push({
        id: `travel-arrival-${item.id}`,
        date: arrivalDate,
        time: arrivalTime,
        icon: transportationIcons[item.type],
        eyebrow: `${titleCase(item.type)} arrival`,
        title: item.arrivalLocation,
        detail: item.arrivalStopId ? stopNames.get(item.arrivalStopId) : undefined,
        href: `/trips/${trip.id}/travel`,
      });
    }
  }

  for (const stay of stays) {
    const stopName = stay.tripStopId ? stopNames.get(stay.tripStopId) : undefined;
    entries.push({
      id: `stay-check-in-${stay.id}`,
      date: stay.checkInDate,
      time: null,
      icon: BedDouble,
      eyebrow: "Stay check-in",
      title: stay.propertyName,
      detail: stopName,
      href: `/trips/${trip.id}/stays`,
    });
    entries.push({
      id: `stay-checkout-${stay.id}`,
      date: stay.checkOutDate,
      time: null,
      icon: BedDouble,
      eyebrow: "Stay checkout",
      title: stay.propertyName,
      detail: stopName,
      href: `/trips/${trip.id}/stays`,
    });
  }

  for (const plan of plans) {
    if (!plan.scheduledDate) continue;
    entries.push({
      id: `plan-${plan.id}`,
      date: plan.scheduledDate,
      time: plan.startTime,
      endTime: plan.endTime,
      icon: categoryIcons[plan.category],
      eyebrow: `${titleCase(plan.category)} · ${titleCase(plan.status)}`,
      title: plan.title,
      detail: plan.location ?? stopNames.get(plan.tripStopId),
      plan,
    });
  }

  return entries.sort((left, right) => {
    const leftKey = `${left.date}T${left.time ?? "99:99"}`;
    const rightKey = `${right.date}T${right.time ?? "99:99"}`;
    return leftKey.localeCompare(rightKey) || left.title.localeCompare(right.title);
  });
}

function ItinerarySection({ trip }: { trip: Trip }) {
  const travel = useTravel(trip.id);
  const stays = useStays(trip.id);
  const plans = usePlans(trip.id);
  const [view, setView] = useState<ItineraryView>("schedule");
  const [addOpen, setAddOpen] = useState(false);
  const canEdit = trip.accessLevel !== "viewer";
  const loading = travel.isPending || stays.isPending || plans.isPending;
  const hasError = travel.isError || stays.isError || plans.isError;
  const entries = buildTimelineEntries(trip, travel.data ?? [], stays.data ?? [], plans.data ?? []);
  const ideas = (plans.data ?? []).filter((plan) => !plan.scheduledDate);

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Itinerary</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Bring reservations, activities, and saved ideas into one trip plan.
          </p>
        </div>
        {canEdit ? (
          <PlanDialog
            tripId={trip.id}
            stops={trip.stops}
            open={addOpen}
            onOpenChange={setAddOpen}
            trigger={
              <Button>
                <Plus className="size-4" />
                Add plan
              </Button>
            }
          />
        ) : null}
      </div>

      <fieldset className="mt-6 inline-flex rounded-lg border bg-muted/30 p-1">
        <legend className="sr-only">Itinerary view</legend>
        <Button
          size="sm"
          variant={view === "schedule" ? "secondary" : "ghost"}
          className={cn(view === "schedule" && "bg-background shadow-sm")}
          aria-pressed={view === "schedule"}
          onClick={() => setView("schedule")}
        >
          <CalendarDays className="size-3.5" />
          Schedule
        </Button>
        <Button
          size="sm"
          variant={view === "ideas" ? "secondary" : "ghost"}
          className={cn(view === "ideas" && "bg-background shadow-sm")}
          aria-pressed={view === "ideas"}
          onClick={() => setView("ideas")}
        >
          <Lightbulb className="size-3.5" />
          Ideas
          {ideas.length > 0 ? (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none">
              {ideas.length}
            </span>
          ) : null}
        </Button>
      </fieldset>

      {loading ? (
        <div className="mt-6 grid gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
        </div>
      ) : hasError ? (
        <Card className="mt-6 border-dashed shadow-none">
          <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
            <MoreHorizontal className="size-5 text-muted-foreground" />
            <p className="mt-3 font-medium">We couldn’t load the itinerary</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try again for the latest trip plan.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => {
                void travel.refetch();
                void stays.refetch();
                void plans.refetch();
              }}
            >
              Try again
            </Button>
          </CardContent>
        </Card>
      ) : view === "schedule" ? (
        <ScheduleView trip={trip} entries={entries} canEdit={canEdit} />
      ) : (
        <IdeasView trip={trip} ideas={ideas} canEdit={canEdit} />
      )}
    </section>
  );
}

function ScheduleView({
  canEdit,
  entries,
  trip,
}: {
  canEdit: boolean;
  entries: TimelineEntry[];
  trip: Trip;
}) {
  if (entries.length === 0) {
    return (
      <Card className="mt-6 border-dashed shadow-none">
        <CardContent>
          <EmptyState
            icon={CalendarDays}
            title="Your schedule is open"
            description="Add destination dates, travel, stays, or a scheduled plan to shape each day."
          />
        </CardContent>
      </Card>
    );
  }

  const days = new Map<string, TimelineEntry[]>();
  for (const entry of entries) {
    days.set(entry.date, [...(days.get(entry.date) ?? []), entry]);
  }

  return (
    <div className="mt-6 grid gap-5">
      {[...days].map(([date, dayEntries]) => {
        const timed = dayEntries.filter((entry) => entry.time);
        const anytime = dayEntries.filter((entry) => !entry.time);

        return (
          <Card className="gap-0 py-0" key={date}>
            <div className="border-b px-5 py-4 sm:px-6">
              <p className="text-sm font-semibold">{formatDay(date)}</p>
            </div>
            <CardContent className="px-5 py-2 sm:px-6">
              {timed.map((entry) => (
                <TimelineRow key={entry.id} entry={entry} trip={trip} canEdit={canEdit} />
              ))}
              {anytime.length > 0 ? (
                <div className={cn(timed.length > 0 && "border-t")}>
                  <p className="pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Anytime
                  </p>
                  {anytime.map((entry) => (
                    <TimelineRow key={entry.id} entry={entry} trip={trip} canEdit={canEdit} />
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function TimelineRow({
  canEdit,
  entry,
  trip,
}: {
  canEdit: boolean;
  entry: TimelineEntry;
  trip: Trip;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeletePlan(trip.id, entry.plan?.id ?? "");
  const Icon = entry.icon;
  const content = (
    <>
      {entry.time ? (
        <span className="w-14 shrink-0 pt-0.5 text-xs font-medium text-muted-foreground sm:w-16">
          {formatTimeRange(entry.time, entry.endTime)}
        </span>
      ) : null}
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/30">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {entry.eyebrow}
        </p>
        <p className="mt-0.5 font-medium">{entry.title}</p>
        {entry.detail ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{entry.detail}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex items-start gap-3 border-b py-4 last:border-b-0">
      {entry.href ? (
        <Link
          className="flex min-w-0 flex-1 items-start gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          to={entry.href}
        >
          {content}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{content}</div>
      )}
      {entry.plan && canEdit ? (
        <div className="flex shrink-0 gap-1">
          <PlanDialog
            tripId={trip.id}
            stops={trip.stops}
            plan={entry.plan}
            open={editOpen}
            onOpenChange={setEditOpen}
            trigger={
              <Button size="icon" variant="ghost" aria-label={`Edit ${entry.plan.title}`}>
                <Pencil className="size-4" />
              </Button>
            }
          />
          <ConfirmDeleteDialog
            title="Remove this plan?"
            description="This permanently removes the plan from the trip."
            onDelete={() => remove.mutateAsync()}
            trigger={
              <Button size="icon" variant="ghost" aria-label={`Remove ${entry.plan.title}`}>
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function IdeasView({ canEdit, ideas, trip }: { canEdit: boolean; ideas: TripPlan[]; trip: Trip }) {
  if (ideas.length === 0) {
    return (
      <Card className="mt-6 border-dashed shadow-none">
        <CardContent>
          <EmptyState
            icon={Lightbulb}
            title="Save possibilities here"
            description="Collect restaurants, attractions, and activities before deciding when to do them."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mt-6 grid gap-6">
      {trip.stops.map((stop) => {
        const stopIdeas = ideas.filter((idea) => idea.tripStopId === stop.id);
        return stopIdeas.length > 0 ? (
          <DestinationIdeas
            key={stop.id}
            trip={trip}
            stop={stop}
            ideas={stopIdeas}
            canEdit={canEdit}
          />
        ) : null;
      })}
    </div>
  );
}

function DestinationIdeas({
  canEdit,
  ideas,
  stop,
  trip,
}: {
  canEdit: boolean;
  ideas: TripPlan[];
  stop: TripStop;
  trip: Trip;
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">{stop.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}
          </p>
        </div>
        {canEdit ? (
          <PlanDialog
            tripId={trip.id}
            stops={trip.stops}
            initialStopId={stop.id}
            open={addOpen}
            onOpenChange={setAddOpen}
            trigger={
              <Button size="sm" variant="outline">
                <Plus className="size-3.5" />
                Add idea
              </Button>
            }
          />
        ) : null}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {ideas.map((idea) => (
          <IdeaCard key={idea.id} plan={idea} trip={trip} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function IdeaCard({ plan, trip, canEdit }: { plan: TripPlan; trip: Trip; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeletePlan(trip.id, plan.id);
  const Icon = categoryIcons[plan.category];

  return (
    <Card className="gap-4 py-5">
      <CardContent className="flex gap-4 px-5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/30">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {titleCase(plan.category)}
          </p>
          <p className="mt-1 font-medium">{plan.title}</p>
          {plan.location ? (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              {plan.location}
            </p>
          ) : null}
          {plan.notes ? (
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {plan.notes}
            </p>
          ) : null}
          {plan.bookingUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
              href={plan.bookingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open link <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-1">
            <PlanDialog
              tripId={trip.id}
              stops={trip.stops}
              plan={plan}
              open={editOpen}
              onOpenChange={setEditOpen}
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Edit ${plan.title}`}>
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Remove this idea?"
              description="This permanently removes the idea from the trip."
              onDelete={() => remove.mutateAsync()}
              trigger={
                <Button size="icon" variant="ghost" aria-label={`Remove ${plan.title}`}>
                  <Trash2 className="size-4 text-muted-foreground" />
                </Button>
              }
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center text-center">
      <span className="grid size-10 place-items-center rounded-lg border bg-muted/30">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <p className="mt-4 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}

export { ItinerarySection };
