import { UserButton } from "@clerk/react";
import { Plus } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CreateTripDialog } from "@/components/create-trip-dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useTrips } from "@/lib/trips";

const GmailImportExperience = lazy(async () => {
  const module = await import("@/components/gmail-import-experience");
  return { default: module.GmailImportExperience };
});

function AppTopbar() {
  const { tripId } = useParams();
  const trips = useTrips();
  const trip = trips.data?.find((item) => item.id === tripId);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm" aria-label="Breadcrumb">
        <Link className="shrink-0 text-muted-foreground hover:text-foreground" to="/trips">
          Trips
        </Link>
        {trip ? (
          <>
            <span className="text-muted-foreground/50" aria-hidden="true">
              /
            </span>
            <span className="truncate font-medium">{trip.name}</span>
          </>
        ) : null}
      </nav>
      {trip && trip.accessLevel !== "viewer" ? (
        <Suspense fallback={<span className="size-8 shrink-0" aria-hidden="true" />}>
          <GmailImportExperience trip={trip} />
        </Suspense>
      ) : null}
      <CreateTripDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        trigger={
          <Button size="sm">
            <Plus className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">New trip</span>
          </Button>
        }
      />
      <span className="md:hidden">
        <UserButton />
      </span>
    </header>
  );
}

export { AppTopbar };
