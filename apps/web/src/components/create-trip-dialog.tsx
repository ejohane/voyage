import type { CreateTripInput } from "@voyage/contracts";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TripForm } from "@/components/trip-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useCreateTrip } from "@/lib/trips";

type CreateTripDialogProps = {
  buttonLabel?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function CreateTripDialog({ buttonLabel = "New trip", open, onOpenChange }: CreateTripDialogProps) {
  const createTrip = useCreateTrip();
  const navigate = useNavigate();

  async function handleSubmit(input: CreateTripInput) {
    const trip = await createTrip.mutateAsync(input);
    onOpenChange(false);
    navigate(`/trips/${trip.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" aria-hidden="true" />
          {buttonLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a trip</DialogTitle>
          <DialogDescription>
            Add your destinations in order. You can keep dates flexible and refine them later.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TripForm
            pendingLabel="Creating…"
            submitLabel="Create trip"
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { CreateTripDialog };
