import { env } from "cloudflare:test";
import {
  type ApiError,
  acceptInvitationEndpoint,
  type CreateInvitationResponse,
  copyTripInvitationLinkEndpoint,
  declineInvitationEndpoint,
  type InvitationLinkResponse,
  type InvitationSummaryResponse,
  invitationEndpoint,
  resendTripInvitationEndpoint,
  type TripPeopleResponse,
  type TripResponse,
  tripInvitationEndpoint,
  tripInvitationsEndpoint,
  tripMemberEndpoint,
  tripPeopleEndpoint,
  tripsEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";
import { type InvitationEmail, InvitationEmailError } from "../worker/invitation-email";
import type { UserDirectory, UserIdentity } from "../worker/user-directory";

let now = new Date("2026-08-01T12:00:00.000Z");
let sentEmails: InvitationEmail[] = [];
let emailFailure = false;
const identities = new Map<string, UserIdentity>();

const userDirectory: UserDirectory = {
  async getUser(userId) {
    const identity = identities.get(userId);
    if (!identity) throw new Error("Missing test identity");
    return identity;
  },
};

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  userDirectory,
  invitationEmailSender: {
    async sendInvitation(email) {
      if (emailFailure) throw new InvitationEmailError();
      sentEmails.push(email);
    },
  },
  now: () => now,
});

const previewApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  userDirectory,
  now: () => now,
});

async function request(
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return testApp.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function previewRequest(
  origin: string,
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return previewApp.request(`${origin}${path}`, { ...init, headers }, env);
}

function identity(userId: string, email: string, displayName: string): UserIdentity {
  return {
    userId,
    verifiedEmails: [email.toLowerCase()],
    primaryEmail: email.toLowerCase(),
    displayName,
    imageUrl: null,
  };
}

async function createTrip() {
  const response = await request(tripsEndpoint, "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Summer in Japan",
      stops: [{ name: "Tokyo, Japan", arrivalDate: null, departureDate: null }],
    }),
  });
  expect(response.status).toBe(201);
  return (await response.json<TripResponse>()).trip;
}

async function invite(tripId: string, email = "traveler@example.com") {
  const response = await request(tripInvitationsEndpoint(tripId), "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return { response, body: await response.json<CreateInvitationResponse>() };
}

function tokenFromLastEmail() {
  const url = new URL(sentEmails.at(-1)?.invitationUrl ?? "");
  return decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
}

describe("trip invitations", () => {
  beforeEach(async () => {
    now = new Date("2026-08-01T12:00:00.000Z");
    sentEmails = [];
    emailFailure = false;
    identities.clear();
    identities.set("user_owner", identity("user_owner", "owner@example.com", "Olivia Owner"));
    identities.set(
      "user_traveler",
      identity("user_traveler", "traveler@example.com", "Tara Traveler"),
    );
    identities.set("user_other", identity("user_other", "other@example.com", "Otto Other"));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM trip_invitation_tokens"),
      env.DB.prepare("DELETE FROM trip_invitations"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_plans"),
      env.DB.prepare("DELETE FROM trip_stops"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("sends an email-bound Traveler invitation without storing the raw token", async () => {
    const trip = await createTrip();
    const { response, body } = await invite(trip.id, "Traveler@Example.com");
    const token = tokenFromLastEmail();
    const storedToken = await env.DB.prepare(
      "SELECT token_hash FROM trip_invitation_tokens WHERE invitation_id = ?",
    )
      .bind(body.invitation.id)
      .first<{ token_hash: string }>();

    expect(response.status).toBe(201);
    expect(body.invitation).toMatchObject({
      email: "traveler@example.com",
      role: "Traveler",
      status: "pending",
      sendCount: 1,
    });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      recipientEmail: "traveler@example.com",
      tripName: "Summer in Japan",
    });
    expect(token).toHaveLength(43);
    expect(storedToken?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(storedToken?.token_hash).not.toContain(token);
  });

  it("requires the matching verified Clerk email and explicitly creates a viewer membership", async () => {
    const trip = await createTrip();
    await invite(trip.id);
    const token = tokenFromLastEmail();
    const summaryResponse = await request(invitationEndpoint(token));
    const summary = await summaryResponse.json<InvitationSummaryResponse>();
    const unauthenticated = await request(acceptInvitationEndpoint(token), undefined, {
      method: "POST",
    });
    const wrongAccount = await request(acceptInvitationEndpoint(token), "user_other", {
      method: "POST",
    });
    const accepted = await request(acceptInvitationEndpoint(token), "user_traveler", {
      method: "POST",
    });
    const membership = await env.DB.prepare(
      "SELECT access_level, email, display_name FROM trip_memberships WHERE trip_id = ? AND user_id = ?",
    )
      .bind(trip.id, "user_traveler")
      .first();
    const acceptedAgain = await request(acceptInvitationEndpoint(token), "user_traveler", {
      method: "POST",
    });

    expect(summaryResponse.status).toBe(200);
    expect(summary.invitation).toMatchObject({
      tripName: "Summer in Japan",
      invitedEmail: "tr••••••@example.com",
      role: "Traveler",
      status: "pending",
    });
    expect(unauthenticated.status).toBe(401);
    expect(wrongAccount.status).toBe(403);
    expect((await wrongAccount.json<ApiError>()).error.code).toBe("email_mismatch");
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({ tripId: trip.id, status: "accepted" });
    expect(membership).toEqual({
      access_level: "viewer",
      email: "traveler@example.com",
      display_name: "Tara Traveler",
    });
    expect(acceptedAgain.status).toBe(200);
  });

  it("shows members to travelers while keeping invitation management owner-only", async () => {
    const trip = await createTrip();
    await invite(trip.id);
    await request(acceptInvitationEndpoint(tokenFromLastEmail()), "user_traveler", {
      method: "POST",
    });
    const travelerPeople = await request(tripPeopleEndpoint(trip.id), "user_traveler");
    const travelerBody = await travelerPeople.json<TripPeopleResponse>();
    const forbiddenInvite = await request(tripInvitationsEndpoint(trip.id), "user_traveler", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "another@example.com" }),
    });

    expect(travelerPeople.status).toBe(200);
    expect(travelerBody.canManage).toBe(false);
    expect(travelerBody.invitations).toEqual([]);
    expect(travelerBody.members.map((member) => member.role)).toEqual(["Organizer", "Traveler"]);
    expect(forbiddenInvite.status).toBe(403);
  });

  it("rejects duplicate pending invitations and lets the organizer revoke and re-invite", async () => {
    const trip = await createTrip();
    const first = await invite(trip.id);
    const oldToken = tokenFromLastEmail();
    const duplicate = await invite(trip.id);
    const revoked = await request(
      tripInvitationEndpoint(trip.id, first.body.invitation.id),
      "user_owner",
      { method: "DELETE" },
    );
    const oldSummary = await request(invitationEndpoint(oldToken));
    const second = await invite(trip.id);

    expect(duplicate.response.status).toBe(409);
    expect(revoked.status).toBe(204);
    expect((await oldSummary.json<InvitationSummaryResponse>()).invitation.status).toBe("revoked");
    expect(second.response.status).toBe(201);
  });

  it("resends with a rotated token and rejects the previous emailed link", async () => {
    const trip = await createTrip();
    const created = await invite(trip.id);
    const oldToken = tokenFromLastEmail();
    now = new Date("2026-08-01T12:02:00.000Z");
    const resent = await request(
      resendTripInvitationEndpoint(trip.id, created.body.invitation.id),
      "user_owner",
      { method: "POST" },
    );
    const newToken = tokenFromLastEmail();
    const oldSummary = await request(invitationEndpoint(oldToken));
    const newSummary = await request(invitationEndpoint(newToken));

    expect(resent.status).toBe(200);
    expect(newToken).not.toBe(oldToken);
    expect((await oldSummary.json<InvitationSummaryResponse>()).invitation.status).toBe("revoked");
    expect((await newSummary.json<InvitationSummaryResponse>()).invitation.status).toBe("pending");
  });

  it("creates an additional email-bound link for copying without exposing stored tokens", async () => {
    const trip = await createTrip();
    const created = await invite(trip.id);
    const copied = await request(
      copyTripInvitationLinkEndpoint(trip.id, created.body.invitation.id),
      "user_owner",
      { method: "POST" },
    );
    const body = await copied.json<InvitationLinkResponse>();
    const token = decodeURIComponent(new URL(body.invitationUrl).pathname.split("/").at(-1) ?? "");
    const summary = await request(invitationEndpoint(token));

    expect(copied.status).toBe(200);
    expect((await summary.json<InvitationSummaryResponse>()).invitation.status).toBe("pending");
  });

  it("supports decline, expiry, and removed-trip link states", async () => {
    const trip = await createTrip();
    await invite(trip.id);
    const declinedToken = tokenFromLastEmail();
    const declined = await request(declineInvitationEndpoint(declinedToken), "user_traveler", {
      method: "POST",
    });
    expect(declined.status).toBe(200);
    const declinedSummary = await request(invitationEndpoint(declinedToken));
    expect((await declinedSummary.json<InvitationSummaryResponse>()).invitation.status).toBe(
      "declined",
    );

    const reinvited = await invite(trip.id);
    expect(reinvited.response.status).toBe(201);
    const expiredToken = tokenFromLastEmail();
    now = new Date("2026-08-09T12:00:00.000Z");
    const expired = await request(acceptInvitationEndpoint(expiredToken), "user_traveler", {
      method: "POST",
    });
    expect(expired.status).toBe(410);
    expect((await expired.json<ApiError>()).error.code).toBe("expired");

    await env.DB.prepare("DELETE FROM trips WHERE id = ?").bind(trip.id).run();
    expect((await request(invitationEndpoint(expiredToken))).status).toBe(404);
  });

  it("lets the organizer remove a traveler without allowing removal of the owner", async () => {
    const trip = await createTrip();
    await invite(trip.id);
    await request(acceptInvitationEndpoint(tokenFromLastEmail()), "user_traveler", {
      method: "POST",
    });
    const ownerRemoval = await request(tripMemberEndpoint(trip.id, "user_owner"), "user_owner", {
      method: "DELETE",
    });
    const travelerRemoval = await request(
      tripMemberEndpoint(trip.id, "user_traveler"),
      "user_owner",
      { method: "DELETE" },
    );
    const removedTrip = await request(`${tripsEndpoint}/${trip.id}`, "user_traveler");

    expect(ownerRemoval.status).toBe(404);
    expect(travelerRemoval.status).toBe(204);
    expect(removedTrip.status).toBe(404);
  });

  it("keeps a pending record when the provider cannot confirm delivery", async () => {
    const trip = await createTrip();
    emailFailure = true;
    const result = await invite(trip.id);
    const people = await request(tripPeopleEndpoint(trip.id), "user_owner");
    const body = await people.json<TripPeopleResponse>();

    expect(result.response.status).toBe(503);
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0]).toMatchObject({ status: "pending", sendCount: 0 });
  });

  it("provides loopback-only email previews and rotates prior preview links on resend", async () => {
    const trip = await createTrip();
    const created = await previewRequest(
      "http://127.0.0.1:5173",
      tripInvitationsEndpoint(trip.id),
      "user_owner",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "traveler@example.com" }),
      },
    );
    const body = await created.json<CreateInvitationResponse>();
    const oldToken = new URL(body.previewUrl ?? "").pathname.split("/").at(-1) ?? "";
    const resent = await previewRequest(
      "http://127.0.0.1:5173",
      resendTripInvitationEndpoint(trip.id, body.invitation.id),
      "user_owner",
      { method: "POST" },
    );
    const resentBody = await resent.json<CreateInvitationResponse>();
    const oldSummary = await previewRequest("http://127.0.0.1:5173", invitationEndpoint(oldToken));

    expect(created.status).toBe(201);
    expect(body.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:5173\/invitations\//);
    expect(resent.status).toBe(200);
    expect(resentBody.previewUrl).toMatch(/^http:\/\/127\.0\.0\.1:5173\/invitations\//);
    expect((await oldSummary.json<InvitationSummaryResponse>()).invitation.status).toBe("revoked");
  });

  it("does not expose previews when email delivery is missing on a non-loopback host", async () => {
    const trip = await createTrip();
    const response = await previewRequest(
      "https://voyage.test",
      tripInvitationsEndpoint(trip.id),
      "user_owner",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "traveler@example.com" }),
      },
    );
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM trip_invitations").first<{
      count: number;
    }>();

    expect(response.status).toBe(503);
    expect(count?.count).toBe(0);
  });
});
