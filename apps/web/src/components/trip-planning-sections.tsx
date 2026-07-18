import type { Stay, Travel, Trip } from "@voyage/contracts";
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteStay, useDeleteTravel, useStays, useTravel } from "@/lib/planning";
import { cn } from "@/lib/utils";

type SectionProps = { trip: Trip };

const travelIcons: Record<Travel["type"], ComponentType<{ className?: string }>> = {
  flight: Plane,
  train: TrainFront,
  bus: BusFront,
  drive: CarFront,
  ferry: Ship,
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
  const loading = travel.isPending || stays.isPending;
  const items = [
    ...(travel.data ?? []).map((item) => ({
      id: `travel-${item.id}`,
      start: item.departureAt,
      icon: travelIcons[item.type],
      eyebrow: `${titleCase(item.type)} · ${titleCase(item.status)}`,
      title: `${item.departureLocation} → ${item.arrivalLocation}`,
      detail: formatLocalDateTime(item.departureAt),
    })),
    ...(stays.data ?? []).map((item) => ({
      id: `stay-${item.id}`,
      start: `${item.checkInDate}T00:00`,
      icon: BedDouble,
      eyebrow: `Stay · ${titleCase(item.status)}`,
      title: item.propertyName,
      detail: `${formatDateOnly(item.checkInDate)} – ${formatDateOnly(item.checkOutDate)}`,
    })),
  ].sort((left, right) => left.start.localeCompare(right.start));
  const travelBooked = travel.data?.filter((item) => item.status === "booked").length ?? 0;
  const staysBooked = stays.data?.filter((item) => item.status === "booked").length ?? 0;
  const nextItem = items.find((item) => item.start >= format(new Date(), "yyyy-MM-dd'T'HH:mm"));

  if (travel.isError || stays.isError) {
    return (
      <LoadError
        onRetry={() => {
          void travel.refetch();
          void stays.refetch();
        }}
      />
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <Card>
        <CardHeader>
          <CardTitle>Trip timeline</CardTitle>
          <CardDescription>Travel and stays in chronological order.</CardDescription>
        </CardHeader>
        <CardContent>
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
              description="Add travel and stays to see the shape of this trip come together."
            />
          )}
        </CardContent>
      </Card>

      <div className="grid content-start gap-5">
        <Card>
          <CardContent className="flex items-center gap-4">
            <span className="grid size-10 place-items-center rounded-lg border bg-background">
              <CalendarCheck className="size-4 text-muted-foreground" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">Next up</p>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {loading ? "Loading…" : (nextItem?.title ?? "No upcoming reservations")}
              </p>
            </div>
          </CardContent>
        </Card>
        <SummaryCard
          icon={Route}
          label="Travel"
          value={
            travel.data?.length ? `${travelBooked} of ${travel.data.length} booked` : "Not added"
          }
          href={`/trips/${trip.id}/travel`}
        />
        <SummaryCard
          icon={BedDouble}
          label="Stays"
          value={stays.data?.length ? `${staysBooked} of ${stays.data.length} booked` : "Not added"}
          href={`/trips/${trip.id}/stays`}
        />
      </div>
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
      className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="transition-colors group-hover:bg-muted/30">
        <CardContent className="flex items-center gap-4">
          <span className="grid size-10 place-items-center rounded-lg border bg-background">
            <Icon className="size-4 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{value}</p>
          </div>
          <ArrowRight className="size-4 text-muted-foreground" />
        </CardContent>
      </Card>
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
        title="Travel"
        description="Flights, trains, drives, and every leg in between."
        action={
          canEdit ? (
            <TravelDialog
              tripId={trip.id}
              open={addOpen}
              onOpenChange={setAddOpen}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add travel
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
              title="No travel added yet"
              description="Add your first flight, train, drive, or transfer."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4">
          {travel.data.map((item) => (
            <TravelCard key={item.id} item={item} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function TravelCard({ item, canEdit }: { item: Travel; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteTravel(item.tripId, item.id);
  const Icon = travelIcons[item.type];

  return (
    <Card className="gap-4 py-5">
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-muted/30">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {item.departureLocation} <span className="text-muted-foreground">→</span>{" "}
              {item.arrivalLocation}
            </p>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatLocalDateTime(item.departureAt)}
            {item.arrivalAt ? ` – ${formatLocalDateTime(item.arrivalAt)}` : ""}
          </p>
          {item.carrier || item.referenceNumber ? (
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
              travel={item}
              open={editOpen}
              onOpenChange={setEditOpen}
              trigger={
                <Button size="icon" variant="outline" aria-label="Edit travel">
                  <Pencil className="size-4" />
                </Button>
              }
            />
            <ConfirmDeleteDialog
              title="Remove this travel item?"
              description="This permanently removes the route and its booking details from the trip."
              onDelete={() => remove.mutateAsync()}
              trigger={
                <Button size="icon" variant="ghost" aria-label="Remove travel">
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
            <StayCard key={item.id} item={item} canEdit={canEdit} />
          ))}
        </div>
      )}
    </section>
  );
}

function StayCard({ item, canEdit }: { item: Stay; canEdit: boolean }) {
  const [editOpen, setEditOpen] = useState(false);
  const remove = useDeleteStay(item.tripId, item.id);

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
