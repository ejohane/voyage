import { UserButton, useAuth } from "@clerk/react";
import type { InvitationSummary } from "@voyage/contracts";
import {
  ArrowRight,
  CalendarDays,
  Check,
  LoaderCircle,
  Mail,
  MapPin,
  ShieldCheck,
  UserRoundCheck,
  X,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Brand } from "@/components/brand";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiRequestError } from "@/lib/api";
import { useAcceptInvitation, useDeclineInvitation, useInvitation } from "@/lib/invitations";
import { cn } from "@/lib/utils";

function InvitationPage() {
  const { token = "" } = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const invitation = useInvitation(token);
  const accept = useAcceptInvitation(token);
  const decline = useDeclineInvitation(token);
  const returnTo = `/invitations/${encodeURIComponent(token)}`;
  const signInUrl = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
  const signUpUrl = `/sign-up?redirect_url=${encodeURIComponent(returnTo)}`;
  const actionError = accept.error ?? decline.error;

  async function acceptInvitation() {
    try {
      await accept.mutateAsync();
    } catch {
      // The mutation state renders the trusted API error inline.
    }
  }

  async function declineInvitation() {
    try {
      await decline.mutateAsync();
    } catch {
      // The mutation state renders the trusted API error inline.
    }
  }

  return (
    <div className="min-h-svh bg-[#f5f5f1] text-foreground">
      <header className="border-b bg-background/90">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Brand />
          {isLoaded && isSignedIn ? <UserButton /> : null}
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl justify-center px-5 py-12 sm:px-8 sm:py-20">
        {invitation.isPending || !isLoaded ? <InvitationSkeleton /> : null}
        {invitation.isError ? <UnavailableInvitation /> : null}
        {invitation.data ? (
          <Card className="w-full max-w-xl overflow-hidden py-0 shadow-lg">
            <div className="border-b bg-[radial-gradient(circle_at_top_right,#dfe7dc,transparent_58%)] px-7 py-9 sm:px-10">
              <span className="grid size-12 place-items-center rounded-full border bg-background shadow-sm">
                <Mail className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-6 text-sm font-medium text-muted-foreground">
                {invitation.data.invitedByName} invited you
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                {invitation.data.tripName}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Join as a Traveler to see the complete, current trip without managing the plan.
              </p>
            </div>
            <CardContent className="px-7 py-7 sm:px-10 sm:py-9">
              {accept.isSuccess ? (
                <AcceptedHandoff invitation={invitation.data} tripId={accept.data.tripId} />
              ) : (
                <>
                  <div className="space-y-3 text-sm">
                    <p className="flex items-start gap-3">
                      <MapPin
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>{invitation.data.destinations.join(" → ")}</span>
                    </p>
                    <p className="flex items-start gap-3">
                      <CalendarDays
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span>{formatInvitationDates(invitation.data)}</span>
                    </p>
                    <p className="flex items-center gap-3">
                      <UserRoundCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span>
                        <strong>Traveler</strong> · see the trip without managing it
                      </span>
                    </p>
                    <p className="flex items-center gap-3">
                      <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
                      <span>For the verified account matching {invitation.data.invitedEmail}</span>
                    </p>
                  </div>

                  {invitation.data.status === "pending" ? (
                    <div className="mt-7">
                      {!isSignedIn ? (
                        <>
                          <Link
                            className={cn(buttonVariants({ size: "lg" }), "w-full")}
                            to={signInUrl}
                          >
                            Sign in to continue <ArrowRight className="size-4" />
                          </Link>
                          <p className="mt-3 text-center text-sm text-muted-foreground">
                            New to Voyage?{" "}
                            <Link
                              className="font-medium text-foreground underline underline-offset-4"
                              to={signUpUrl}
                            >
                              Create an account
                            </Link>
                          </p>
                        </>
                      ) : (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            className="flex-1"
                            size="lg"
                            disabled={accept.isPending || decline.isPending}
                            onClick={() => void acceptInvitation()}
                          >
                            {accept.isPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}{" "}
                            Join trip
                          </Button>
                          <Button
                            size="lg"
                            variant="outline"
                            disabled={accept.isPending || decline.isPending}
                            onClick={() => void declineInvitation()}
                          >
                            {decline.isPending ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <X className="size-4" />
                            )}{" "}
                            Decline
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <InvitationState status={invitation.data.status} />
                  )}

                  {decline.isSuccess ? (
                    <p
                      className="mt-6 rounded-md border bg-muted/40 px-3 py-3 text-sm"
                      role="status"
                    >
                      Invitation declined. Nothing was added to your trips.
                    </p>
                  ) : null}
                  {actionError ? <ActionError error={actionError} /> : null}
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}

function formatInvitationDates(invitation: Pick<InvitationSummary, "startDate" | "endDate">) {
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const format = (value: string) => formatter.format(new Date(`${value}T00:00:00Z`));

  if (!invitation.startDate) return "Dates are still flexible";
  if (!invitation.endDate) return `${format(invitation.startDate)} – flexible`;
  if (invitation.startDate === invitation.endDate) return format(invitation.startDate);
  return `${format(invitation.startDate)} – ${format(invitation.endDate)}`;
}

function AcceptedHandoff({
  invitation,
  tripId,
}: {
  invitation: InvitationSummary;
  tripId: string;
}) {
  return (
    <div role="status">
      <span className="grid size-11 place-items-center rounded-full bg-emerald-100 text-emerald-800">
        <Check className="size-5" aria-hidden="true" />
      </span>
      <p className="mt-5 text-sm font-medium text-emerald-800">You’re in</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.025em]">
        Welcome to {invitation.tripName}
      </h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        You’re traveling with {invitation.invitedByName}. Voyage will keep the shared itinerary,
        transportation, and stays together here.
      </p>
      <div className="mt-5 rounded-lg border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
        <p>{invitation.destinations.join(" → ")}</p>
        <p className="mt-1">{formatInvitationDates(invitation)}</p>
      </div>
      <Link
        className={cn(buttonVariants({ size: "lg" }), "mt-6 w-full")}
        state={{ joinedTrip: true, invitedByName: invitation.invitedByName }}
        to={`/trips/${tripId}`}
      >
        Open shared trip <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function ActionError({ error }: { error: Error }) {
  const wrongAccount = error instanceof ApiRequestError && error.code === "email_mismatch";
  return (
    <div
      className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive"
      role="alert"
    >
      <p>{error.message}</p>
      {wrongAccount ? (
        <p className="mt-1 text-xs leading-5">
          Use the account menu above to sign out, then sign in with the invited address.
        </p>
      ) : null}
    </div>
  );
}

function InvitationState({ status }: { status: "accepted" | "declined" | "revoked" | "expired" }) {
  const copy = {
    accepted: [
      "Invitation accepted",
      "This invitation has already been used. Open your trips to continue.",
    ],
    declined: [
      "Invitation declined",
      "This invitation was declined and can no longer be accepted.",
    ],
    revoked: [
      "Invitation unavailable",
      "The organizer revoked or replaced this private invitation.",
    ],
    expired: ["Invitation expired", "Ask the organizer to send a new invitation."],
  }[status];
  return (
    <div className="mt-7 rounded-lg border bg-muted/30 px-4 py-4">
      <p className="text-sm font-medium">{copy[0]}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{copy[1]}</p>
      {status === "accepted" ? (
        <Link className={cn(buttonVariants({ variant: "outline" }), "mt-4")} to="/trips">
          Open your trips
        </Link>
      ) : null}
    </div>
  );
}

function UnavailableInvitation() {
  return (
    <Card className="w-full max-w-xl border-dashed shadow-none">
      <CardContent className="flex min-h-64 flex-col items-center justify-center text-center">
        <h1 className="text-lg font-semibold">This invitation isn’t available.</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          The link may be incomplete, or the trip may have been removed. Ask the organizer for a new
          invitation.
        </p>
      </CardContent>
    </Card>
  );
}

function InvitationSkeleton() {
  return (
    <div className="w-full max-w-xl">
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="mt-4 h-16 rounded-xl" />
    </div>
  );
}

export default InvitationPage;
