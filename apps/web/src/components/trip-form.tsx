import {
  type CreateTripInput,
  createTripInputSchema,
  type Trip,
  type TripStopLocation,
} from "@voyage/contracts";
import { ArrowDown, ArrowUp, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { DestinationAutocomplete } from "@/components/destination-autocomplete";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api";

type TripFormProps = {
  initialTrip?: Pick<Trip, "name" | "stops">;
  pendingLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: CreateTripInput) => Promise<void>;
};

type StopFormValue = {
  clientId: string;
  id?: string;
  name: string;
  location: TripStopLocation | null;
  arrivalDate: string;
  departureDate: string;
};

type FormValues = {
  name: string;
  stops: StopFormValue[];
};

function blankStop(): StopFormValue {
  return {
    clientId: crypto.randomUUID(),
    name: "",
    location: null,
    arrivalDate: "",
    departureDate: "",
  };
}

function initialValues(initialTrip?: TripFormProps["initialTrip"]): FormValues {
  return {
    name: initialTrip?.name ?? "",
    stops: initialTrip?.stops.map((stop) => ({
      clientId: stop.id,
      id: stop.id,
      name: stop.name,
      location: stop.location,
      arrivalDate: stop.arrivalDate ?? "",
      departureDate: stop.departureDate ?? "",
    })) ?? [blankStop()],
  };
}

function validationErrors(error: {
  issues: { message: string; path: PropertyKey[] }[];
}): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.map(String).join(".");
    errors[key] = [...(errors[key] ?? []), issue.message];
  }

  return errors;
}

function TripForm({ initialTrip, pendingLabel, submitLabel, onCancel, onSubmit }: TripFormProps) {
  const [values, setValues] = useState(() => initialValues(initialTrip));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  function setValue(field: "name", value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
  }

  function setStopValue(
    index: number,
    field: "name" | "arrivalDate" | "departureDate",
    value: string,
  ) {
    setValues((current) => ({
      ...current,
      stops: current.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, [field]: value } : stop,
      ),
    }));
    setFieldErrors((current) => ({
      ...current,
      [`stops.${index}.${field}`]: [],
      stops: [],
    }));
  }

  function setStopDestination(index: number, name: string, location: TripStopLocation | null) {
    setValues((current) => ({
      ...current,
      stops: current.stops.map((stop, stopIndex) =>
        stopIndex === index ? { ...stop, name, location } : stop,
      ),
    }));
    setFieldErrors((current) => ({
      ...current,
      [`stops.${index}.name`]: [],
      stops: [],
    }));
  }

  function addStop() {
    setValues((current) => ({ ...current, stops: [...current.stops, blankStop()] }));
    setFieldErrors((current) => ({ ...current, stops: [] }));
  }

  function removeStop(index: number) {
    setValues((current) => ({
      ...current,
      stops: current.stops.filter((_, stopIndex) => stopIndex !== index),
    }));
    setFieldErrors({});
  }

  function moveStop(index: number, direction: -1 | 1) {
    setValues((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.stops.length) return current;

      const stops = [...current.stops];
      [stops[index], stops[nextIndex]] = [stops[nextIndex], stops[index]];
      return { ...current, stops };
    });
    setFieldErrors({});
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const parsed = createTripInputSchema.safeParse({
      name: values.name,
      stops: values.stops.map((stop) => ({
        id: stop.id,
        name: stop.name,
        location: stop.location,
        arrivalDate: stop.arrivalDate || null,
        departureDate: stop.departureDate || null,
      })),
    });

    if (!parsed.success) {
      setFieldErrors(validationErrors(parsed.error));
      return;
    }

    setIsPending(true);

    try {
      await onSubmit(parsed.data);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setFieldErrors(error.fieldErrors ?? {});
        setFormError(error.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <FormField error={fieldErrors.name?.[0]} id="trip-name" label="Trip name">
        <Input
          id="trip-name"
          name="name"
          placeholder="European summer"
          value={values.name}
          onChange={(event) => setValue("name", event.target.value)}
          autoFocus
        />
      </FormField>

      <div className="grid gap-3">
        <div>
          <Label>Destinations</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Add each stop in the order you plan to visit it.
          </p>
        </div>

        {values.stops.map((stop, index) => {
          const nameError = fieldErrors[`stops.${index}.name`]?.[0];
          const dateError =
            fieldErrors[`stops.${index}.arrivalDate`]?.[0] ??
            fieldErrors[`stops.${index}.departureDate`]?.[0];
          const stopNameId = `trip-stop-${index}-name`;
          const stopDatesId = `trip-stop-${index}-dates`;

          return (
            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4" key={stop.clientId}>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Stop {index + 1}</p>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Move stop ${index + 1} up`}
                    disabled={index === 0 || isPending}
                    onClick={() => moveStop(index, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Move stop ${index + 1} down`}
                    disabled={index === values.stops.length - 1 || isPending}
                    onClick={() => moveStop(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Remove stop ${index + 1}`}
                    disabled={values.stops.length === 1 || isPending}
                    onClick={() => removeStop(index)}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </div>

              <FormField error={nameError} id={stopNameId} label="Destination">
                <DestinationAutocomplete
                  id={stopNameId}
                  placeholder={index === 0 ? "Paris, France" : "Amsterdam, Netherlands"}
                  value={stop.name}
                  location={stop.location}
                  invalid={Boolean(nameError)}
                  disabled={isPending}
                  onChange={(name, location) => setStopDestination(index, name, location)}
                />
              </FormField>

              <FormField error={dateError} id={stopDatesId} label="Stop dates (optional)">
                <DateRangePicker
                  id={stopDatesId}
                  startDate={stop.arrivalDate}
                  endDate={stop.departureDate}
                  placeholder="Add arrival and departure"
                  invalid={Boolean(dateError)}
                  onChange={(arrivalDate, departureDate) => {
                    setStopValue(index, "arrivalDate", arrivalDate);
                    setStopValue(index, "departureDate", departureDate);
                  }}
                />
              </FormField>
            </div>
          );
        })}

        {fieldErrors.stops?.[0] ? (
          <p className="text-xs text-red-600">{fieldErrors.stops[0]}</p>
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="justify-start border-dashed"
          disabled={values.stops.length >= 20 || isPending}
          onClick={addStop}
        >
          <Plus className="size-4" />
          Add destination
        </Button>
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Destination dates are optional. Your trip dates update automatically from them.
      </p>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FormField({
  children,
  error,
  id,
  label,
}: {
  children: ReactNode;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export { TripForm };
