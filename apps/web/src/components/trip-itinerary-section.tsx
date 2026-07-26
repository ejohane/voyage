import type { CreatePlanInput, Stay, Travel, Trip, TripPlan, TripStop } from "@voyage/contracts";
import { format, parse } from "date-fns";
import {
  BedDouble,
  BusFront,
  CalendarDays,
  CarFront,
  ChevronDown,
  Clock3,
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
import { PlanForm } from "@/components/plan-form";
import { PlanDialog } from "@/components/planning-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  destinationNamesForDate,
  initialStopIdForDate,
  itineraryDates,
} from "@/lib/itinerary-timeline";
import { useCreatePlan, useDeletePlan, usePlans, useStays, useTravel } from "@/lib/planning";
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
  notes?: string | null;
  confirmationNumber?: string | null;
  bookingUrl?: string | null;
  href?: string;
  hrefLabel?: string;
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
        notes: item.notes,
        confirmationNumber: item.confirmationNumber,
        bookingUrl: item.bookingUrl,
        href: `/trips/${trip.id}/travel`,
        hrefLabel: "Open transportation",
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
          notes: item.notes,
          confirmationNumber: item.confirmationNumber,
          bookingUrl: item.bookingUrl,
          href: `/trips/${trip.id}/travel`,
          hrefLabel: "Open transportation",
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
      notes: item.notes,
      confirmationNumber: item.confirmationNumber,
      bookingUrl: item.bookingUrl,
      href: `/trips/${trip.id}/travel`,
      hrefLabel: "Open transportation",
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
        notes: item.notes,
        confirmationNumber: item.confirmationNumber,
        bookingUrl: item.bookingUrl,
        href: `/trips/${trip.id}/travel`,
        hrefLabel: "Open transportation",
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
      detail: stay.address || stopName,
      notes: stay.notes,
      confirmationNumber: stay.confirmationNumber,
      bookingUrl: stay.bookingUrl,
      href: `/trips/${trip.id}/stays`,
      hrefLabel: "Open stay",
    });
    entries.push({
      id: `stay-checkout-${stay.id}`,
      date: stay.checkOutDate,
      time: null,
      icon: BedDouble,
      eyebrow: "Stay checkout",
      title: stay.propertyName,
      detail: stay.address || stopName,
      notes: stay.notes,
      confirmationNumber: stay.confirmationNumber,
      bookingUrl: stay.bookingUrl,
      href: `/trips/${trip.id}/stays`,
      hrefLabel: "Open stay",
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
      notes: plan.notes,
      confirmationNumber: plan.confirmationNumber,
      bookingUrl: plan.bookingUrl,
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
  const [draftSlot, setDraftSlot] = useState<string | null>(null);
  const dates = itineraryDates(
    trip,
    entries.map((entry) => entry.date),
  );

  if (dates.length === 0) {
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
    <div className="relative mt-7 max-w-4xl">
      <div className="absolute bottom-6 left-6 top-5 w-px bg-border" aria-hidden="true" />
      {dates.map((date, dayIndex) => {
        const dayEntries = days.get(date) ?? [];
        const destinations = destinationNamesForDate(trip.stops, date);

        return (
          <section className="relative pb-3" key={date} aria-labelledby={`itinerary-${date}`}>
            <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3 py-2">
              <span className="relative z-10 grid size-8 place-self-center rounded-full border bg-background text-xs font-semibold shadow-sm">
                <span className="m-auto">{dayIndex + 1}</span>
              </span>
              <div className="border-b py-3">
                <h3 id={`itinerary-${date}`} className="font-semibold tracking-tight">
                  {formatDay(date)}
                </h3>
                {destinations.length > 0 ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{destinations.join(" · ")}</p>
                ) : null}
              </div>
            </div>

            <TimelineInsertPoint
              slotId={`${date}:start`}
              active={draftSlot === `${date}:start`}
              date={date}
              trip={trip}
              canEdit={canEdit}
              onOpen={() => setDraftSlot(`${date}:start`)}
              onClose={() => setDraftSlot(null)}
            />
            {dayEntries.map((entry) => (
              <div key={entry.id}>
                <TimelineCard entry={entry} trip={trip} canEdit={canEdit} />
                <TimelineInsertPoint
                  slotId={`${date}:after:${entry.id}`}
                  active={draftSlot === `${date}:after:${entry.id}`}
                  date={date}
                  trip={trip}
                  canEdit={canEdit}
                  onOpen={() => setDraftSlot(`${date}:after:${entry.id}`)}
                  onClose={() => setDraftSlot(null)}
                />
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function TimelineInsertPoint({
  active,
  canEdit,
  date,
  onClose,
  onOpen,
  slotId,
  trip,
}: {
  active: boolean;
  canEdit: boolean;
  date: string;
  onClose: () => void;
  onOpen: () => void;
  slotId: string;
  trip: Trip;
}) {
  if (!canEdit) return <div className="h-4" aria-hidden="true" />;

  if (active) {
    return <TimelineDraftCard date={date} trip={trip} onClose={onClose} />;
  }

  return (
    <div className="group grid h-9 grid-cols-[3rem_minmax(0,1fr)] items-center gap-x-3">
      <Button
        id={`itinerary-insert-${slotId.replaceAll(":", "-")}`}
        size="icon"
        variant="outline"
        className="relative z-20 size-7 place-self-center rounded-full bg-background opacity-50 shadow-sm transition md:scale-90 md:opacity-0 md:group-hover:scale-100 md:group-hover:opacity-100 md:group-focus-within:scale-100 md:group-focus-within:opacity-100"
        aria-label={`Add a plan to ${formatDay(date)}`}
        onClick={onOpen}
      >
        <Plus className="size-3.5" />
      </Button>
      <div className="h-px origin-left scale-x-0 bg-border transition-transform group-hover:scale-x-100 group-focus-within:scale-x-100" />
    </div>
  );
}

function TimelineDraftCard({
  date,
  onClose,
  trip,
}: {
  date: string;
  onClose: () => void;
  trip: Trip;
}) {
  const createPlan = useCreatePlan(trip.id);
  const destinations = destinationNamesForDate(trip.stops, date);

  async function handleSubmit(input: CreatePlanInput) {
    await createPlan.mutateAsync(input);
    onClose();
  }

  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3 py-2">
      <span className="relative z-10 mt-5 grid size-7 place-self-center rounded-full border bg-background shadow-sm">
        <Plus className="m-auto size-3.5 text-muted-foreground" />
      </span>
      <article className="overflow-hidden rounded-xl border bg-card shadow-md ring-1 ring-ring/10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3 sm:px-5">
          <p className="text-sm font-medium">New plan</p>
          <p className="text-xs text-muted-foreground">
            {formatDay(date)}
            {destinations.length > 0 ? ` · ${destinations.join(" · ")}` : ""}
          </p>
        </div>
        <div className="px-4 py-4 sm:px-5">
          <PlanForm
            presentation="inline"
            initialScheduledDate={date}
            initialStopId={initialStopIdForDate(trip.stops, date)}
            stops={trip.stops}
            onCancel={onClose}
            onSubmit={handleSubmit}
          />
        </div>
      </article>
    </div>
  );
}

function TimelineCard({
  canEdit,
  entry,
  trip,
}: {
  canEdit: boolean;
  entry: TimelineEntry;
  trip: Trip;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeletePlan(trip.id, entry.plan?.id ?? "");
  const Icon = entry.icon;

  return (
    <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-x-3">
      <span className="relative z-10 mt-5 grid size-5 place-self-center rounded-full border bg-background">
        <span className="m-auto size-1.5 rounded-full bg-muted-foreground/60" />
      </span>
      <article className="overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
        <button
          type="button"
          className="flex w-full items-start gap-3 px-4 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted/60">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {entry.time ? (
                <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                  <Clock3 className="size-3" />
                  {formatTimeRange(entry.time, entry.endTime)}
                </span>
              ) : (
                <span className="normal-case tracking-normal">Anytime</span>
              )}
              <span aria-hidden="true">·</span>
              <span>{entry.eyebrow}</span>
            </span>
            <span className="mt-1 block font-medium">{entry.title}</span>
            {entry.detail ? (
              <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                {entry.detail}
              </span>
            ) : null}
          </span>
          <ChevronDown
            className={cn(
              "mt-2 size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {expanded ? (
          <div className="border-t bg-muted/15 px-4 py-4 sm:px-5">
            {entry.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {entry.notes}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No additional notes yet.</p>
            )}
            {entry.confirmationNumber ? (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Confirmation </span>
                <span className="font-medium">{entry.confirmationNumber}</span>
              </p>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {entry.bookingUrl ? (
                <a
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted"
                  href={entry.bookingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Booking link <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {entry.href ? (
                <Link
                  className="inline-flex h-8 items-center justify-center gap-2 rounded-md border bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-muted"
                  to={entry.href}
                >
                  {entry.hrefLabel ?? "Open details"}
                </Link>
              ) : null}
              {entry.plan && canEdit ? (
                <>
                  <PlanDialog
                    tripId={trip.id}
                    stops={trip.stops}
                    plan={entry.plan}
                    open={editOpen}
                    onOpenChange={setEditOpen}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Pencil className="size-3.5" />
                        Edit plan
                      </Button>
                    }
                  />
                  <ConfirmDeleteDialog
                    title="Remove this plan?"
                    description="This permanently removes the plan from the trip."
                    onDelete={() => remove.mutateAsync()}
                    trigger={
                      <Button size="sm" variant="ghost">
                        <Trash2 className="size-3.5 text-muted-foreground" />
                        Remove
                      </Button>
                    }
                  />
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </article>
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
