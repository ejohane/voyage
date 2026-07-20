import {
  type CreateTravelInput,
  createTravelInputSchema,
  type TransportationKind,
  type Travel,
  type TravelType,
  type TripStop,
} from "@voyage/contracts";
import { LoaderCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DatePicker } from "@/components/date-picker";
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

type TravelFormProps = {
  initialTravel?: Travel;
  onCancel: () => void;
  onSubmit: (input: CreateTravelInput) => Promise<void>;
  stops: TripStop[];
  submitLabel?: string;
};

type TravelFormValues = {
  kind: TransportationKind;
  type: TravelType;
  status: "planning" | "booked";
  departureStopId: string;
  arrivalStopId: string;
  departureLocation: string;
  arrivalLocation: string;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
  carrier: string;
  referenceNumber: string;
  vehicleDescription: string;
  confirmationNumber: string;
  bookingUrl: string;
  notes: string;
};

function splitLocalDateTime(value?: string | null) {
  if (!value) return { date: "", time: "" };
  const [date, time] = value.split("T");
  return { date, time };
}

function initialValues(initialTravel?: Travel): TravelFormValues {
  const departure = splitLocalDateTime(initialTravel?.departureAt);
  const arrival = splitLocalDateTime(initialTravel?.arrivalAt);

  return {
    kind: initialTravel?.kind ?? "journey",
    type: initialTravel?.type ?? "flight",
    status: initialTravel?.status ?? "planning",
    departureStopId: initialTravel?.departureStopId ?? "",
    arrivalStopId: initialTravel?.arrivalStopId ?? "",
    departureLocation: initialTravel?.departureLocation ?? "",
    arrivalLocation: initialTravel?.arrivalLocation ?? "",
    departureDate: departure.date,
    departureTime: departure.time,
    arrivalDate: arrival.date,
    arrivalTime: arrival.time,
    carrier: initialTravel?.carrier ?? "",
    referenceNumber: initialTravel?.referenceNumber ?? "",
    vehicleDescription: initialTravel?.vehicleDescription ?? "",
    confirmationNumber: initialTravel?.confirmationNumber ?? "",
    bookingUrl: initialTravel?.bookingUrl ?? "",
    notes: initialTravel?.notes ?? "",
  };
}

function TravelForm({ initialTravel, onCancel, onSubmit, stops, submitLabel }: TravelFormProps) {
  const [values, setValues] = useState(() => initialValues(initialTravel));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  function setValue<Field extends keyof TravelFormValues>(
    field: Field,
    value: TravelFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    const errorField =
      field === "departureDate" || field === "departureTime"
        ? "departureAt"
        : field === "arrivalDate" || field === "arrivalTime"
          ? "arrivalAt"
          : field;
    setFieldErrors((current) => ({ ...current, [errorField]: [] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    if (Boolean(values.arrivalDate) !== Boolean(values.arrivalTime)) {
      setFieldErrors((current) => ({
        ...current,
        arrivalAt: ["Choose both an arrival date and time, or leave both blank."],
      }));
      return;
    }

    const parsed = createTravelInputSchema.safeParse({
      kind: values.kind,
      type: values.type,
      status: values.status,
      departureStopId: values.departureStopId || null,
      arrivalStopId: values.arrivalStopId || null,
      departureLocation: values.departureLocation,
      arrivalLocation: values.arrivalLocation,
      departureAt:
        values.departureDate && values.departureTime
          ? `${values.departureDate}T${values.departureTime}`
          : "",
      arrivalAt:
        values.arrivalDate && values.arrivalTime
          ? `${values.arrivalDate}T${values.arrivalTime}`
          : null,
      carrier: values.carrier || null,
      referenceNumber: values.referenceNumber || null,
      vehicleDescription: values.vehicleDescription || null,
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

  const isRental = values.kind === "rental";
  const transportationType = `${values.kind}:${values.type}`;

  function setTransportationType(value: string) {
    const [kind, type] = value.split(":") as [TransportationKind, TravelType];
    setValues((current) => ({
      ...current,
      kind,
      type,
      referenceNumber: kind === "rental" ? "" : current.referenceNumber,
      vehicleDescription: kind === "journey" ? "" : current.vehicleDescription,
    }));
    setFieldErrors((current) => ({ ...current, kind: [], type: [], arrivalAt: [] }));
  }

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="travel-type" label="Transportation type">
          <Select value={transportationType} onValueChange={setTransportationType}>
            <SelectTrigger id="travel-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="journey:flight">Flight</SelectItem>
              <SelectItem value="journey:train">Train</SelectItem>
              <SelectItem value="journey:bus">Bus</SelectItem>
              <SelectItem value="journey:ferry">Ferry</SelectItem>
              <SelectItem value="journey:drive">Drive or transfer</SelectItem>
              <SelectItem value="rental:car">Rental car</SelectItem>
              <SelectItem value="journey:other">Other journey</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField id="travel-status" label="Status">
          <Select
            value={values.status}
            onValueChange={(value) => setValue("status", value as "planning" | "booked")}
          >
            <SelectTrigger id="travel-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="planning">Planning</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="departure-stop"
          label={`${isRental ? "Pickup" : "Leaving"} destination (optional)`}
          error={fieldErrors.departureStopId?.[0]}
        >
          <Select
            value={values.departureStopId || "none"}
            onValueChange={(value) => setValue("departureStopId", value === "none" ? "" : value)}
          >
            <SelectTrigger id="departure-stop">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Outside this trip</SelectItem>
              {stops.map((stop) => (
                <SelectItem value={stop.id} key={stop.id}>
                  {stop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          id="arrival-stop"
          label={`${isRental ? "Return" : "Arriving"} destination (optional)`}
          error={fieldErrors.arrivalStopId?.[0]}
        >
          <Select
            value={values.arrivalStopId || "none"}
            onValueChange={(value) => setValue("arrivalStopId", value === "none" ? "" : value)}
          >
            <SelectTrigger id="arrival-stop">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Outside this trip</SelectItem>
              {stops.map((stop) => (
                <SelectItem value={stop.id} key={stop.id}>
                  {stop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="departure-location"
          label={isRental ? "Pickup location" : "Leaving from"}
          error={fieldErrors.departureLocation?.[0]}
        >
          <Input
            id="departure-location"
            placeholder={isRental ? "Bari Airport rental center" : "ORD · Chicago"}
            value={values.departureLocation}
            onChange={(event) => setValue("departureLocation", event.target.value)}
          />
        </FormField>
        <FormField
          id="arrival-location"
          label={isRental ? "Return location" : "Arriving at"}
          error={fieldErrors.arrivalLocation?.[0]}
        >
          <Input
            id="arrival-location"
            placeholder={isRental ? "Olbia Airport rental return" : "LIS · Lisbon"}
            value={values.arrivalLocation}
            onChange={(event) => setValue("arrivalLocation", event.target.value)}
          />
        </FormField>
      </div>

      <DateTimeFields
        label={isRental ? "Pickup" : "Departure"}
        prefix="departure"
        date={values.departureDate}
        time={values.departureTime}
        error={fieldErrors.departureAt?.[0]}
        onDateChange={(value) => setValue("departureDate", value)}
        onTimeChange={(value) => setValue("departureTime", value)}
      />
      <DateTimeFields
        label={isRental ? "Return" : "Arrival"}
        prefix="arrival"
        date={values.arrivalDate}
        time={values.arrivalTime}
        error={fieldErrors.arrivalAt?.[0]}
        optional={!isRental}
        onDateChange={(value) => setValue("arrivalDate", value)}
        onTimeChange={(value) => setValue("arrivalTime", value)}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="travel-carrier" label={isRental ? "Rental company" : "Carrier"}>
          <Input
            id="travel-carrier"
            placeholder={isRental ? "Hertz" : "United Airlines"}
            value={values.carrier}
            onChange={(event) => setValue("carrier", event.target.value)}
          />
        </FormField>
        {isRental ? (
          <FormField
            id="travel-vehicle"
            label="Vehicle or class"
            error={fieldErrors.vehicleDescription?.[0]}
          >
            <Input
              id="travel-vehicle"
              placeholder="Compact SUV · automatic"
              value={values.vehicleDescription}
              onChange={(event) => setValue("vehicleDescription", event.target.value)}
            />
          </FormField>
        ) : (
          <FormField id="travel-reference" label="Flight, train, or route number">
            <Input
              id="travel-reference"
              placeholder="UA 942"
              value={values.referenceNumber}
              onChange={(event) => setValue("referenceNumber", event.target.value)}
            />
          </FormField>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="travel-confirmation"
          label="Confirmation number"
          description="Only visible to members of this trip."
          error={fieldErrors.confirmationNumber?.[0]}
        >
          <Input
            id="travel-confirmation"
            value={values.confirmationNumber}
            onChange={(event) => setValue("confirmationNumber", event.target.value)}
          />
        </FormField>
        <FormField id="travel-booking-url" label="Booking link" error={fieldErrors.bookingUrl?.[0]}>
          <Input
            id="travel-booking-url"
            type="url"
            placeholder="https://…"
            value={values.bookingUrl}
            onChange={(event) => setValue("bookingUrl", event.target.value)}
          />
        </FormField>
      </div>

      <FormField id="travel-notes" label="Notes" error={fieldErrors.notes?.[0]}>
        <Textarea
          id="travel-notes"
          placeholder={
            isRental
              ? "Pickup instructions, counter details, or fuel policy"
              : "Terminal details, baggage notes, or transfer instructions"
          }
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
          {isPending
            ? "Saving…"
            : (submitLabel ?? (initialTravel ? "Save changes" : "Add transportation"))}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DateTimeFields({
  date,
  error,
  label,
  onDateChange,
  onTimeChange,
  optional = false,
  prefix,
  time,
}: {
  date: string;
  error?: string;
  label: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  optional?: boolean;
  prefix: string;
  time: string;
}) {
  return (
    <FormField
      id={`${prefix}-date`}
      label={`${label}${optional ? " (optional)" : ""}`}
      error={error}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
        <DatePicker
          id={`${prefix}-date`}
          value={date}
          invalid={Boolean(error)}
          onChange={onDateChange}
        />
        <Input
          id={`${prefix}-time`}
          type="time"
          aria-label={`${label} time`}
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
        />
      </div>
    </FormField>
  );
}

export { TravelForm };
