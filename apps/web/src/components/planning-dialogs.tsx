import type {
  CreatePlanInput,
  CreateStayInput,
  CreateTravelInput,
  Stay,
  Travel,
  TripPlan,
  TripStop,
} from "@voyage/contracts";
import type { ReactElement } from "react";
import { PlanForm } from "@/components/plan-form";
import { StayForm } from "@/components/stay-form";
import { TravelForm } from "@/components/travel-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useCreatePlan,
  useCreateStay,
  useCreateTravel,
  useUpdatePlan,
  useUpdateStay,
  useUpdateTravel,
} from "@/lib/planning";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  tripId: string;
  stops: TripStop[];
};

function TravelDialog({
  open,
  onOpenChange,
  travel,
  trigger,
  tripId,
  stops,
}: DialogProps & { travel?: Travel }) {
  const createTravel = useCreateTravel(tripId);
  const updateTravel = useUpdateTravel(tripId, travel?.id ?? "");

  async function handleSubmit(input: CreateTravelInput) {
    if (travel) await updateTravel.mutateAsync(input);
    else await createTravel.mutateAsync(input);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{travel ? "Edit transportation" : "Add transportation"}</DialogTitle>
          <DialogDescription>
            Add a journey or vehicle rental and keep its booking details with the trip.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TravelForm
            initialTravel={travel}
            stops={stops}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StayDialog({
  open,
  onOpenChange,
  stay,
  stops,
  trigger,
  tripId,
}: DialogProps & { stay?: Stay }) {
  const createStay = useCreateStay(tripId);
  const updateStay = useUpdateStay(tripId, stay?.id ?? "");

  async function handleSubmit(input: CreateStayInput) {
    if (stay) await updateStay.mutateAsync(input);
    else await createStay.mutateAsync(input);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{stay ? "Edit stay" : "Add a stay"}</DialogTitle>
          <DialogDescription>
            Save the accommodation details and booking information for the group.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <StayForm
            initialStay={stay}
            stops={stops}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({
  initialStopId,
  onOpenChange,
  open,
  plan,
  stops,
  trigger,
  tripId,
}: DialogProps & { initialStopId?: string; plan?: TripPlan }) {
  const createPlan = useCreatePlan(tripId);
  const updatePlan = useUpdatePlan(tripId, plan?.id ?? "");

  async function handleSubmit(input: CreatePlanInput) {
    if (plan) await updatePlan.mutateAsync(input);
    else await createPlan.mutateAsync(input);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? "Edit plan" : "Add a plan"}</DialogTitle>
          <DialogDescription>
            Save an idea now, or add a date to place it in the itinerary.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PlanForm
            initialPlan={plan}
            initialStopId={initialStopId}
            stops={stops}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { PlanDialog, StayDialog, TravelDialog };
