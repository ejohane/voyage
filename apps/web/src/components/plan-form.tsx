import {
  type CreatePlanInput,
  createPlanInputSchema,
  type PlanCategory,
  type PlanStatus,
  type TripPlan,
  type TripStop,
} from "@voyage/contracts";
import { ChevronDown, LoaderCircle } from "lucide-react";
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
  initialScheduledDate?: string;
  initialStopId?: string;
  onCancel: () => void;
  onSubmit: (input: CreatePlanInput) => Promise<void>;
  presentation?: "dialog" | "inline" | "inspector";
  submitLabel?: string;
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
  initialScheduledDate?: string,
): PlanFormValues {
  return {
    tripStopId: initialPlan?.tripStopId ?? initialStopId ?? (stops.length === 1 ? stops[0].id : ""),
    title: initialPlan?.title ?? "",
    category: initialPlan?.category ?? "activity",
    status: initialPlan?.status ?? (initialScheduledDate ? "planned" : "idea"),
    scheduledDate: initialPlan?.scheduledDate ?? initialScheduledDate ?? "",
    startTime: initialPlan?.startTime ?? "",
    endTime: initialPlan?.endTime ?? "",
    location: initialPlan?.location ?? "",
    confirmationNumber: initialPlan?.confirmationNumber ?? "",
    bookingUrl: initialPlan?.bookingUrl ?? "",
    notes: initialPlan?.notes ?? "",
  };
}

function PlanForm({
  initialPlan,
  initialScheduledDate,
  initialStopId,
  onCancel,
  onSubmit,
  presentation = "dialog",
  submitLabel,
  stops,
}: PlanFormProps) {
  const [values, setValues] = useState(() =>
    initialValues(stops, initialPlan, initialStopId, initialScheduledDate),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
    setFieldErrors((current) => ({
      ...current,
      scheduledDate: [],
      status: [],
    }));
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

  if (presentation === "inline") {
    return (
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8.5rem_10rem]">
          <FormField id="inline-plan-title" label="Plan" error={fieldErrors.title?.[0]}>
            <Input
              id="inline-plan-title"
              placeholder="What do you want to do?"
              value={values.title}
              onChange={(event) => setValue("title", event.target.value)}
              autoFocus
            />
          </FormField>
          <FormField id="inline-plan-start-time" label="Time" error={fieldErrors.startTime?.[0]}>
            <Input
              id="inline-plan-start-time"
              type="time"
              value={values.startTime}
              onChange={(event) => setValue("startTime", event.target.value)}
            />
          </FormField>
          <FormField id="inline-plan-category" label="Category">
            <Select
              value={values.category}
              onValueChange={(value) => setValue("category", value as PlanCategory)}
            >
              <SelectTrigger id="inline-plan-category">
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

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="w-fit px-1 text-muted-foreground"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((current) => !current)}
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${detailsOpen ? "rotate-180" : ""}`}
          />
          {detailsOpen ? "Fewer details" : "More details"}
        </Button>

        {detailsOpen ? (
          <div className="grid gap-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8.5rem_10rem]">
              <FormField
                id="inline-plan-location"
                label="Location"
                error={fieldErrors.location?.[0]}
              >
                <Input
                  id="inline-plan-location"
                  placeholder="Restaurant, museum, or address"
                  value={values.location}
                  onChange={(event) => setValue("location", event.target.value)}
                />
              </FormField>
              <FormField
                id="inline-plan-end-time"
                label="End time"
                error={fieldErrors.endTime?.[0]}
              >
                <Input
                  id="inline-plan-end-time"
                  type="time"
                  value={values.endTime}
                  onChange={(event) => setValue("endTime", event.target.value)}
                />
              </FormField>
              <FormField id="inline-plan-status" label="Status" error={fieldErrors.status?.[0]}>
                <Select
                  value={values.status}
                  onValueChange={(value) => setValue("status", value as PlanStatus)}
                >
                  <SelectTrigger id="inline-plan-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="inline-plan-confirmation"
                label="Confirmation number"
                error={fieldErrors.confirmationNumber?.[0]}
              >
                <Input
                  id="inline-plan-confirmation"
                  value={values.confirmationNumber}
                  onChange={(event) => setValue("confirmationNumber", event.target.value)}
                />
              </FormField>
              <FormField
                id="inline-plan-booking-url"
                label="Booking link"
                error={fieldErrors.bookingUrl?.[0]}
              >
                <Input
                  id="inline-plan-booking-url"
                  type="url"
                  placeholder="https://…"
                  value={values.bookingUrl}
                  onChange={(event) => setValue("bookingUrl", event.target.value)}
                />
              </FormField>
            </div>

            <FormField id="inline-plan-notes" label="Notes" error={fieldErrors.notes?.[0]}>
              <Textarea
                id="inline-plan-notes"
                placeholder="Reservation details, what to order, or anything worth remembering"
                value={values.notes}
                onChange={(event) => setValue("notes", event.target.value)}
              />
            </FormField>
          </div>
        ) : null}

        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {isPending ? "Saving…" : "Add to itinerary"}
          </Button>
        </div>
      </form>
    );
  }

  const isInspector = presentation === "inspector";

  return (
    <form
      className={isInspector ? "flex min-h-full flex-col gap-4" : "grid gap-5"}
      onSubmit={handleSubmit}
    >
      <FormField id="plan-title" label="Title" error={fieldErrors.title?.[0]}>
        <Input
          id="plan-title"
          placeholder="Visit the Louvre"
          value={values.title}
          onChange={(event) => setValue("title", event.target.value)}
          autoFocus
        />
      </FormField>

      <div className={isInspector ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
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

      <div className={isInspector ? "grid gap-4" : "grid gap-4 sm:grid-cols-[1fr_11rem]"}>
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

      <div className={isInspector ? "grid gap-4" : "grid gap-4 sm:grid-cols-2"}>
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
          {isPending ? "Saving…" : (submitLabel ?? (initialPlan ? "Save changes" : "Add plan"))}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { PlanForm };
