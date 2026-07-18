import type { CreateStayInput, CreateTravelInput, Stay, Travel } from "@voyage/contracts";
import type { ReactElement } from "react";
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
import { useCreateStay, useCreateTravel, useUpdateStay, useUpdateTravel } from "@/lib/planning";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  tripId: string;
};

function TravelDialog({
  open,
  onOpenChange,
  travel,
  trigger,
  tripId,
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
          <DialogTitle>{travel ? "Edit travel" : "Add travel"}</DialogTitle>
          <DialogDescription>
            Keep the route and booking details where every traveler can find them.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TravelForm
            initialTravel={travel}
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function StayDialog({ open, onOpenChange, stay, trigger, tripId }: DialogProps & { stay?: Stay }) {
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
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { StayDialog, TravelDialog };
