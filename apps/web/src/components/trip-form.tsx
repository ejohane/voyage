import { type CreateTripInput, createTripInputSchema, type Trip } from "@voyage/contracts";
import { LoaderCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiRequestError } from "@/lib/api";

type TripFormProps = {
  initialTrip?: Pick<Trip, "name" | "destination" | "startDate" | "endDate">;
  pendingLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (input: CreateTripInput) => Promise<void>;
};

type FormValues = {
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
};

function initialValues(initialTrip?: TripFormProps["initialTrip"]): FormValues {
  return {
    name: initialTrip?.name ?? "",
    destination: initialTrip?.destination ?? "",
    startDate: initialTrip?.startDate ?? "",
    endDate: initialTrip?.endDate ?? "",
  };
}

function TripForm({ initialTrip, pendingLabel, submitLabel, onCancel, onSubmit }: TripFormProps) {
  const [values, setValues] = useState(() => initialValues(initialTrip));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  function setValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const parsed = createTripInputSchema.safeParse({
      name: values.name,
      destination: values.destination,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      setFieldErrors(
        Object.fromEntries(
          Object.entries(flattened.fieldErrors).filter(
            (entry): entry is [string, string[]] => entry[1] !== undefined,
          ),
        ),
      );
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
          placeholder="Summer in Japan"
          value={values.name}
          onChange={(event) => setValue("name", event.target.value)}
          autoFocus
        />
      </FormField>

      <FormField error={fieldErrors.destination?.[0]} id="trip-destination" label="Destination">
        <Input
          id="trip-destination"
          name="destination"
          placeholder="Tokyo, Japan"
          value={values.destination}
          onChange={(event) => setValue("destination", event.target.value)}
        />
      </FormField>

      <FormField
        error={fieldErrors.startDate?.[0] ?? fieldErrors.endDate?.[0]}
        id="trip-dates"
        label="Trip dates"
      >
        <DateRangePicker
          id="trip-dates"
          startDate={values.startDate}
          endDate={values.endDate}
          invalid={Boolean(fieldErrors.startDate?.[0] ?? fieldErrors.endDate?.[0])}
          onChange={(startDate, endDate) => {
            setValue("startDate", startDate);
            setValue("endDate", endDate);
          }}
        />
      </FormField>

      <p className="-mt-2 text-xs text-muted-foreground">
        Dates are optional. You can add them later.
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
