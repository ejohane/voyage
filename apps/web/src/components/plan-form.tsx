import {
  type CreatePlanInput,
  createPlanInputSchema,
  type PlanCategory,
  type PlanStatus,
  type TripPlan,
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

type PlanFormProps = {
  initialPlan?: TripPlan;
  initialStopId?: string;
  onCancel: () => void;
  onSubmit: (input: CreatePlanInput) => Promise<void>;
  stops: TripStop[];
};

type PlanFormValues = {
  tripStopId: string;
  title: string;
  category: PlanCategory;
  status: PlanStatus;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  location: string;
  confirmationNumber: string;
  bookingUrl: string;
  notes: string;
};

function initialValues(
  stops: TripStop[],
  initialPlan?: TripPlan,
  initialStopId?: string,
): PlanFormValues {
  return {
    tripStopId: initialPlan?.tripStopId ?? initialStopId ?? (stops.length === 1 ? stops[0].id : ""),
    title: initialPlan?.title ?? "",
    category: initialPlan?.category ?? "activity",
    status: initialPlan?.status ?? "idea",
    scheduledDate: initialPlan?.scheduledDate ?? "",
    startTime: initialPlan?.startTime ?? "",
    endTime: initialPlan?.endTime ?? "",
    location: initialPlan?.location ?? "",
    confirmationNumber: initialPlan?.confirmationNumber ?? "",
    bookingUrl: initialPlan?.bookingUrl ?? "",
    notes: initialPlan?.notes ?? "",
  };
}

function PlanForm({ initialPlan, initialStopId, onCancel, onSubmit, stops }: PlanFormProps) {
  const [values, setValues] = useState(() => initialValues(stops, initialPlan, initialStopId));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);

  function setValue<Field extends keyof PlanFormValues>(
    field: Field,
    value: PlanFormValues[Field],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: [] }));
  }

  function setStatus(status: PlanStatus) {
    setValues((current) =>
      status === "idea"
        ? { ...current, status, scheduledDate: "", startTime: "", endTime: "" }
        : { ...current, status },
    );
    setFieldErrors((current) => ({
      ...current,
      status: [],
      scheduledDate: [],
      startTime: [],
      endTime: [],
    }));
  }

  function setScheduledDate(scheduledDate: string) {
    setValues((current) => ({
      ...current,
      scheduledDate,
      status: scheduledDate && current.status === "idea" ? "planned" : current.status,
      startTime: scheduledDate ? current.startTime : "",
      endTime: scheduledDate ? current.endTime : "",
    }));
    setFieldErrors((current) => ({ ...current, scheduledDate: [], status: [] }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const parsed = createPlanInputSchema.safeParse({
      tripStopId: values.tripStopId,
      title: values.title,
      category: values.category,
      status: values.status,
      scheduledDate: values.scheduledDate || null,
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      location: values.location || null,
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

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <FormField id="plan-title" label="Title" error={fieldErrors.title?.[0]}>
        <Input
          id="plan-title"
          placeholder="Visit the Louvre"
          value={values.title}
          onChange={(event) => setValue("title", event.target.value)}
          autoFocus
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="plan-destination" label="Destination" error={fieldErrors.tripStopId?.[0]}>
          <Select
            value={values.tripStopId}
            onValueChange={(value) => setValue("tripStopId", value)}
          >
            <SelectTrigger id="plan-destination">
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

        <FormField id="plan-category" label="Category">
          <Select
            value={values.category}
            onValueChange={(value) => setValue("category", value as PlanCategory)}
          >
            <SelectTrigger id="plan-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="activity">Activity</SelectItem>
              <SelectItem value="food">Food</SelectItem>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="sightseeing">Sightseeing</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_11rem]">
        <FormField
          id="plan-date"
          label="Date (optional)"
          description="Leave this blank to keep the plan in Ideas."
          error={fieldErrors.scheduledDate?.[0]}
        >
          <DatePicker
            id="plan-date"
            value={values.scheduledDate}
            invalid={Boolean(fieldErrors.scheduledDate?.[0])}
            placeholder="Add to the itinerary"
            onChange={setScheduledDate}
          />
        </FormField>

        <FormField id="plan-status" label="Status" error={fieldErrors.status?.[0]}>
          <Select value={values.status} onValueChange={(value) => setStatus(value as PlanStatus)}>
            <SelectTrigger id="plan-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="idea">Idea</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="booked">Booked</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="plan-start-time"
          label="Start time (optional)"
          description={!values.scheduledDate ? "Choose a date to add a time." : undefined}
          error={fieldErrors.startTime?.[0]}
        >
          <Input
            id="plan-start-time"
            type="time"
            value={values.startTime}
            disabled={!values.scheduledDate}
            onChange={(event) => setValue("startTime", event.target.value)}
          />
        </FormField>
        <FormField id="plan-end-time" label="End time (optional)" error={fieldErrors.endTime?.[0]}>
          <Input
            id="plan-end-time"
            type="time"
            value={values.endTime}
            disabled={!values.scheduledDate}
            onChange={(event) => setValue("endTime", event.target.value)}
          />
        </FormField>
      </div>

      <FormField id="plan-location" label="Location" error={fieldErrors.location?.[0]}>
        <Input
          id="plan-location"
          placeholder="Museum, restaurant, address, or neighborhood"
          value={values.location}
          onChange={(event) => setValue("location", event.target.value)}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="plan-confirmation"
          label="Confirmation number"
          description="Only visible to members of this trip."
          error={fieldErrors.confirmationNumber?.[0]}
        >
          <Input
            id="plan-confirmation"
            value={values.confirmationNumber}
            onChange={(event) => setValue("confirmationNumber", event.target.value)}
          />
        </FormField>
        <FormField id="plan-booking-url" label="Booking link" error={fieldErrors.bookingUrl?.[0]}>
          <Input
            id="plan-booking-url"
            type="url"
            placeholder="https://…"
            value={values.bookingUrl}
            onChange={(event) => setValue("bookingUrl", event.target.value)}
          />
        </FormField>
      </div>

      <FormField id="plan-notes" label="Notes" error={fieldErrors.notes?.[0]}>
        <Textarea
          id="plan-notes"
          placeholder="Reservation details, what to order, or anything the group should know"
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
          {isPending ? "Saving…" : initialPlan ? "Save changes" : "Add plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { PlanForm };
