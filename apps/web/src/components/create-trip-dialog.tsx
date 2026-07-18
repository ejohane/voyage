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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a trip</DialogTitle>
          <DialogDescription>
            Start with the basics. Everything else can take shape inside the trip.
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
