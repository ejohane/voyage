import type { Trip, TripInvitation, TripMember } from "@voyage/contracts";
import { Check, Clipboard, LoaderCircle, Mail, Plus, RotateCw, UserMinus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceInspector } from "@/components/workspace-inspector";
import {
  useCopyInvitationLink,
  useCreateInvitation,
  useRemoveTripMember,
  useResendInvitation,
  useRevokeInvitation,
  useTripPeople,
} from "@/lib/invitations";
import { cn } from "@/lib/utils";

type PeopleInspector =
  | { mode: "invite" }
  | { mode: "member"; userId: string }
  | { mode: "invitation"; invitationId: string };

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
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
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
  const [inspector, setInspector] = useState<PeopleInspector>();

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape" && inspector) {
        setInspector(undefined);
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (people.data?.canManage && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        setInspector({ mode: "invite" });
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [inspector, people.data?.canManage]);

  async function submitInvitation(event: FormEvent<HTMLFormElement>) {
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
      setInspector({ mode: "invitation", invitationId: response.invitation.id });
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
      return true;
    } catch (error) {
      setActionError(messageFor(error));
      return false;
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

  if (people.isPending) return <PeopleSkeleton />;

  if (people.isError) {
    return (
      <section aria-labelledby="people-heading">
        <h2 id="people-heading" className="text-xl font-semibold tracking-tight">
          People
        </h2>
        <div className="mt-5 grid min-h-56 place-items-center border-t text-center">
          <div>
            <p className="text-sm font-medium">We couldn’t load the people on this trip.</p>
            <Button className="mt-4" variant="outline" onClick={() => void people.refetch()}>
              Try again
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const openInvitations = people.data.invitations.filter((invitation) =>
    ["pending", "expired"].includes(invitation.status),
  );
  const selectedMember =
    inspector?.mode === "member"
      ? people.data.members.find((member) => member.userId === inspector.userId)
      : undefined;
  const selectedInvitation =
    inspector?.mode === "invitation"
      ? people.data.invitations.find((invitation) => invitation.id === inspector.invitationId)
      : undefined;
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
    <section aria-labelledby="people-heading">
      <div
        className={cn("min-w-0 transition-[padding] duration-200", inspector && "lg:pr-[28rem]")}
      >
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="people-heading" className="text-xl font-semibold tracking-tight">
              People
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Everyone here shares the same current trip. Travelers can see the complete plan
              without managing it.
            </p>
          </div>
          {people.data.canManage && !inspector ? (
            <Button size="lg" onClick={() => setInspector({ mode: "invite" })}>
              <Plus className="size-4.5" aria-hidden="true" />
              Invite person
            </Button>
          ) : null}
        </div>

        {recentlyJoined ? (
          <div
            className="mt-5 flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-950"
            role="status"
          >
            <Check className="size-4 shrink-0 text-emerald-700" aria-hidden="true" />
            <span>
              {recentlyJoined.displayName || recentlyJoined.email || "A traveler"} joined the trip.
            </span>
          </div>
        ) : null}

        {notice ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
            role="status"
          >
            <Check className="size-4 shrink-0" aria-hidden="true" />
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
            className="mt-4 rounded-md bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {actionError}
          </p>
        ) : null}

        <div className="mt-7">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Trip members</h3>
            <span className="text-xs tabular-nums text-muted-foreground">
              {people.data.members.length}
            </span>
          </div>
          <ul className="mt-3 grid gap-2" aria-label="Trip members">
            {people.data.members.map((member) => (
              <MemberListCard
                key={member.userId}
                member={member}
                isSelected={selectedMember?.userId === member.userId}
                onSelect={() => setInspector({ mode: "member", userId: member.userId })}
              />
            ))}
          </ul>
        </div>

        {people.data.canManage && openInvitations.length > 0 ? (
          <div className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Pending invitations</h3>
              <span className="text-xs tabular-nums text-muted-foreground">
                {openInvitations.length}
              </span>
            </div>
            <ul className="mt-3 grid gap-2" aria-label="Pending invitations">
              {openInvitations.map((invitation) => (
                <InvitationListCard
                  key={invitation.id}
                  invitation={invitation}
                  isSelected={selectedInvitation?.id === invitation.id}
                  onSelect={() => setInspector({ mode: "invitation", invitationId: invitation.id })}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {inspector?.mode === "invite" ? (
        <InvitePersonInspector
          email={email}
          error={actionError}
          isPending={createInvitation.isPending}
          onClose={() => setInspector(undefined)}
          onEmailChange={setEmail}
          onSubmit={submitInvitation}
        />
      ) : null}

      {inspector?.mode === "member" && selectedMember ? (
        <MemberInspector
          canRemove={people.data.canManage && selectedMember.accessLevel !== "owner"}
          isRemoving={removeMember.isPending && removeMember.variables === selectedMember.userId}
          member={selectedMember}
          onClose={() => setInspector(undefined)}
          onRemove={async () => {
            const removed = await runAction(
              () => removeMember.mutateAsync(selectedMember.userId),
              "Traveler removed from the trip.",
            );
            if (removed) setInspector(undefined);
          }}
        />
      ) : null}

      {inspector?.mode === "invitation" && selectedInvitation ? (
        <InvitationInspector
          busy={
            resendInvitation.isPending || copyInvitation.isPending || revokeInvitation.isPending
          }
          invitation={selectedInvitation}
          onClose={() => setInspector(undefined)}
          onCopy={() =>
            void runAction(
              () => copyInvitation.mutateAsync(selectedInvitation.id),
              `Private link for ${selectedInvitation.email} copied. It only works for that invited email.`,
            )
          }
          onResend={() => void resend(selectedInvitation)}
          onRevoke={async () => {
            const revoked = await runAction(
              () => revokeInvitation.mutateAsync(selectedInvitation.id),
              `Invitation to ${selectedInvitation.email} revoked.`,
            );
            if (revoked) setInspector(undefined);
          }}
        />
      ) : null}
    </section>
  );
}

function MemberListCard({
  isSelected,
  member,
  onSelect,
}: {
  isSelected: boolean;
  member: TripMember;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md border bg-background px-4 py-3 text-left outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "border-blue-200 bg-blue-50/65 hover:bg-blue-50/65",
        )}
        onClick={onSelect}
      >
        <MemberAvatar member={member} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {member.displayName || member.email || member.role}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {[member.displayName ? member.email : null, `Joined ${readableDate(member.joinedAt)}`]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {member.role}
        </span>
      </button>
    </li>
  );
}

function InvitationListCard({
  invitation,
  isSelected,
  onSelect,
}: {
  invitation: TripInvitation;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={cn(
          "flex w-full min-w-0 items-center gap-3 rounded-md border bg-background px-4 py-3 text-left outline-none transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring",
          isSelected && "border-blue-200 bg-blue-50/65 hover:bg-blue-50/65",
        )}
        onClick={onSelect}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted">
          <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{invitation.email}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {invitation.status === "expired"
              ? "Expired"
              : `Expires ${readableDate(invitation.expiresAt)}`}{" "}
            · Traveler
          </span>
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground">
          {invitation.status}
        </span>
      </button>
    </li>
  );
}

function InvitePersonInspector({
  email,
  error,
  isPending,
  onClose,
  onEmailChange,
  onSubmit,
}: {
  email: string;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onEmailChange: (email: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      description="Send a private, seven-day invitation to a verified email address."
      eyebrow="New invitation"
      onClose={onClose}
      title="Invite a person"
    >
      <form className="flex min-h-full flex-col gap-5" onSubmit={onSubmit}>
        <div>
          <Label htmlFor="invite-email">Email address</Label>
          <Input
            id="invite-email"
            className="mt-2"
            type="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="traveler@example.com"
            required
            aria-describedby="invite-role"
          />
        </div>
        <div>
          <Label>Role</Label>
          <div
            id="invite-role"
            className="mt-2 flex h-9 items-center rounded-md bg-muted/50 px-3 text-sm"
          >
            Traveler
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Travelers can view the complete trip without managing it. They must sign in with this
            exact email address.
          </p>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <InspectorFooter>
          <Button type="button" variant="outline" disabled={isPending} onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={isPending || !email.trim()}>
            {isPending ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Mail className="size-4" aria-hidden="true" />
            )}
            {isPending ? "Sending…" : "Send invite"}
          </Button>
        </InspectorFooter>
      </form>
    </WorkspaceInspector>
  );
}

function MemberInspector({
  canRemove,
  isRemoving,
  member,
  onClose,
  onRemove,
}: {
  canRemove: boolean;
  isRemoving: boolean;
  member: TripMember;
  onClose: () => void;
  onRemove: () => Promise<void>;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      description="Membership and access for this trip."
      eyebrow="Trip member"
      onClose={onClose}
      title={member.displayName || member.email || member.role}
    >
      <div className="flex min-h-full flex-col">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} size="large" />
          <div className="min-w-0">
            <p className="truncate font-medium">{member.displayName || member.email}</p>
            {member.displayName && member.email ? (
              <p className="truncate text-sm text-muted-foreground">{member.email}</p>
            ) : null}
          </div>
        </div>
        <dl className="mt-7 divide-y text-sm">
          <DetailRow label="Role" value={member.role} />
          <DetailRow label="Joined" value={readableDate(member.joinedAt)} />
          <DetailRow
            label="Access"
            value={member.accessLevel === "owner" ? "Manages this trip" : "View only"}
          />
        </dl>

        {confirmRemove ? (
          <div className="mt-6 rounded-md bg-destructive/5 p-3 text-sm text-destructive">
            Removing this traveler immediately removes their access to the trip.
          </div>
        ) : null}

        <InspectorFooter>
          {confirmRemove ? (
            <>
              <Button
                variant="outline"
                disabled={isRemoving}
                onClick={() => setConfirmRemove(false)}
              >
                Keep traveler
              </Button>
              <Button
                className="bg-red-600 text-white hover:bg-red-700"
                disabled={isRemoving}
                onClick={() => void onRemove()}
              >
                {isRemoving ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <UserMinus className="size-4" aria-hidden="true" />
                )}
                {isRemoving ? "Removing…" : "Remove traveler"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              {canRemove ? (
                <Button
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmRemove(true)}
                >
                  <UserMinus className="size-4" aria-hidden="true" />
                  Remove traveler
                </Button>
              ) : null}
            </>
          )}
        </InspectorFooter>
      </div>
    </WorkspaceInspector>
  );
}

function InvitationInspector({
  busy,
  invitation,
  onClose,
  onCopy,
  onResend,
  onRevoke,
}: {
  busy: boolean;
  invitation: TripInvitation;
  onClose: () => void;
  onCopy: () => void;
  onResend: () => void;
  onRevoke: () => void;
}) {
  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      description="Manage this private invitation without leaving the people list."
      eyebrow="Pending invitation"
      onClose={onClose}
      title={invitation.email}
    >
      <div className="flex min-h-full flex-col">
        <dl className="divide-y text-sm">
          <DetailRow label="Role" value="Traveler" />
          <DetailRow label="Status" value={invitation.status} capitalize />
          <DetailRow
            label={invitation.status === "expired" ? "Expired" : "Expires"}
            value={readableDate(invitation.expiresAt)}
          />
          <DetailRow
            label="Sent"
            value={invitation.lastSentAt ? readableDate(invitation.lastSentAt) : "Not sent"}
          />
        </dl>
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          The invitation only works for this exact email address. Resending rotates the private link
          and extends its expiration.
        </p>
        <InspectorFooter className="flex-wrap">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" disabled={busy} onClick={onResend}>
            <RotateCw className="size-3.5" aria-hidden="true" />
            {invitation.status === "expired" ? "Send again" : "Resend"}
          </Button>
          {invitation.status === "pending" ? (
            <Button variant="outline" disabled={busy} onClick={onCopy}>
              <Clipboard className="size-3.5" aria-hidden="true" />
              Copy link
            </Button>
          ) : null}
          <Button variant="ghost" className="text-destructive" disabled={busy} onClick={onRevoke}>
            <X className="size-3.5" aria-hidden="true" />
            Revoke
          </Button>
        </InspectorFooter>
      </div>
    </WorkspaceInspector>
  );
}

function MemberAvatar({
  member,
  size = "default",
}: {
  member: TripMember;
  size?: "default" | "large";
}) {
  const className = size === "large" ? "size-12" : "size-10";

  return member.imageUrl ? (
    <img
      className={cn(className, "shrink-0 rounded-full object-cover")}
      src={member.imageUrl}
      alt=""
    />
  ) : (
    <span
      className={cn(
        className,
        "grid shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold",
      )}
      aria-hidden="true"
    >
      {initials(member)}
    </span>
  );
}

function DetailRow({
  capitalize = false,
  label,
  value,
}: {
  capitalize?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-medium", capitalize && "capitalize")}>{value}</dd>
    </div>
  );
}

function InspectorFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "sticky bottom-0 -mx-5 -mb-5 mt-auto flex justify-end gap-2 bg-background px-5 pb-5 pt-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PeopleSkeleton() {
  return (
    <div>
      <Skeleton className="h-16 w-72" />
      <div className="mt-7 grid gap-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

export { TripPeopleSection };
