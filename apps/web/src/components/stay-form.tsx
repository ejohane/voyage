import {
  type CreateStayInput,
  createStayInputSchema,
  type Stay,
  type StayAmenity,
  type StayPropertyRef,
  type TripStop,
} from "@voyage/contracts";
import { LoaderCircle, Unlink } from "lucide-react";
import { type FormEvent, useState } from "react";
import { DateRangePicker } from "@/components/date-range-picker";
import { FormField } from "@/components/form-field";
import { StayPropertyAutocomplete } from "@/components/stay-property-autocomplete";
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
  presentation?: "dialog" | "inspector";
  stops: TripStop[];
  submitLabel?: string;
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
  propertyRef: StayPropertyRef | null;
  checkInWindow: string;
  checkOutWindow: string;
  roomType: string;
  guestSummary: string;
  mealPlan: string;
  cancellationSummary: string;
  cancellationDeadline: string;
  totalPriceText: string;
  amenities: StayAmenity[];
};

const amenityLabels: Record<StayAmenity, string> = {
  wifi: "Wi-Fi",
  breakfast: "Breakfast",
  parking: "Parking",
  pool: "Pool",
  spa: "Spa",
  gym: "Gym",
  pets: "Pets",
  restaurant: "Restaurant",
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
    propertyRef: initialStay?.propertyRef ?? null,
    checkInWindow: initialStay?.bookingDetails?.checkInWindow ?? "",
    checkOutWindow: initialStay?.bookingDetails?.checkOutWindow ?? "",
    roomType: initialStay?.bookingDetails?.roomType ?? "",
    guestSummary: initialStay?.bookingDetails?.guestSummary ?? "",
    mealPlan: initialStay?.bookingDetails?.mealPlan ?? "",
    cancellationSummary: initialStay?.bookingDetails?.cancellationSummary ?? "",
    cancellationDeadline: initialStay?.bookingDetails?.cancellationDeadline ?? "",
    totalPriceText: initialStay?.bookingDetails?.totalPriceText ?? "",
    amenities: initialStay?.bookingDetails?.amenities ?? [],
  };
}

function StayForm({
  initialStay,
  onCancel,
  onSubmit,
  presentation = "dialog",
  stops,
  submitLabel,
}: StayFormProps) {
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

    const details = {
      checkInWindow: values.checkInWindow || null,
      checkOutWindow: values.checkOutWindow || null,
      roomType: values.roomType || null,
      guestSummary: values.guestSummary || null,
      mealPlan: values.mealPlan || null,
      cancellationSummary: values.cancellationSummary || null,
      cancellationDeadline: values.cancellationDeadline || null,
      totalPriceText: values.totalPriceText || null,
      amenities: values.amenities,
    };
    const hasDetails = Object.entries(details).some(([key, value]) =>
      key === "amenities" ? (value as StayAmenity[]).length > 0 : Boolean(value),
    );
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
      propertyRef: values.propertyRef,
      bookingDetails: hasDetails ? details : null,
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
  const isInspector = presentation === "inspector";

  return (
    <form
      className={isInspector ? "flex min-h-full flex-col gap-4" : "grid gap-5"}
      onSubmit={handleSubmit}
    >
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

      <FormField
        id="stay-property-search"
        label="Property match"
        description={
          values.propertyRef
            ? "Linked details load from Google without replacing your booking record."
            : "Optional. Search for photos, contact details, rating, and an exact map location."
        }
      >
        <div className="flex gap-2">
          <StayPropertyAutocomplete
            id="stay-property-search"
            propertyName={values.propertyName}
            propertyRef={values.propertyRef}
            onChange={(propertyName, address, propertyRef) => {
              setValue("propertyName", propertyName);
              setValue("address", address);
              setValue("propertyRef", propertyRef);
            }}
          />
          {values.propertyRef ? (
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Remove property match"
              onClick={() => setValue("propertyRef", null)}
            >
              <Unlink className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
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

      <div className="border-t pt-4">
        <p className="text-sm font-semibold">Booking details</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Optional operational details, including facts found in a confirmation email.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="stay-check-in-window" label="Check-in window">
          <Input
            id="stay-check-in-window"
            placeholder="3:00 PM – midnight"
            value={values.checkInWindow}
            onChange={(event) => setValue("checkInWindow", event.target.value)}
          />
        </FormField>
        <FormField id="stay-check-out-window" label="Checkout window">
          <Input
            id="stay-check-out-window"
            placeholder="By 11:00 AM"
            value={values.checkOutWindow}
            onChange={(event) => setValue("checkOutWindow", event.target.value)}
          />
        </FormField>
        <FormField id="stay-room-type" label="Room">
          <Input
            id="stay-room-type"
            placeholder="Deluxe double room"
            value={values.roomType}
            onChange={(event) => setValue("roomType", event.target.value)}
          />
        </FormField>
        <FormField id="stay-guests" label="Guests">
          <Input
            id="stay-guests"
            placeholder="2 adults, 1 child"
            value={values.guestSummary}
            onChange={(event) => setValue("guestSummary", event.target.value)}
          />
        </FormField>
        <FormField id="stay-meal-plan" label="Meal plan">
          <Input
            id="stay-meal-plan"
            placeholder="Breakfast included"
            value={values.mealPlan}
            onChange={(event) => setValue("mealPlan", event.target.value)}
          />
        </FormField>
        <FormField id="stay-total-price" label="Total price">
          <Input
            id="stay-total-price"
            placeholder="€1,240.00"
            value={values.totalPriceText}
            onChange={(event) => setValue("totalPriceText", event.target.value)}
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <FormField id="stay-cancellation" label="Cancellation">
          <Input
            id="stay-cancellation"
            placeholder="Free cancellation until Aug 24"
            value={values.cancellationSummary}
            onChange={(event) => setValue("cancellationSummary", event.target.value)}
          />
        </FormField>
        <FormField id="stay-cancellation-deadline" label="Deadline">
          <Input
            id="stay-cancellation-deadline"
            type="date"
            value={values.cancellationDeadline}
            onChange={(event) => setValue("cancellationDeadline", event.target.value)}
          />
        </FormField>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-medium">Amenities explicitly included</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(amenityLabels) as StayAmenity[]).map((amenity) => (
            <label
              key={amenity}
              className="flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs"
            >
              <input
                type="checkbox"
                checked={values.amenities.includes(amenity)}
                onChange={(event) =>
                  setValue(
                    "amenities",
                    event.target.checked
                      ? [...values.amenities, amenity]
                      : values.amenities.filter((value) => value !== amenity),
                  )
                }
              />
              {amenityLabels[amenity]}
            </label>
          ))}
        </div>
      </fieldset>

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
      <DialogFooter
        className={
          isInspector
            ? "sticky bottom-0 -mx-5 -mb-5 mt-auto bg-background px-5 pb-5 pt-4"
            : undefined
        }
      >
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {isInspector ? "Close" : "Cancel"}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {isPending ? "Saving…" : (submitLabel ?? (initialStay ? "Save changes" : "Add stay"))}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { StayForm };
