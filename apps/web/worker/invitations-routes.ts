import {
  createInvitationInputSchema,
  createInvitationResponseSchema,
  invitationActionResponseSchema,
  invitationLinkResponseSchema,
  invitationSummaryResponseSchema,
  tripPeopleResponseSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import {
  createResendInvitationEmailSender,
  InvitationEmailError,
  type InvitationEmailSender,
} from "./invitation-email";
import {
  acceptInvitation,
  addInvitationToken,
  createInvitation,
  declineInvitation,
  generateInvitationToken,
  getInvitationById,
  getInvitationByToken,
  getTripAccess,
  hashInvitationToken,
  invitationRateLimitExceeded,
  invitationStatus,
  listMemberships,
  listTripInvitations,
  mapMembership,
  mapTripInvitation,
  markInvitationSent,
  maskEmail,
  newInvitationExpiry,
  normalizeEmail,
  removeTripMember,
  revokeInvitation,
  revokeOtherInvitationTokens,
} from "./invitations-repository";
import type { Bindings, WorkerEnvironment } from "./types";
import { createClerkUserDirectory, type UserDirectory, UserDirectoryError } from "./user-directory";

type InvitationRoutesDependencies = {
  emailSender?: InvitationEmailSender;
  userDirectory?: UserDirectory;
  now?: () => Date;
};

function error(code: string, message: string) {
  return { error: { code, message } };
}

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function appOrigin(bindings: Bindings, request: Request) {
  if (isLoopbackRequest(request)) return new URL(request.url).origin;
  if (bindings.APP_URL) return bindings.APP_URL.replace(/\/$/, "");
  return new URL(request.url).origin;
}

function invitationUrl(bindings: Bindings, request: Request, token: string) {
  return `${appOrigin(bindings, request)}/invitations/${encodeURIComponent(token)}`;
}

function isLoopbackRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function configuredEmailSender(bindings: Bindings, dependency: InvitationEmailSender | undefined) {
  if (dependency) return dependency;
  if (bindings.RESEND_API_KEY && bindings.INVITATION_FROM_EMAIL) {
    return createResendInvitationEmailSender(
      bindings.RESEND_API_KEY,
      bindings.INVITATION_FROM_EMAIL,
    );
  }
  return null;
}

function configuredUserDirectory(bindings: Bindings, dependency: UserDirectory | undefined) {
  if (dependency) return dependency;
  return bindings.CLERK_SECRET_KEY ? createClerkUserDirectory(bindings.CLERK_SECRET_KEY) : null;
}

function invitationDestinations(value: string) {
  try {
    const destinations = JSON.parse(value);
    if (Array.isArray(destinations)) {
      const validDestinations = destinations.filter(
        (destination): destination is string =>
          typeof destination === "string" && destination.length > 0,
      );
      if (validDestinations.length > 0) return validDestinations;
    }
  } catch {
    // The trip contract guarantees at least one stop; this fallback keeps older rows readable.
  }
  return ["Destination not set"];
}

function displayNameForInvitation(identity: Awaited<ReturnType<UserDirectory["getUser"]>> | null) {
  return identity?.displayName?.trim() || identity?.primaryEmail || "Your trip organizer";
}

async function requireOwner(database: D1Database, tripId: string, userId: string) {
  const access = await getTripAccess(database, tripId, userId);
  if (!access) return { response: error("not_found", "Trip not found."), status: 404 as const };
  if (access !== "owner") {
    return {
      response: error("forbidden", "Only the trip organizer can manage people."),
      status: 403 as const,
    };
  }
  return null;
}

async function matchingIdentity(
  invitation: Awaited<ReturnType<typeof getInvitationByToken>>,
  userId: string,
  directory: UserDirectory | null,
) {
  if (!directory) throw new UserDirectoryError();
  const identity = await directory.getUser(userId);
  const matches = identity.verifiedEmails.includes(normalizeEmail(invitation?.email ?? ""));
  return { identity, matches };
}

export function createInvitationRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: InvitationRoutesDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();
  const auth = createAuthMiddleware(authenticateRequest);
  const currentTime = dependencies.now ?? (() => new Date());

  routes.use("/api/trips/*", auth);
  routes.use("/api/invitations/:token/accept", auth);
  routes.use("/api/invitations/:token/decline", auth);

  routes.get("/api/trips/:tripId/people", async (context) => {
    const tripId = context.req.param("tripId");
    const access = await getTripAccess(context.env.DB, tripId, context.var.authUserId);
    if (!access) return context.json(error("not_found", "Trip not found."), 404);

    const membershipRows = await listMemberships(context.env.DB, tripId);
    const directory = configuredUserDirectory(context.env, dependencies.userDirectory);
    const identities = new Map();

    if (directory) {
      const resolved = await Promise.allSettled(
        membershipRows.map((membership) => directory.getUser(membership.user_id)),
      );
      for (const result of resolved) {
        if (result.status !== "fulfilled") continue;
        identities.set(result.value.userId, result.value);
      }
    }

    const invitations =
      access === "owner"
        ? (await listTripInvitations(context.env.DB, tripId)).map(mapTripInvitation)
        : [];
    const response = tripPeopleResponseSchema.parse({
      members: membershipRows.map((membership) =>
        mapMembership(membership, identities.get(membership.user_id), access === "owner"),
      ),
      invitations,
      canManage: access === "owner",
    });
    return context.json(response, 200, { "Cache-Control": "no-store" });
  });

  routes.post("/api/trips/:tripId/invitations", async (context) => {
    const tripId = context.req.param("tripId");
    const ownerError = await requireOwner(context.env.DB, tripId, context.var.authUserId);
    if (ownerError) return context.json(ownerError.response, ownerError.status);

    const parsed = createInvitationInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(
        {
          ...error("validation_error", "Check the highlighted fields."),
          error: {
            ...error("validation_error", "Check the highlighted fields.").error,
            fieldErrors: parsed.error.flatten().fieldErrors,
          },
        },
        422,
      );
    }

    const sender = configuredEmailSender(context.env, dependencies.emailSender);
    const isPreview = !sender && isLoopbackRequest(context.req.raw);
    if (!sender && !isPreview) {
      return context.json(error("service_unavailable", "Invitation email is not configured."), 503);
    }

    const email = normalizeEmail(parsed.data.email);
    const nowDate = currentTime();
    const now = nowDate.toISOString();
    if (
      await invitationRateLimitExceeded(
        context.env.DB,
        tripId,
        context.var.authUserId,
        email,
        nowDate,
      )
    ) {
      return context.json(error("rate_limited", "Too many invitations. Try again later."), 429);
    }

    const directory = configuredUserDirectory(context.env, dependencies.userDirectory);
    let inviterIdentity: Awaited<ReturnType<UserDirectory["getUser"]>> | null = null;
    if (directory) {
      try {
        inviterIdentity = await directory.getUser(context.var.authUserId);
      } catch {
        // Invitation delivery remains available with honest generic Organizer copy.
      }
    }
    const memberships = await listMemberships(context.env.DB, tripId);
    const memberIdentities = directory
      ? await Promise.allSettled(
          memberships.map((membership) => directory.getUser(membership.user_id)),
        )
      : [];
    const belongsToMember =
      memberships.some((membership) => membership.email === email) ||
      memberIdentities.some(
        (result) => result.status === "fulfilled" && result.value.verifiedEmails.includes(email),
      );
    if (belongsToMember) {
      return context.json(error("conflict", "That person is already on this trip."), 409);
    }

    const existingInvitation = (await listTripInvitations(context.env.DB, tripId)).find(
      (invitation) => invitation.email === email && invitationStatus(invitation, now) === "pending",
    );
    if (existingInvitation) {
      return context.json(
        error("conflict", "An invitation for that email address is already pending."),
        409,
      );
    }

    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const expiresAt = newInvitationExpiry(nowDate);
    let invitation: Awaited<ReturnType<typeof createInvitation>>;
    try {
      invitation = await createInvitation(context.env.DB, {
        tripId,
        email,
        invitedByUserId: context.var.authUserId,
        inviterDisplayName: displayNameForInvitation(inviterIdentity),
        tokenHash,
        now,
        expiresAt,
      });
    } catch (creationError) {
      if (creationError instanceof Error && creationError.message.includes("UNIQUE constraint")) {
        return context.json(
          error("conflict", "An invitation for that email address is already pending."),
          409,
        );
      }
      throw creationError;
    }
    if (!invitation) throw new Error("Created invitation could not be read.");

    const url = invitationUrl(context.env, context.req.raw, token);
    if (sender) {
      try {
        await sender.sendInvitation({
          invitationId: invitation.id,
          recipientEmail: email,
          tripName: invitation.trip_name,
          destinations: invitationDestinations(invitation.trip_destinations_json),
          startDate: invitation.trip_start_date,
          endDate: invitation.trip_end_date,
          invitedByName: invitation.inviter_display_name ?? "Your trip organizer",
          invitationUrl: url,
          expiresAt,
        });
        await markInvitationSent(context.env.DB, invitation.id, tokenHash, now);
        invitation = (await getInvitationById(context.env.DB, tripId, invitation.id)) ?? invitation;
      } catch (sendError) {
        if (sendError instanceof InvitationEmailError) {
          return context.json(
            error("service_unavailable", "The invitation was saved, but the email was not sent."),
            503,
          );
        }
        throw sendError;
      }
    }

    const response = createInvitationResponseSchema.parse({
      invitation: mapTripInvitation(invitation),
      ...(isPreview ? { previewUrl: url } : {}),
    });
    return context.json(response, 201, { "Cache-Control": "no-store" });
  });

  routes.post("/api/trips/:tripId/invitations/:invitationId/resend", async (context) => {
    const tripId = context.req.param("tripId");
    const ownerError = await requireOwner(context.env.DB, tripId, context.var.authUserId);
    if (ownerError) return context.json(ownerError.response, ownerError.status);
    const invitation = await getInvitationById(
      context.env.DB,
      tripId,
      context.req.param("invitationId"),
    );
    if (!invitation) return context.json(error("not_found", "Invitation not found."), 404);
    const status = invitationStatus(invitation, currentTime().toISOString());
    if (!(["pending", "expired"] as const).includes(status as "pending" | "expired")) {
      return context.json(error("conflict", "This invitation can no longer be resent."), 409);
    }

    const sender = configuredEmailSender(context.env, dependencies.emailSender);
    const isPreview = !sender && isLoopbackRequest(context.req.raw);
    if (!sender && !isPreview) {
      return context.json(error("service_unavailable", "Invitation email is not configured."), 503);
    }
    const nowDate = currentTime();
    const now = nowDate.toISOString();
    if (invitation.last_sent_at && Date.parse(now) - Date.parse(invitation.last_sent_at) < 60_000) {
      return context.json(error("rate_limited", "Wait a minute before resending."), 429);
    }
    const token = generateInvitationToken();
    const tokenHash = await hashInvitationToken(token);
    const expiresAt = newInvitationExpiry(nowDate);
    await addInvitationToken(context.env.DB, invitation.id, tokenHash, expiresAt, now);
    const url = invitationUrl(context.env, context.req.raw, token);
    if (sender) {
      try {
        await sender.sendInvitation({
          invitationId: invitation.id,
          recipientEmail: invitation.email,
          tripName: invitation.trip_name,
          destinations: invitationDestinations(invitation.trip_destinations_json),
          startDate: invitation.trip_start_date,
          endDate: invitation.trip_end_date,
          invitedByName: invitation.inviter_display_name ?? "Your trip organizer",
          invitationUrl: url,
          expiresAt,
        });
        await markInvitationSent(context.env.DB, invitation.id, tokenHash, now);
      } catch (sendError) {
        if (sendError instanceof InvitationEmailError) {
          return context.json(error("service_unavailable", "The email could not be sent."), 503);
        }
        throw sendError;
      }
    }
    if (isPreview) {
      await revokeOtherInvitationTokens(context.env.DB, invitation.id, tokenHash, now);
    }
    const updated = (await getInvitationById(context.env.DB, tripId, invitation.id)) ?? invitation;
    return context.json(
      createInvitationResponseSchema.parse({
        invitation: mapTripInvitation(updated),
        ...(isPreview ? { previewUrl: url } : {}),
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.post("/api/trips/:tripId/invitations/:invitationId/link", async (context) => {
    const tripId = context.req.param("tripId");
    const ownerError = await requireOwner(context.env.DB, tripId, context.var.authUserId);
    if (ownerError) return context.json(ownerError.response, ownerError.status);
    const invitation = await getInvitationById(
      context.env.DB,
      tripId,
      context.req.param("invitationId"),
    );
    if (!invitation || invitationStatus(invitation) !== "pending") {
      return context.json(error("not_found", "Pending invitation not found."), 404);
    }
    const nowDate = currentTime();
    const token = generateInvitationToken();
    await addInvitationToken(
      context.env.DB,
      invitation.id,
      await hashInvitationToken(token),
      invitation.expires_at,
      nowDate.toISOString(),
    );
    return context.json(
      invitationLinkResponseSchema.parse({
        invitationUrl: invitationUrl(context.env, context.req.raw, token),
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.delete("/api/trips/:tripId/invitations/:invitationId", async (context) => {
    const tripId = context.req.param("tripId");
    const ownerError = await requireOwner(context.env.DB, tripId, context.var.authUserId);
    if (ownerError) return context.json(ownerError.response, ownerError.status);
    const revoked = await revokeInvitation(
      context.env.DB,
      tripId,
      context.req.param("invitationId"),
      currentTime().toISOString(),
    );
    if (!revoked) return context.json(error("not_found", "Pending invitation not found."), 404);
    return context.body(null, 204);
  });

  routes.delete("/api/trips/:tripId/people/:userId", async (context) => {
    const tripId = context.req.param("tripId");
    const ownerError = await requireOwner(context.env.DB, tripId, context.var.authUserId);
    if (ownerError) return context.json(ownerError.response, ownerError.status);
    const removed = await removeTripMember(context.env.DB, tripId, context.req.param("userId"));
    if (!removed) return context.json(error("not_found", "Traveler not found."), 404);
    return context.body(null, 204);
  });

  routes.get("/api/invitations/:token", async (context) => {
    const token = context.req.param("token");
    if (token.length < 40 || token.length > 100) {
      return context.json(error("not_found", "Invitation not found."), 404);
    }
    const invitation = await getInvitationByToken(context.env.DB, await hashInvitationToken(token));
    if (!invitation) return context.json(error("not_found", "Invitation not found."), 404);
    const response = invitationSummaryResponseSchema.parse({
      invitation: {
        tripName: invitation.trip_name,
        destinations: invitationDestinations(invitation.trip_destinations_json),
        startDate: invitation.trip_start_date,
        endDate: invitation.trip_end_date,
        invitedByName: invitation.inviter_display_name ?? "Your trip organizer",
        invitedEmail: maskEmail(invitation.email),
        role: "Traveler",
        status: invitationStatus(invitation, currentTime().toISOString()),
        expiresAt: invitation.token_expires_at,
      },
    });
    return context.json(response, 200, { "Cache-Control": "private, no-store" });
  });

  routes.post("/api/invitations/:token/accept", async (context) => {
    const invitation = await getInvitationByToken(
      context.env.DB,
      await hashInvitationToken(context.req.param("token")),
    );
    if (!invitation) return context.json(error("not_found", "Invitation not found."), 404);
    const status = invitationStatus(invitation, currentTime().toISOString());
    if (status === "accepted" && invitation.accepted_by_user_id === context.var.authUserId) {
      return context.json(
        invitationActionResponseSchema.parse({ tripId: invitation.trip_id, status: "accepted" }),
        200,
      );
    }
    if (status === "expired")
      return context.json(error("expired", "This invitation expired."), 410);
    if (status === "revoked") {
      return context.json(error("revoked", "This invitation is no longer available."), 410);
    }
    if (status !== "pending") {
      return context.json(error("conflict", "This invitation has already been used."), 409);
    }

    try {
      const { identity, matches } = await matchingIdentity(
        invitation,
        context.var.authUserId,
        configuredUserDirectory(context.env, dependencies.userDirectory),
      );
      if (!matches) {
        return context.json(
          error(
            "email_mismatch",
            `Sign in with the account for ${maskEmail(invitation.email)} to accept.`,
          ),
          403,
        );
      }
      const now = currentTime().toISOString();
      const result = await acceptInvitation(context.env.DB, invitation, identity, now);
      if (!result.accepted) {
        return context.json(error("conflict", "This invitation has already been used."), 409);
      }
      return context.json(
        invitationActionResponseSchema.parse({
          tripId: invitation.trip_id,
          status: result.alreadyMember ? "already_member" : "accepted",
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    } catch (identityError) {
      if (identityError instanceof UserDirectoryError) {
        return context.json(
          error("service_unavailable", "We couldn’t verify your account email. Try again."),
          503,
        );
      }
      throw identityError;
    }
  });

  routes.post("/api/invitations/:token/decline", async (context) => {
    const invitation = await getInvitationByToken(
      context.env.DB,
      await hashInvitationToken(context.req.param("token")),
    );
    if (!invitation) return context.json(error("not_found", "Invitation not found."), 404);
    if (invitationStatus(invitation, currentTime().toISOString()) !== "pending") {
      return context.json(error("conflict", "This invitation is no longer pending."), 409);
    }
    try {
      const { matches } = await matchingIdentity(
        invitation,
        context.var.authUserId,
        configuredUserDirectory(context.env, dependencies.userDirectory),
      );
      if (!matches) {
        return context.json(
          error("email_mismatch", `Sign in as ${maskEmail(invitation.email)} to decline.`),
          403,
        );
      }
      const declined = await declineInvitation(
        context.env.DB,
        invitation.id,
        currentTime().toISOString(),
      );
      if (!declined) return context.json(error("conflict", "Invitation already handled."), 409);
      return context.json(
        invitationActionResponseSchema.parse({
          tripId: invitation.trip_id,
          status: "declined",
        }),
        200,
        { "Cache-Control": "no-store" },
      );
    } catch (identityError) {
      if (identityError instanceof UserDirectoryError) {
        return context.json(
          error("service_unavailable", "We couldn’t verify your account email. Try again."),
          503,
        );
      }
      throw identityError;
    }
  });

  return routes;
}
