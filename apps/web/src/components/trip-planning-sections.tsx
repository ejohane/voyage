import type {
  CreateStayInput,
  CreateTravelInput,
  Stay,
  Travel,
  Trip,
  TripStop,
} from "@voyage/contracts";
import { format, parse } from "date-fns";
import {
  ArrowUpRight,
  BedDouble,
  BusFront,
  CalendarCheck,
  CarFront,
  ExternalLink,
  Lightbulb,
  MoreHorizontal,
  Plane,
  Plus,
  Route,
  Ship,
  TrainFront,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import { type ComponentType, type ReactNode, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StayForm } from "@/components/stay-form";
import { TravelForm } from "@/components/travel-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceInspector } from "@/components/workspace-inspector";
import { useTripPeople } from "@/lib/invitations";
import {
  useCreateStay,
  useCreateTravel,
  useDeleteStay,
  useDeleteTravel,
  usePlans,
  useStays,
  useTravel,
  useUpdateStay,
  useUpdateTravel,
} from "@/lib/planning";
import { cn } from "@/lib/utils";

type SectionProps = { trip: Trip };

const travelIcons: Record<Travel["type"], ComponentType<{ className?: string }>> = {
  flight: Plane,
  train: TrainFront,
  bus: BusFront,
  drive: CarFront,
  ferry: Ship,
  car: CarFront,
  other: Route,
};

const travelTypePresentation: Record<
  Travel["type"],
  { label: string; card: string; icon: string; badge: string }
> = {
  flight: {
    label: "Flight",
    card: "border-l-sky-500 bg-sky-50/30 hover:bg-sky-50/55",
    icon: "bg-sky-100 text-sky-700",
    badge: "border-sky-200 bg-sky-100/80 text-sky-700",
  },
  train: {
    label: "Train",
    card: "border-l-violet-500 bg-violet-50/30 hover:bg-violet-50/55",
    icon: "bg-violet-100 text-violet-700",
    badge: "border-violet-200 bg-violet-100/80 text-violet-700",
  },
  bus: {
    label: "Bus",
    card: "border-l-orange-500 bg-orange-50/30 hover:bg-orange-50/55",
    icon: "bg-orange-100 text-orange-700",
    badge: "border-orange-200 bg-orange-100/80 text-orange-700",
  },
  drive: {
    label: "Drive / transfer",
    card: "border-l-rose-500 bg-rose-50/30 hover:bg-rose-50/55",
    icon: "bg-rose-100 text-rose-700",
    badge: "border-rose-200 bg-rose-100/80 text-rose-700",
  },
  ferry: {
    label: "Ferry",
    card: "border-l-cyan-500 bg-cyan-50/30 hover:bg-cyan-50/55",
    icon: "bg-cyan-100 text-cyan-700",
    badge: "border-cyan-200 bg-cyan-100/80 text-cyan-700",
  },
  car: {
    label: "Rental car",
    card: "border-l-amber-500 bg-amber-50/35 hover:bg-amber-50/60",
    icon: "bg-amber-100 text-amber-800",
    badge: "border-amber-200 bg-amber-100/85 text-amber-800",
  },
  other: {
    label: "Other",
    card: "border-l-slate-400 bg-slate-50/45 hover:bg-slate-50/75",
    icon: "bg-slate-100 text-slate-700",
    badge: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

function formatLocalDateTime(value: string) {
  return format(parse(value, "yyyy-MM-dd'T'HH:mm", new Date()), "MMM d, yyyy · h:mm a");
}

function formatDateOnly(value: string) {
  return format(parse(value, "yyyy-MM-dd", new Date()), "MMM d, yyyy");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function StatusBadge({ status }: { status: "planning" | "booked" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "booked"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "bg-muted/60 text-muted-foreground",
      )}
    >
      {titleCase(status)}
    </span>
  );
}

function TravelTypeBadge({ type }: { type: Travel["type"] }) {
  const presentation = travelTypePresentation[type];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold",
        presentation.badge,
      )}
    >
      {presentation.label}
    </span>
  );
}

function OverviewSection({ trip }: SectionProps) {
  const travel = useTravel(trip.id);
  const stays = useStays(trip.id);
  const plans = usePlans(trip.id);
  const people = useTripPeople(trip.id);
  const travelBooked = travel.data?.filter((item) => item.status === "booked").length ?? 0;
  const staysBooked = stays.data?.filter((item) => item.status === "booked").length ?? 0;
  const scheduledPlans = plans.data?.filter((item) => item.scheduledDate).length ?? 0;
  const savedIdeas = plans.data?.filter((item) => !item.scheduledDate).length ?? 0;
  const memberCount = people.data?.members.length;
  const openInvitations =
    people.data?.invitations.filter((invitation) =>
      ["pending", "delivery_failed"].includes(invitation.status),
    ).length ?? 0;

  return (
    <section aria-labelledby="workspace-heading">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Trip workspace
          </p>
          <h2 id="workspace-heading" className="mt-1 text-xl font-semibold tracking-tight">
            Pick up where you left off
          </h2>
        </div>
        <p className="hidden text-sm text-muted-foreground sm:block">
          {trip.stops.length} {trip.stops.length === 1 ? "destination" : "destinations"}
        </p>
      </div>

      <div className="grid auto-rows-[10rem] gap-3 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceCard
          className="min-h-48 bg-foreground text-background md:col-span-2"
          description="See the daily schedule, reservations, and committed plans."
          href={`/trips/${trip.id}/itinerary`}
          icon={CalendarCheck}
          meta={
            plans.isPending
              ? "Loading plans…"
              : plans.isError
                ? "Open itinerary"
                : scheduledPlans
                  ? `${scheduledPlans} scheduled`
                  : "Nothing scheduled yet"
          }
          title="Itinerary"
          tone="inverse"
        >
          <ol className="mt-auto grid gap-2 pt-6 sm:grid-cols-2">
            {trip.stops.slice(0, 4).map((stop, index) => (
              <li
                className="flex min-w-0 items-center gap-2 border-t border-background/20 pt-2 text-sm"
                key={stop.id}
              >
                <span className="text-background/55 tabular-nums">{index + 1}</span>
                <span className="truncate">{stop.name}</span>
              </li>
            ))}
          </ol>
        </WorkspaceCard>

        <WorkspaceCard
          className="min-h-48 border-blue-200 bg-blue-50/55 md:col-span-2"
          description="A fast scratchpad for restaurants, sights, reminders, and maybes."
          href={`/trips/${trip.id}/ideas`}
          icon={Lightbulb}
          meta={
            plans.isPending
              ? "Loading ideas…"
              : plans.isError
                ? "Open ideas"
                : savedIdeas
                  ? `${savedIdeas} saved ${savedIdeas === 1 ? "idea" : "ideas"}`
                  : "Ready for your first idea"
          }
          title="Ideas"
        />

        <WorkspaceCard
          className="md:col-span-2"
          description="Flights, trains, transfers, ferries, and rental cars."
          href={`/trips/${trip.id}/travel`}
          icon={Route}
          meta={
            travel.isPending
              ? "Loading transportation…"
              : travel.isError
                ? "Open transportation"
                : travel.data.length
                  ? `${travelBooked} of ${travel.data.length} booked`
                  : "Nothing added"
          }
          title="Transportation"
        >
          <div className="mt-auto flex items-center gap-3 pt-4 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <span className="max-w-32 truncate">{trip.stops[0]?.name}</span>
            <span className="h-px min-w-8 flex-1 bg-border" />
            <Plane className="size-4 shrink-0" aria-hidden="true" />
            <span className="h-px min-w-8 flex-1 bg-border" />
            <span className="max-w-32 truncate">{trip.stops.at(-1)?.name}</span>
          </div>
        </WorkspaceCard>

        <WorkspaceCard
          className="bg-muted/35"
          description="Hotels, rentals, and check-in details."
          href={`/trips/${trip.id}/stays`}
          icon={BedDouble}
          meta={
            stays.isPending
              ? "Loading stays…"
              : stays.isError
                ? "Open stays"
                : stays.data.length
                  ? `${staysBooked} of ${stays.data.length} booked`
                  : "No stays yet"
          }
          title="Stays"
        />

        <WorkspaceCard
          description="Invite travelers and manage access."
          href={`/trips/${trip.id}/people`}
          icon={Users}
          meta={
            people.isPending
              ? "Loading people…"
              : people.isError || memberCount === undefined
                ? "Open people"
                : `${memberCount} ${memberCount === 1 ? "traveler" : "travelers"}${
                    openInvitations ? ` · ${openInvitations} invited` : ""
                  }`
          }
          title="People"
        />
      </div>
    </section>
  );
}

function WorkspaceCard({
  children,
  className,
  description,
  href,
  icon: Icon,
  meta,
  title,
  tone = "default",
}: {
  children?: ReactNode;
  className?: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  meta: string;
  title: string;
  tone?: "default" | "inverse";
}) {
  return (
    <Link
      to={href}
      className={cn(
        "group relative flex min-h-40 flex-col overflow-hidden rounded-lg border bg-background p-5 outline-none transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-md border bg-muted/60",
            tone === "inverse" && "border-background/20 bg-background/10",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <ArrowUpRight
          className={cn(
            "size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5",
            tone === "inverse" && "text-background/60",
          )}
          aria-hidden="true"
        />
      </div>
      <div className="mt-4">
        <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
        <p
          className={cn(
            "mt-1 max-w-md text-sm leading-5 text-muted-foreground",
            tone === "inverse" && "text-background/65",
          )}
        >
          {description}
        </p>
      </div>
      {children}
      <p
        className={cn(
          "mt-auto pt-4 text-xs font-medium text-muted-foreground",
          tone === "inverse" && "text-background/60",
        )}
      >
        {meta}
      </p>
    </Link>
  );
}

function TravelSection({ trip }: SectionProps) {
  const travel = useTravel(trip.id);
  const createTravel = useCreateTravel(trip.id);
  const canEdit = trip.accessLevel !== "viewer";
  const [inspector, setInspector] = useState<
    { mode: "new" } | { mode: "edit"; travelId: string }
  >();
  const [pendingDelete, setPendingDelete] = useState<Travel>();
  const [notice, setNotice] = useState<{ kind: "error" | "saved"; message: string }>();
  const visibleTravel = (travel.data ?? []).filter((item) => item.id !== pendingDelete?.id);
  const selectedTravel =
    inspector?.mode === "edit"
      ? (travel.data ?? []).find((item) => item.id === inspector.travelId)
      : undefined;

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape" && inspector) {
        setInspector(undefined);
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (canEdit && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        setInspector({ mode: "new" });
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [canEdit, inspector]);

  async function handleCreate(input: CreateTravelInput) {
    const item = await createTravel.mutateAsync(input);
    setInspector({ mode: "edit", travelId: item.id });
    setNotice({ kind: "saved", message: "Transportation added." });
    window.setTimeout(() => setNotice(undefined), 3_000);
  }

  function requestDelete(item: Travel) {
    setPendingDelete(item);
    if (inspector?.mode === "edit" && inspector.travelId === item.id) setInspector(undefined);
  }

  return (
    <section aria-labelledby="transportation-heading">
      <div
        className={cn("min-w-0 transition-[padding] duration-200", inspector && "lg:pr-[28rem]")}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="transportation-heading" className="text-xl font-semibold tracking-tight">
              Transportation
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Flights, trains, ferries, transfers, and vehicle rentals in one place.
            </p>
          </div>
          {canEdit && !inspector ? (
            <Button size="lg" onClick={() => setInspector({ mode: "new" })}>
              <Plus className="size-4.5" aria-hidden="true" />
              New transportation
            </Button>
          ) : null}
        </div>

        {travel.isPending ? (
          <div className="mt-5 grid gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : travel.isError ? (
          <LoadError onRetry={() => void travel.refetch()} />
        ) : visibleTravel.length === 0 ? (
          <div className="mt-5 border-t">
            <EmptyMessage
              icon={Plane}
              title="No transportation added yet"
              description="Add your first flight, train, ferry, transfer, or rental car."
            />
          </div>
        ) : (
          <ul className="mt-5 grid gap-2" aria-label="Transportation list">
            {visibleTravel.map((item) => (
              <TravelListCard
                key={item.id}
                item={item}
                canEdit={canEdit}
                isSelected={selectedTravel?.id === item.id}
                onDelete={() => requestDelete(item)}
                onSelect={() => setInspector({ mode: "edit", travelId: item.id })}
                stops={trip.stops}
              />
            ))}
          </ul>
        )}
      </div>

      {inspector ? (
        <TravelInspector
          inspector={inspector}
          item={selectedTravel}
          onClose={() => setInspector(undefined)}
          onCreate={handleCreate}
          stops={trip.stops}
          tripId={trip.id}
        />
      ) : null}

      {pendingDelete ? (
        <TravelDeleteUndoToast
          item={pendingDelete}
          onError={() => {
            setPendingDelete(undefined);
            setNotice({
              kind: "error",
              message: "We couldn’t remove that transportation item. Try again.",
            });
          }}
          onFinished={() => setPendingDelete(undefined)}
          onUndo={() => setPendingDelete(undefined)}
        />
      ) : null}

      {notice ? (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-md border bg-background px-4 py-3 text-sm shadow-lg",
            notice.kind === "error" && "border-red-200 text-red-700",
          )}
          role="status"
        >
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}

function TravelListCard({
  item,
  canEdit,
  isSelected,
  onDelete,
  onSelect,
  stops,
}: {
  item: Travel;
  canEdit: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  stops: TripStop[];
}) {
  const Icon = travelIcons[item.type];
  const presentation = travelTypePresentation[item.type];
  const isRental = item.kind === "rental";
  const departureStop = stops.find((stop) => stop.id === item.departureStopId);
  const arrivalStop = stops.find((stop) => stop.id === item.arrivalStopId);
  const title = isRental
    ? [item.carrier ?? "Rental car", item.vehicleDescription].filter(Boolean).join(" · ")
    : `${item.departureLocation} → ${item.arrivalLocation}`;

  return (
    <li
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md border border-l-4 transition-colors",
        presentation.card,
        isSelected && "ring-2 ring-blue-500/20 ring-offset-1",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={onSelect}
      >
        <span
          className={cn("grid size-9 shrink-0 place-items-center rounded-md", presentation.icon)}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium">{title}</span>
            <TravelTypeBadge type={item.type} />
            <StatusBadge status={item.status} />
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>{formatLocalDateTime(item.departureAt)}</span>
            {item.arrivalAt ? <span>to {formatLocalDateTime(item.arrivalAt)}</span> : null}
            {departureStop || arrivalStop ? (
              <span className="truncate font-medium">
                {departureStop?.name ?? "Outside trip"} → {arrivalStop?.name ?? "Outside trip"}
              </span>
            ) : null}
            {!isRental && (item.carrier || item.referenceNumber) ? (
              <span>{[item.carrier, item.referenceNumber].filter(Boolean).join(" · ")}</span>
            ) : null}
            {item.bookingUrl ? (
              <span className="inline-flex items-center gap-1">
                Booking linked <ExternalLink className="size-3" aria-hidden="true" />
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {canEdit ? (
        <Button
          size="icon"
          variant="ghost"
          className="mr-2 size-8 opacity-60 hover:opacity-100"
          aria-label={`Remove ${title}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

function TravelInspector({
  inspector,
  item,
  onClose,
  onCreate,
  stops,
  tripId,
}: {
  inspector: { mode: "new" } | { mode: "edit"; travelId: string };
  item?: Travel;
  onClose: () => void;
  onCreate: (input: CreateTravelInput) => Promise<void>;
  stops: TripStop[];
  tripId: string;
}) {
  const update = useUpdateTravel(tripId, item?.id ?? "");
  const isNew = inspector.mode === "new";
  const title = item
    ? item.kind === "rental"
      ? item.carrier || "Rental car"
      : `${item.departureLocation} → ${item.arrivalLocation}`
    : "Add transportation";

  async function handleUpdate(input: CreateTravelInput) {
    if (!item) return;
    await update.mutateAsync(input);
  }

  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      description={
        isNew
          ? "Add the route, timing, and any booking details you have."
          : "Update this transportation without leaving the list."
      }
      eyebrow={isNew ? "New transportation" : "Transportation details"}
      onClose={onClose}
      title={title}
    >
      {isNew ? (
        <TravelForm
          key="new-transportation"
          presentation="inspector"
          stops={stops}
          onCancel={onClose}
          onSubmit={onCreate}
        />
      ) : item ? (
        <TravelForm
          key={`${item.id}:${item.updatedAt}`}
          initialTravel={item}
          presentation="inspector"
          stops={stops}
          onCancel={onClose}
          onSubmit={handleUpdate}
        />
      ) : (
        <div className="grid min-h-40 place-items-center">
          <Skeleton className="h-8 w-40" />
        </div>
      )}
    </WorkspaceInspector>
  );
}

function TravelDeleteUndoToast({
  item,
  onError,
  onFinished,
  onUndo,
}: {
  item: Travel;
  onError: () => void;
  onFinished: () => void;
  onUndo: () => void;
}) {
  const remove = useDeleteTravel(item.tripId, item.id);
  const label =
    item.kind === "rental"
      ? item.carrier || "Rental car"
      : `${item.departureLocation} → ${item.arrivalLocation}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void remove.mutateAsync().then(onFinished).catch(onError);
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [onError, onFinished, remove.mutateAsync]);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-4 rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl"
      role="status"
    >
      <span className="max-w-64 truncate">Removed “{label}”</span>
      <Button size="sm" variant="secondary" onClick={onUndo}>
        <Undo2 className="size-3.5" aria-hidden="true" />
        Undo
      </Button>
    </div>
  );
}

function StaysSection({ trip }: SectionProps) {
  const stays = useStays(trip.id);
  const createStay = useCreateStay(trip.id);
  const canEdit = trip.accessLevel !== "viewer";
  const [inspector, setInspector] = useState<{ mode: "new" } | { mode: "edit"; stayId: string }>();
  const [pendingDelete, setPendingDelete] = useState<Stay>();
  const [notice, setNotice] = useState<{ kind: "error" | "saved"; message: string }>();
  const visibleStays = (stays.data ?? []).filter((item) => item.id !== pendingDelete?.id);
  const selectedStay =
    inspector?.mode === "edit"
      ? (stays.data ?? []).find((item) => item.id === inspector.stayId)
      : undefined;

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape" && inspector) {
        setInspector(undefined);
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (canEdit && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        setInspector({ mode: "new" });
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [canEdit, inspector]);

  async function handleCreate(input: CreateStayInput) {
    const item = await createStay.mutateAsync(input);
    setInspector({ mode: "edit", stayId: item.id });
    setNotice({ kind: "saved", message: "Stay added." });
    window.setTimeout(() => setNotice(undefined), 3_000);
  }

  function requestDelete(item: Stay) {
    setPendingDelete(item);
    if (inspector?.mode === "edit" && inspector.stayId === item.id) setInspector(undefined);
  }

  return (
    <section aria-labelledby="stays-heading">
      <div
        className={cn("min-w-0 transition-[padding] duration-200", inspector && "lg:pr-[28rem]")}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="stays-heading" className="text-xl font-semibold tracking-tight">
              Stays
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Hotels, rentals, and every place the group is staying.
            </p>
          </div>
          {canEdit && !inspector ? (
            <Button size="lg" onClick={() => setInspector({ mode: "new" })}>
              <Plus className="size-4.5" aria-hidden="true" />
              New stay
            </Button>
          ) : null}
        </div>

        {stays.isPending ? (
          <div className="mt-5 grid gap-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : stays.isError ? (
          <LoadError onRetry={() => void stays.refetch()} />
        ) : visibleStays.length === 0 ? (
          <div className="mt-5 border-t">
            <EmptyMessage
              icon={BedDouble}
              title="No stays added yet"
              description="Add a hotel, rental, or other accommodation."
            />
          </div>
        ) : (
          <ul className="mt-5 grid gap-2" aria-label="Stays list">
            {visibleStays.map((item) => (
              <StayListCard
                key={item.id}
                item={item}
                canEdit={canEdit}
                isSelected={selectedStay?.id === item.id}
                onDelete={() => requestDelete(item)}
                onSelect={() => setInspector({ mode: "edit", stayId: item.id })}
                stops={trip.stops}
              />
            ))}
          </ul>
        )}
      </div>

      {inspector ? (
        <StayInspector
          inspector={inspector}
          item={selectedStay}
          onClose={() => setInspector(undefined)}
          onCreate={handleCreate}
          stops={trip.stops}
          tripId={trip.id}
        />
      ) : null}

      {pendingDelete ? (
        <StayDeleteUndoToast
          item={pendingDelete}
          onError={() => {
            setPendingDelete(undefined);
            setNotice({ kind: "error", message: "We couldn’t remove that stay. Try again." });
          }}
          onFinished={() => setPendingDelete(undefined)}
          onUndo={() => setPendingDelete(undefined)}
        />
      ) : null}

      {notice ? (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-md border bg-background px-4 py-3 text-sm shadow-lg",
            notice.kind === "error" && "border-red-200 text-red-700",
          )}
          role="status"
        >
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}

function StayListCard({
  item,
  canEdit,
  isSelected,
  onDelete,
  onSelect,
  stops,
}: {
  item: Stay;
  canEdit: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  stops: TripStop[];
}) {
  const stop = stops.find((candidate) => candidate.id === item.tripStopId);

  return (
    <li
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md border bg-background transition-colors hover:bg-muted/25",
        isSelected && "border-blue-200 bg-blue-50/65 hover:bg-blue-50/65",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={onSelect}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted/60">
          <BedDouble className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate font-medium">{item.propertyName}</span>
            <StatusBadge status={item.status} />
          </span>
          <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {stop ? <span className="font-medium">{stop.name}</span> : null}
            <span>
              {formatDateOnly(item.checkInDate)} – {formatDateOnly(item.checkOutDate)}
            </span>
            <span className="truncate">{item.address}</span>
            {item.bookingUrl ? (
              <span className="inline-flex items-center gap-1">
                Booking linked <ExternalLink className="size-3" aria-hidden="true" />
              </span>
            ) : null}
          </span>
        </span>
      </button>
      {canEdit ? (
        <Button
          size="icon"
          variant="ghost"
          className="mr-2 size-8 opacity-60 hover:opacity-100"
          aria-label={`Remove ${item.propertyName}`}
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

function StayInspector({
  inspector,
  item,
  onClose,
  onCreate,
  stops,
  tripId,
}: {
  inspector: { mode: "new" } | { mode: "edit"; stayId: string };
  item?: Stay;
  onClose: () => void;
  onCreate: (input: CreateStayInput) => Promise<void>;
  stops: TripStop[];
  tripId: string;
}) {
  const update = useUpdateStay(tripId, item?.id ?? "");
  const isNew = inspector.mode === "new";

  async function handleUpdate(input: CreateStayInput) {
    if (!item) return;
    await update.mutateAsync(input);
  }

  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      description={
        isNew
          ? "Add the property, dates, and any booking details you have."
          : "Update this stay without leaving the list."
      }
      eyebrow={isNew ? "New stay" : "Stay details"}
      onClose={onClose}
      title={item?.propertyName ?? "Add a stay"}
    >
      {isNew ? (
        <StayForm
          key="new-stay"
          presentation="inspector"
          stops={stops}
          onCancel={onClose}
          onSubmit={onCreate}
        />
      ) : item ? (
        <StayForm
          key={`${item.id}:${item.updatedAt}`}
          initialStay={item}
          presentation="inspector"
          stops={stops}
          onCancel={onClose}
          onSubmit={handleUpdate}
        />
      ) : (
        <div className="grid min-h-40 place-items-center">
          <Skeleton className="h-8 w-40" />
        </div>
      )}
    </WorkspaceInspector>
  );
}

function StayDeleteUndoToast({
  item,
  onError,
  onFinished,
  onUndo,
}: {
  item: Stay;
  onError: () => void;
  onFinished: () => void;
  onUndo: () => void;
}) {
  const remove = useDeleteStay(item.tripId, item.id);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void remove.mutateAsync().then(onFinished).catch(onError);
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [onError, onFinished, remove.mutateAsync]);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-4 rounded-md bg-foreground px-4 py-3 text-sm text-background shadow-xl"
      role="status"
    >
      <span className="max-w-64 truncate">Removed “{item.propertyName}”</span>
      <Button size="sm" variant="secondary" onClick={onUndo}>
        <Undo2 className="size-3.5" aria-hidden="true" />
        Undo
      </Button>
    </div>
  );
}

function EmptyMessage({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
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

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mt-5 border-dashed shadow-none">
      <CardContent>
        <EmptyMessage
          icon={MoreHorizontal}
          title="We couldn’t load this section"
          description="Try again to retrieve the latest trip details."
        />
        <div className="-mt-10 flex justify-center">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export { OverviewSection, StaysSection, TravelSection };
