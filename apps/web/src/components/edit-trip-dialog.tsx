import type { CreateTripInput, Trip } from "@voyage/contracts";
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
import { useUpdateTrip } from "@/lib/trips";

type EditTripDialogProps = {
  trip: Trip;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function EditTripDialog({ trip, open, onOpenChange }: EditTripDialogProps) {
  const updateTrip = useUpdateTrip(trip.id);

  async function handleSubmit(input: CreateTripInput) {
    await updateTrip.mutateAsync(input);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">Edit trip</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit trip</DialogTitle>
          <DialogDescription>Keep the shared overview current for everyone.</DialogDescription>
        </DialogHeader>
        {open ? (
          <TripForm
            initialTrip={trip}
            pendingLabel="Saving…"
            submitLabel="Save changes"
            onCancel={() => onOpenChange(false)}
            onSubmit={handleSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export { EditTripDialog };
