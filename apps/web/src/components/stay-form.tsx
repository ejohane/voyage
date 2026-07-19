import {
  type CreateStayInput,
  createStayInputSchema,
  type Stay,
  type TripStop,
} from "@voyage/contracts";
import { LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api";

type StayFormProps = {
  initialStay?: Stay;
  onCancel: () => void;
  onSubmit: (input: CreateStayInput) => Promise<void>;
  stops: TripStop[];
};

type StayFormValues = {
  status: "planning" | "booked";
  tripStopId: string;
  propertyName: string;
  address: string;
  checkInDate: string;
  checkOutDate: string;
  confirmationNumber: string;
  bookingUrl: string;
  notes: string;
};

function initialValues(stops: TripStop[], initialStay?: Stay): StayFormValues {
  return {
    status: initialStay?.status ?? "planning",
    tripStopId: initialStay?.tripStopId ?? (stops.length === 1 ? stops[0].id : ""),
    propertyName: initialStay?.propertyName ?? "",
    address: initialStay?.address ?? "",
    checkInDate: initialStay?.checkInDate ?? "",
    checkOutDate: initialStay?.checkOutDate ?? "",
    confirmationNumber: initialStay?.confirmationNumber ?? "",
    bookingUrl: initialStay?.bookingUrl ?? "",
    notes: initialStay?.notes ?? "",
  };
}

function StayForm({ initialStay, onCancel, onSubmit, stops }: StayFormProps) {
  const [values, setValues] = useState(() => initialValues(stops, initialStay));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  function setValue<Field extends keyof StayFormValues>(
    field: Field,
    value: StayFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const parsed = createStayInputSchema.safeParse({
      status: values.status,
      tripStopId: values.tripStopId || null,
      propertyName: values.propertyName,
      address: values.address,
      checkInDate: values.checkInDate,
      checkOutDate: values.checkOutDate,
      confirmationNumber: values.confirmationNumber || null,
      bookingUrl: values.bookingUrl || null,
      notes: values.notes || null,
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

  const dateError = fieldErrors.checkInDate?.[0] ?? fieldErrors.checkOutDate?.[0];

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <FormField id="stay-destination" label="Destination" error={fieldErrors.tripStopId?.[0]}>
        <Select value={values.tripStopId} onValueChange={(value) => setValue("tripStopId", value)}>
          <SelectTrigger id="stay-destination">
            <SelectValue placeholder="Choose a destination" />
          </SelectTrigger>
          <SelectContent>
            {stops.map((stop) => (
              <SelectItem value={stop.id} key={stop.id}>
                {stop.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <FormField id="stay-property" label="Property name" error={fieldErrors.propertyName?.[0]}>
          <Input
            id="stay-property"
            placeholder="Memmo Alfama"
            value={values.propertyName}
            onChange={(event) => setValue("propertyName", event.target.value)}
          />
        </FormField>
        <FormField id="stay-status" label="Status">
          <Select
            value={values.status}
            onValueChange={(value) => setValue("status", value as "planning" | "booked")}
          >
            <SelectTrigger id="stay-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField id="stay-address" label="Address" error={fieldErrors.address?.[0]}>
        <Input
          id="stay-address"
          placeholder="Travessa das Merceeiras 27, Lisbon"
          value={values.address}
          onChange={(event) => setValue("address", event.target.value)}
        />
      </FormField>

      <FormField id="stay-dates" label="Check-in and checkout" error={dateError}>
        <DateRangePicker
          id="stay-dates"
          startDate={values.checkInDate}
          endDate={values.checkOutDate}
          invalid={Boolean(dateError)}
          onChange={(checkInDate, checkOutDate) => {
            setValue("checkInDate", checkInDate);
            setValue("checkOutDate", checkOutDate);
          }}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="stay-confirmation"
          label="Confirmation number"
          description="Only visible to members of this trip."
          error={fieldErrors.confirmationNumber?.[0]}
        >
          <Input
            id="stay-confirmation"
            value={values.confirmationNumber}
            onChange={(event) => setValue("confirmationNumber", event.target.value)}
          />
        </FormField>
        <FormField id="stay-booking-url" label="Booking link" error={fieldErrors.bookingUrl?.[0]}>
          <Input
            id="stay-booking-url"
            type="url"
            placeholder="https://…"
            value={values.bookingUrl}
            onChange={(event) => setValue("bookingUrl", event.target.value)}
          />
        </FormField>
      </div>

      <FormField id="stay-notes" label="Notes" error={fieldErrors.notes?.[0]}>
        <Textarea
          id="stay-notes"
          placeholder="Check-in instructions, room details, or contact information"
          value={values.notes}
          onChange={(event) => setValue("notes", event.target.value)}
        />
      </FormField>

      {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isPending ? "Saving…" : initialStay ? "Save changes" : "Add stay"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { StayForm };
