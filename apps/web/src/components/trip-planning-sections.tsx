import type { Stay, Travel, Trip, TripStop } from "@voyage/contracts";
import { format, parse } from "date-fns";
import {
  ArrowRight,
  BedDouble,
  BusFront,
  CalendarCheck,
  CarFront,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  Route,
  Ship,
  TrainFront,
  Trash2,
} from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { StayDialog, TravelDialog } from "@/components/planning-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteStay, useDeleteTravel, usePlans, useStays, useTravel } from "@/lib/planning";
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

function formatLocalDateTime(value: string) {
  return format(parse(value, "yyyy-MM-dd'T'HH:mm", new Date()), "MMM d, yyyy · h:mm a");
}

function formatDateOnly(value: string) {
  return format(parse(value, "yyyy-MM-dd", new Date()), "MMM d, yyyy");
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function transportationLabel(item: Travel) {
  return item.kind === "rental" ? "Rental car" : titleCase(item.type);
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

function OverviewSection({ trip }: SectionProps) {
  const travel = useTravel(trip.id);
  const stays = useStays(trip.id);
  const plans = usePlans(trip.id);
  const loading = travel.isPending || stays.isPending || plans.isPending;
  const items = [
    ...(travel.data ?? []).map((item) => ({
      id: `travel-${item.id}`,
      start: item.departureAt,
      icon: travelIcons[item.type],
      eyebrow: `${transportationLabel(item)} · ${titleCase(item.status)}`,
      title:
        item.kind === "rental"
          ? [item.carrier ?? "Rental car", item.vehicleDescription].filter(Boolean).join(" · ")
          : `${item.departureLocation} → ${item.arrivalLocation}`,
      detail:
        item.kind === "rental"
          ? `Pick up ${formatLocalDateTime(item.departureAt)} · Return ${formatLocalDateTime(item.arrivalAt ?? item.departureAt)}`
          : formatLocalDateTime(item.departureAt),
    })),
    ...(stays.data ?? []).map((item) => ({
      id: `stay-${item.id}`,
      start: `${item.checkInDate}T00:00`,
      icon: BedDouble,
      eyebrow: `Stay · ${titleCase(item.status)}`,
      title: item.propertyName,
      detail: `${formatDateOnly(item.checkInDate)} – ${formatDateOnly(item.checkOutDate)}`,
    })),
    ...(plans.data ?? [])
      .filter((item) => item.scheduledDate)
      .map((item) => ({
        id: `plan-${item.id}`,
        start: `${item.scheduledDate}T${item.startTime ?? "23:59"}`,
        icon: CalendarCheck,
        eyebrow: `${titleCase(item.category)} · ${titleCase(item.status)}`,
        title: item.title,
        detail: item.startTime
          ? `${formatDateOnly(item.scheduledDate ?? "")} · ${format(
              parse(item.startTime, "HH:mm", new Date()),
              "h:mm a",
            )}`
          : formatDateOnly(item.scheduledDate ?? ""),
      })),
  ].sort((left, right) => left.start.localeCompare(right.start));
  const travelBooked = travel.data?.filter((item) => item.status === "booked").length ?? 0;
  const staysBooked = stays.data?.filter((item) => item.status === "booked").length ?? 0;
  const scheduledPlans = plans.data?.filter((item) => item.scheduledDate).length ?? 0;
  const savedIdeas = plans.data?.filter((item) => !item.scheduledDate).length ?? 0;
  const nextItem = items.find((item) => item.start >= format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  if (travel.isError || stays.isError || plans.isError) {
    return (
      <LoadError
        onRetry={() => {
          void travel.refetch();
          void stays.refetch();
          void plans.refetch();
        }}
      />
    );
  }

  return (
    <div className="divide-y divide-border/70">
      <section className="pb-9">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted/70">
            <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.02em]">Destinations</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your itinerary in travel order.</p>
          </div>
        </div>
        <ol className="mt-5 grid overflow-hidden rounded-xl border border-border/70 bg-muted/15 sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
          {trip.stops.map((stop, index) => (
            <li
              className="flex min-h-20 gap-3 border-b border-border/70 p-4 last:border-b-0 sm:border-b-0"
              key={stop.id}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border/80 bg-background text-xs font-medium">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{stop.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {stop.arrivalDate
                    ? `${formatDateOnly(stop.arrivalDate)}${
                        stop.departureDate ? ` – ${formatDateOnly(stop.departureDate)}` : ""
                      }`
                    : "Dates flexible"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-10 py-9 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-0">
        <div className="lg:pr-10">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-muted/70">
              <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-[-0.02em]">Trip timeline</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Transportation, stays, and plans in chronological order.
              </p>
            </div>
          </div>

          <div className="mt-6 min-h-64 rounded-2xl bg-muted/25 p-5 sm:p-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : items.length > 0 ? (
              <div className="relative space-y-1 before:absolute before:bottom-5 before:left-[15px] before:top-5 before:w-px before:bg-border">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div className="relative flex gap-4 py-3" key={item.id}>
                      <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-background">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {item.eyebrow}
                        </p>
                        <p className="mt-1 font-medium">{item.title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyMessage
                icon={CalendarCheck}
                title="Your timeline is ready"
                description="Add transportation, stays, or a plan to see the trip come together."
              />
            )}
          </div>
        </div>

        <aside className="border-t border-border/70 pt-7 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            At a glance
          </p>
          <div className="flex items-center gap-4 border-b border-border/70 py-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted/70">
              <CalendarCheck className="size-4 text-muted-foreground" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Next up</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {loading ? "Loading…" : (nextItem?.title ?? "No upcoming reservations")}
              </p>
            </div>
          </div>
          <SummaryCard
            icon={CalendarCheck}
            label="Itinerary"
            value={
              scheduledPlans || savedIdeas
                ? `${scheduledPlans} scheduled · ${savedIdeas} saved`
                : "No plans yet"
            }
            href={`/trips/${trip.id}/itinerary`}
          />
          <SummaryCard
            icon={Route}
            label="Transportation"
            value={
              travel.data?.length ? `${travelBooked} of ${travel.data.length} booked` : "Not added"
            }
            href={`/trips/${trip.id}/travel`}
          />
          <SummaryCard
            icon={BedDouble}
            label="Stays"
            value={
              stays.data?.length ? `${staysBooked} of ${stays.data.length} booked` : "Not added"
            }
            href={`/trips/${trip.id}/stays`}
          />
        </aside>
      </section>
    </div>
  );
}

function SummaryCard({
  href,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Link
      to={href}
      className="group flex items-center gap-4 border-b border-border/70 py-5 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted/70">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{value}</p>
      </div>
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function TravelSection({ trip }: SectionProps) {
  const travel = useTravel(trip.id);
  const [addOpen, setAddOpen] = useState(false);
  const canEdit = trip.accessLevel !== "viewer";

  return (
    <section>
      <SectionHeading
        title="Transportation"
        description="Flights, trains, ferries, transfers, and vehicle rentals in one place."
        action={
          canEdit ? (
            <TravelDialog
              tripId={trip.id}
              stops={trip.stops}
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add transportation
                </Button>
              }
            />
          ) : null
        }
      />
      {travel.isPending ? (
        <SectionSkeleton />
      ) : travel.isError ? (
        <LoadError onRetry={() => void travel.refetch()} />
      ) : travel.data.length === 0 ? (
        <Card className="mt-5 border-dashed shadow-none">
          <CardContent>
            <EmptyMessage
              icon={Plane}
              title="No transportation added yet"
              description="Add your first flight, train, ferry, transfer, or rental car."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4">
          {travel.data.map((item) => (
            <TravelCard key={item.id} item={item} canEdit={canEdit} stops={trip.stops} />
          ))}
        </div>
      )}
    </section>
  );
}

function TravelCard({
  item,
  canEdit,
  stops,
}: {
  item: Travel;
  canEdit: boolean;
  stops: TripStop[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteTravel(item.tripId, item.id);
  const Icon = travelIcons[item.type];
  const isRental = item.kind === "rental";
  const departureStop = stops.find((stop) => stop.id === item.departureStopId);
  const arrivalStop = stops.find((stop) => stop.id === item.arrivalStopId);

  return (
    <Card className="gap-4 py-5">
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/30">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {isRental ? (
                [item.carrier ?? "Rental car", item.vehicleDescription].filter(Boolean).join(" · ")
              ) : (
                <>
                  {item.departureLocation} <span className="text-muted-foreground">→</span>{" "}
                  {item.arrivalLocation}
                </>
              )}
            </p>
            <StatusBadge status={item.status} />
          </div>
          {isRental ? (
            <>
              <p className="mt-1 text-sm">
                <span className="font-medium">Pick up:</span> {item.departureLocation}
                <span className="mx-2 text-muted-foreground">→</span>
                <span className="font-medium">Return:</span> {item.arrivalLocation}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatLocalDateTime(item.departureAt)} –{" "}
                {formatLocalDateTime(item.arrivalAt ?? item.departureAt)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {formatLocalDateTime(item.departureAt)}
              {item.arrivalAt ? ` – ${formatLocalDateTime(item.arrivalAt)}` : ""}
            </p>
          )}
          {departureStop || arrivalStop ? (
            <p className="mt-2 text-xs font-medium text-muted-foreground">
              {departureStop?.name ?? "Outside this trip"} →{" "}
              {arrivalStop?.name ?? "Outside this trip"}
            </p>
          ) : null}
          {!isRental && (item.carrier || item.referenceNumber) ? (
            <p className="mt-3 text-sm">
              {[item.carrier, item.referenceNumber].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          {item.confirmationNumber ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmation:{" "}
              <span className="font-medium text-foreground">{item.confirmationNumber}</span>
            </p>
          ) : null}
          {item.notes ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.notes}
            </p>
          ) : null}
          {item.bookingUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
              href={item.bookingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open booking <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-2">
            <TravelDialog
              tripId={item.tripId}
              stops={stops}
              travel={item}
              open={editOpen}
              onOpenChange={setEditOpen}
              trigger={
                <Button size="icon" variant="outline" aria-label="Edit transportation">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Remove this transportation item?"
              description="This permanently removes the journey or rental and its booking details from the trip."
              onDelete={() => remove.mutateAsync()}
              trigger={
                <Button size="icon" variant="ghost" aria-label="Remove transportation">
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

function StaysSection({ trip }: SectionProps) {
  const stays = useStays(trip.id);
  const [addOpen, setAddOpen] = useState(false);
  const canEdit = trip.accessLevel !== "viewer";

  return (
    <section>
      <SectionHeading
        title="Stays"
        description="Hotels, rentals, and every place the group is staying."
        action={
          canEdit ? (
            <StayDialog
              tripId={trip.id}
              stops={trip.stops}
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add stay
                </Button>
              }
            />
          ) : null
        }
      />
      {stays.isPending ? (
        <SectionSkeleton />
      ) : stays.isError ? (
        <LoadError onRetry={() => void stays.refetch()} />
      ) : stays.data.length === 0 ? (
        <Card className="mt-5 border-dashed shadow-none">
          <CardContent>
            <EmptyMessage
              icon={BedDouble}
              title="No stays added yet"
              description="Add a hotel, rental, or other accommodation."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4">
          {stays.data.map((item) => (
            <StayCard key={item.id} item={item} canEdit={canEdit} stops={trip.stops} />
          ))}
        </div>
      )}
    </section>
  );
}

function StayCard({ item, canEdit, stops }: { item: Stay; canEdit: boolean; stops: TripStop[] }) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteStay(item.tripId, item.id);
  const stop = stops.find((candidate) => candidate.id === item.tripStopId);

  return (
    <Card className="gap-4 py-5">
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/30">
          <BedDouble className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{item.propertyName}</p>
            <StatusBadge status={item.status} />
          </div>
          {stop ? (
            <p className="mt-1 text-xs font-medium text-muted-foreground">{stop.name}</p>
          ) : null}
          <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {item.address}
          </p>
          <p className="mt-3 text-sm">
            {formatDateOnly(item.checkInDate)} – {formatDateOnly(item.checkOutDate)}
          </p>
          {item.confirmationNumber ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Confirmation:{" "}
              <span className="font-medium text-foreground">{item.confirmationNumber}</span>
            </p>
          ) : null}
          {item.notes ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
              {item.notes}
            </p>
          ) : null}
          {item.bookingUrl ? (
            <a
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
              href={item.bookingUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open booking <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex shrink-0 gap-2">
            <StayDialog
              tripId={item.tripId}
              stops={stops}
              stay={item}
              open={editOpen}
              onOpenChange={setEditOpen}
              trigger={
                <Button size="icon" variant="outline" aria-label="Edit stay">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Remove this stay?"
              description="This permanently removes the accommodation and its booking details from the trip."
              onDelete={() => remove.mutateAsync()}
              trigger={
                <Button size="icon" variant="ghost" aria-label="Remove stay">
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

function SectionHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
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

function SectionSkeleton() {
  return (
    <div className="mt-5 grid gap-4">
      <Skeleton className="h-40" />
      <Skeleton className="h-40" />
    </div>
  );
}

export { OverviewSection, StaysSection, TravelSection };
