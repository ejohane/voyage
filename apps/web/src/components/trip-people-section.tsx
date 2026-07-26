import type { Trip, TripInvitation, TripMember } from "@voyage/contracts";
import { Check, Clipboard, LoaderCircle, Mail, RotateCw, UserMinus, Users, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCopyInvitationLink,
  useCreateInvitation,
  useRemoveTripMember,
  useResendInvitation,
  useRevokeInvitation,
  useTripPeople,
} from "@/lib/invitations";

function initials(member: TripMember) {
  const source = member.displayName || member.email || member.role;
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function readableDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value),
  );
}

function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

function TripPeopleSection({ trip }: { trip: Trip }) {
  const people = useTripPeople(trip.id);
  const createInvitation = useCreateInvitation(trip.id);
  const resendInvitation = useResendInvitation(trip.id);
  const copyInvitation = useCopyInvitationLink(trip.id);
  const revokeInvitation = useRevokeInvitation(trip.id);
  const removeMember = useRemoveTripMember(trip.id);
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    setActionError(null);
    setPreviewUrl(null);
    try {
      const response = await createInvitation.mutateAsync({ email });
      setEmail("");
      setPreviewUrl(response.previewUrl ?? null);
      setNotice(
        response.previewUrl
          ? `Invitation created for ${response.invitation.email}. Local email preview is ready.`
          : `Invitation sent to ${response.invitation.email}.`,
      );
    } catch (error) {
      setActionError(messageFor(error));
    }
  }

  async function runAction(action: () => Promise<unknown>, success: string) {
    setActionError(null);
    setNotice(null);
    setPreviewUrl(null);
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setActionError(messageFor(error));
    }
  }

  async function resend(invitation: TripInvitation) {
    setActionError(null);
    setNotice(null);
    setPreviewUrl(null);
    try {
      const response = await resendInvitation.mutateAsync(invitation.id);
      setPreviewUrl(response.previewUrl ?? null);
      setNotice(
        response.previewUrl
          ? `Invitation refreshed for ${invitation.email}. Local email preview is ready.`
          : `Invitation resent to ${invitation.email}.`,
      );
    } catch (error) {
      setActionError(messageFor(error));
    }
  }

  if (people.isPending) {
    return <PeopleSkeleton />;
  }

  if (people.isError) {
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
          <p className="text-sm font-medium">We couldn’t load the people on this trip.</p>
          <Button className="mt-4" variant="outline" onClick={() => void people.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const openInvitations = people.data.invitations.filter((invitation) =>
    ["pending", "expired"].includes(invitation.status),
  );
  const recentlyJoined = people.data.canManage
    ? people.data.members
        .filter(
          (member) =>
            member.accessLevel !== "owner" &&
            Date.now() - Date.parse(member.joinedAt) < 7 * 24 * 60 * 60 * 1_000,
        )
        .sort((left, right) => right.joinedAt.localeCompare(left.joinedAt))[0]
    : null;

  return (
    <section aria-labelledby="people-heading" className="mx-auto max-w-4xl">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <h2 id="people-heading" className="text-xl font-semibold tracking-tight">
            People
          </h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Everyone here shares the same current trip. Travelers can see the complete plan without
            managing it.
          </p>
        </div>
      </div>

      {recentlyJoined ? (
        <div
          className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
        >
          <Check className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
          <span>
            {recentlyJoined.displayName || recentlyJoined.email || "A traveler"} joined the trip.
          </span>
        </div>
      ) : null}

      {people.data.canManage ? (
        <Card className="mt-7 shadow-none">
          <CardHeader>
            <CardTitle>Invite a traveler</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">
              We’ll email a private, seven-day invitation. They must sign in with this verified
              address, and they’ll join as a Traveler who can see the trip without managing it.
            </p>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
              <div className="flex-1">
                <Label htmlFor="invite-email">Email address</Label>
                <Input
                  id="invite-email"
                  className="mt-2"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="traveler@example.com"
                  required
                  aria-describedby="invite-role"
                />
              </div>
              <div className="sm:w-32">
                <Label>Role</Label>
                <div
                  id="invite-role"
                  className="mt-2 flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm"
                >
                  Traveler
                </div>
              </div>
              <Button type="submit" disabled={createInvitation.isPending}>
                {createInvitation.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Send invite
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {notice ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />{" "}
          <span className="flex-1">{notice}</span>
          {previewUrl ? (
            <a className="font-medium underline underline-offset-4" href={previewUrl}>
              Open preview
            </a>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <p
          className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {actionError}
        </p>
      ) : null}

      <div className="mt-8">
        <h3 className="text-sm font-semibold">Trip members</h3>
        <div className="mt-3 divide-y rounded-xl border bg-background">
          {people.data.members.map((member) => (
            <MemberRow
              key={member.userId}
              member={member}
              canRemove={people.data.canManage && member.accessLevel !== "owner"}
              removing={removeMember.isPending && removeMember.variables === member.userId}
              onRemove={() => {
                if (
                  !window.confirm(
                    `Remove ${member.displayName || member.email || "this traveler"} from the trip?`,
                  )
                )
                  return;
                void runAction(
                  () => removeMember.mutateAsync(member.userId),
                  "Traveler removed from the trip.",
                );
              }}
            />
          ))}
        </div>
      </div>

      {people.data.canManage && openInvitations.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-sm font-semibold">Pending invitations</h3>
          <div className="mt-3 divide-y rounded-xl border bg-background">
            {openInvitations.map((invitation) => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                busy={
                  resendInvitation.isPending ||
                  copyInvitation.isPending ||
                  revokeInvitation.isPending
                }
                onResend={() => void resend(invitation)}
                onCopy={() =>
                  void runAction(
                    () => copyInvitation.mutateAsync(invitation.id),
                    `Private link for ${invitation.email} copied. It only works for that invited email.`,
                  )
                }
                onRevoke={() =>
                  void runAction(
                    () => revokeInvitation.mutateAsync(invitation.id),
                    `Invitation to ${invitation.email} revoked.`,
                  )
                }
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MemberRow({
  member,
  canRemove,
  removing,
  onRemove,
}: {
  member: TripMember;
  canRemove: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-4">
      {member.imageUrl ? (
        <img className="size-10 rounded-full object-cover" src={member.imageUrl} alt="" />
      ) : (
        <span
          className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold"
          aria-hidden="true"
        >
          {initials(member)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.displayName || member.email || member.role}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {[member.displayName ? member.email : null, `Joined ${readableDate(member.joinedAt)}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        {member.role}
      </span>
      {canRemove ? (
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Remove ${member.displayName || member.email || "traveler"}`}
          disabled={removing}
          onClick={onRemove}
        >
          {removing ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <UserMinus className="size-4" />
          )}
        </Button>
      ) : null}
    </div>
  );
}

function InvitationRow({
  invitation,
  busy,
  onResend,
  onCopy,
  onRevoke,
}: {
  invitation: TripInvitation;
  busy: boolean;
  onResend: () => void;
  onCopy: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{invitation.email}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {invitation.status === "expired"
              ? "Expired"
              : `Expires ${readableDate(invitation.expiresAt)}`}{" "}
            · Traveler
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={busy} onClick={onResend}>
            <RotateCw className="size-3.5" />{" "}
            {invitation.status === "expired" ? "Send again" : "Resend"}
          </Button>
          {invitation.status === "pending" ? (
            <Button
              aria-label={`Copy private link for ${invitation.email}`}
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={onCopy}
            >
              <Clipboard className="size-3.5" /> Copy private link
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onRevoke}>
            <X className="size-3.5" /> Revoke
          </Button>
        </div>
      </div>
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="h-16 w-64" />
      <Skeleton className="mt-7 h-44" />
      <Skeleton className="mt-8 h-48" />
    </div>
  );
}

export { TripPeopleSection };
