import { useUser } from "@clerk/react";
import type { TripMember } from "@voyage/contracts";
import { Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useTripPeople } from "@/lib/invitations";
import { cn } from "@/lib/utils";

function initials(member: TripMember) {
  return (member.displayName || member.role)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function partyLabel(
  members: TripMember[],
  pendingCount: number,
  canManage: boolean,
  currentUserId?: string,
) {
  if (canManage && members.length === 1 && pendingCount === 0) return "Just you · Invite";
  if (canManage && pendingCount > 0) {
    return `${members.length} joined · ${pendingCount} invited`;
  }

  const companions = members.filter((member) => member.userId !== currentUserId);
  if (companions.length === 1) {
    return `Traveling with ${companions[0].displayName || companions[0].role}`;
  }
  return `${members.length} ${members.length === 1 ? "traveler" : "travelers"}`;
}

function TripPartyPresence({ tripId, className }: { tripId: string; className?: string }) {
  const people = useTripPeople(tripId);
  const { user } = useUser();

  if (people.isPending) {
    return <Skeleton className={cn("h-10 w-36 rounded-full", className)} />;
  }

  if (people.isError) {
    return (
      <Link
        className={cn(
          "inline-flex min-h-10 items-center gap-2 rounded-full border border-foreground/10 bg-background/75 px-3 text-sm font-medium shadow-none backdrop-blur-md transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        to={`/trips/${tripId}/people`}
      >
        <Users className="size-4" aria-hidden="true" /> People
      </Link>
    );
  }

  const pendingCount = people.data.invitations.filter(
    (invitation) => invitation.status === "pending",
  ).length;
  const visibleMembers = people.data.members.slice(0, 3);
  const label = partyLabel(people.data.members, pendingCount, people.data.canManage, user?.id);

  return (
    <Link
      aria-label={`${label}. Open trip people.`}
      className={cn(
        "inline-flex min-h-10 items-center gap-2.5 rounded-full border border-foreground/10 bg-background/75 px-2.5 pr-3 text-sm font-medium shadow-none backdrop-blur-md transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      to={`/trips/${tripId}/people`}
    >
      <span className="flex -space-x-2" aria-hidden="true">
        {visibleMembers.map((member) =>
          member.imageUrl ? (
            <img
              alt=""
              className="size-7 rounded-full border-2 border-background object-cover"
              key={member.userId}
              src={member.imageUrl}
            />
          ) : (
            <span
              className="grid size-7 place-items-center rounded-full border-2 border-background bg-muted text-[0.625rem] font-semibold"
              key={member.userId}
            >
              {initials(member)}
            </span>
          ),
        )}
      </span>
      <span className="max-w-48 truncate">{label}</span>
    </Link>
  );
}

export { TripPartyPresence };
