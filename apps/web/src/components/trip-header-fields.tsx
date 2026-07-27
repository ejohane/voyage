import type { Trip, TripStopLocation, UpdateTripInput } from "@voyage/contracts";
import { CalendarDays, Clock3, LoaderCircle, MapPin, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import type { DateRange } from "react-day-picker";
import { DestinationAutocomplete } from "@/components/destination-autocomplete";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatTripDates, formatTripDestinations, formatTripDuration } from "@/lib/format-trip";
import { useUpdateTrip } from "@/lib/trips";
import { cn } from "@/lib/utils";

type TripHeaderFieldsProps = {
  presentation?: "hero" | "workspace";
  trip: Trip;
};

type InlineTextFieldProps = {
  className?: string;
  destination?: {
    location: TripStopLocation | null;
    placeholder: string;
  };
  displayValue?: string;
  label: string;
  onSave: (value: string, location: TripStopLocation | null) => Promise<void>;
  value: string;
};

function InlineTextField({
  className,
  destination,
  displayValue,
  label,
  onSave,
  value,
}: InlineTextFieldProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [draftLocation, setDraftLocation] = useState<TripStopLocation | null>(
    destination?.location ?? null,
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string>();

  function startEditing() {
    setDraft(value);
    setDraftLocation(destination?.location ?? null);
    setError(undefined);
    setOpen(true);
  }

  async function save() {
    const nextValue = draft.trim();
    if (!nextValue) {
      setError(`Enter a ${label.toLowerCase()}.`);
      return;
    }
    const locationChanged = destination && draftLocation?.placeId !== destination.location?.placeId;
    if ((nextValue === value && !locationChanged) || isPending) {
      setOpen(false);
      return;
    }

    setIsPending(true);
    setError(undefined);

    try {
      await onSave(nextValue, draftLocation);
      setOpen(false);
    } catch {
      setError("We couldn’t save that change. Try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          "group inline-flex max-w-full items-baseline gap-1 rounded-md px-1 text-left outline-none transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring",
          error && "text-red-700",
          className,
        )}
        aria-label={`Edit ${label}`}
        onClick={startEditing}
      >
        {displayValue ?? value}
        <Pencil
          className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
          aria-hidden="true"
        />
      </button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isPending) setOpen(nextOpen);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {label.toLowerCase()}</DialogTitle>
            <DialogDescription>Update this detail for everyone sharing the trip.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {destination ? (
              <DestinationAutocomplete
                id={`trip-header-${label.toLowerCase().replaceAll(" ", "-")}`}
                value={draft}
                location={draftLocation}
                placeholder={destination.placeholder}
                disabled={isPending}
                onChange={(name, location) => {
                  setDraft(name);
                  setDraftLocation(location);
                  setError(undefined);
                }}
              />
            ) : (
              <Input
                aria-label={label}
                autoFocus
                disabled={isPending}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            )}
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function parseDateOnly(value: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateOnly(date?: Date) {
  if (!date) return "";

  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function InlineDateField({
  trip,
  onSave,
}: {
  onSave: (startDate: string, endDate: string) => Promise<void>;
  trip: Trip;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: parseDateOnly(trip.startDate ?? ""),
    to: parseDateOnly(trip.endDate ?? ""),
  });
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) {
      setRange({
        from: parseDateOnly(trip.startDate ?? ""),
        to: parseDateOnly(trip.endDate ?? ""),
      });
    }
  }, [open, trip.endDate, trip.startDate]);

  async function save() {
    const startDate = formatDateOnly(range?.from);
    const endDate = formatDateOnly(range?.to);

    if (startDate === (trip.startDate ?? "") && endDate === (trip.endDate ?? "")) {
      setOpen(false);
      return;
    }

    setIsPending(true);
    setError(false);

    try {
      await onSave(startDate, endDate);
      setOpen(false);
    } catch {
      setError(true);
      setRange({
        from: parseDateOnly(trip.startDate ?? ""),
        to: parseDateOnly(trip.endDate ?? ""),
      });
    } finally {
      setIsPending(false);
    }
  }

  const displayTrip = {
    startDate: formatDateOnly(range?.from) || null,
    endDate: formatDateOnly(range?.to) || null,
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          "group inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring",
          error && "text-red-700",
        )}
        aria-label="Edit trip dates"
        disabled={isPending}
        onClick={() => {
          setError(false);
          setOpen(true);
        }}
      >
        {formatTripDates(displayTrip)}
        <Pencil
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
          aria-hidden="true"
        />
      </button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!isPending) setOpen(nextOpen);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit trip dates</DialogTitle>
            <DialogDescription>Choose the dates for this trip.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center rounded-lg border bg-muted/20 p-2">
            <Calendar
              mode="range"
              selected={range}
              defaultMonth={range?.from}
              onSelect={setRange}
              autoFocus
            />
          </div>
          {error ? (
            <p className="text-sm text-red-600">We couldn’t save those dates. Try again.</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={isPending}
              onClick={() => setRange(undefined)}
            >
              Clear
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isPending} onClick={() => void save()}>
              {isPending ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Save dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function editableStops(trip: Trip): NonNullable<UpdateTripInput["stops"]> {
  return trip.stops.map((stop) => ({
    id: stop.id,
    name: stop.name,
    location: stop.location,
    arrivalDate: stop.arrivalDate,
    departureDate: stop.departureDate,
  }));
}

function TripHeaderFields({ presentation = "hero", trip }: TripHeaderFieldsProps) {
  const updateTrip = useUpdateTrip(trip.id);
  const editable = trip.accessLevel !== "viewer";
  const workspace = presentation === "workspace";

  if (!editable) {
    return (
      <>
        <p
          className={cn(
            "flex items-center gap-2 font-medium text-muted-foreground",
            workspace ? "text-xs" : "text-sm",
          )}
        >
          <MapPin className="size-4 shrink-0" aria-hidden="true" />
          <span>{formatTripDestinations(trip)}</span>
        </p>
        <h1
          className={cn(
            "font-semibold tracking-tight",
            workspace ? "mt-1.5 text-2xl sm:text-3xl" : "mt-3 text-4xl sm:text-5xl lg:text-6xl",
          )}
        >
          {trip.name}
        </h1>
        <div
          className={cn(
            "flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground",
            workspace ? "mt-3" : "mt-5",
          )}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4" aria-hidden="true" />
            {formatTripDates(trip)}
          </span>
          <span className="flex items-center gap-2">
            <Clock3 className="size-4" aria-hidden="true" />
            {formatTripDuration(trip)}
          </span>
        </div>
      </>
    );
  }

  const firstStop = trip.stops[0];

  return (
    <>
      <p
        className={cn(
          "flex items-center gap-2 font-medium text-muted-foreground",
          workspace ? "text-xs" : "text-sm",
        )}
      >
        <MapPin className="size-4 shrink-0" aria-hidden="true" />
        <InlineTextField
          destination={{
            location: firstStop?.location ?? null,
            placeholder: "Search a country, city, or address…",
          }}
          label="Trip location"
          displayValue={formatTripDestinations(trip)}
          value={firstStop?.name ?? ""}
          onSave={async (value, location) => {
            if (!firstStop) return;

            const stops = editableStops(trip).map((stop, index) =>
              index === 0 ? { ...stop, name: value, location } : stop,
            );
            await updateTrip.mutateAsync({ stops });
          }}
        />
      </p>
      <h1
        className={cn(
          "font-semibold tracking-tight",
          workspace ? "mt-1.5 text-2xl sm:text-3xl" : "mt-3 text-4xl sm:text-5xl lg:text-6xl",
        )}
      >
        <InlineTextField
          className="text-inherit"
          label="Trip title"
          value={trip.name}
          onSave={async (value) => {
            await updateTrip.mutateAsync({ name: value });
          }}
        />
      </h1>
      <div
        className={cn(
          "flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground",
          workspace ? "mt-3" : "mt-5",
        )}
      >
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4" aria-hidden="true" />
          <InlineDateField
            trip={trip}
            onSave={async (startDate, endDate) => {
              const stops = editableStops(trip).map((stop, index, allStops) => ({
                ...stop,
                arrivalDate: index === 0 ? startDate || null : stop.arrivalDate,
                departureDate: index === allStops.length - 1 ? endDate || null : stop.departureDate,
              }));
              await updateTrip.mutateAsync({ stops });
            }}
          />
        </span>
        <span className="flex items-center gap-2">
          <Clock3 className="size-4" aria-hidden="true" />
          {formatTripDuration(trip)}
        </span>
      </div>
    </>
  );
}

export { TripHeaderFields };
