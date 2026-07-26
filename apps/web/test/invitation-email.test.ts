import { describe, expect, it } from "vitest";
import {
  createResendInvitationEmailSender,
  InvitationEmailError,
} from "../worker/invitation-email";

describe("invitation email", () => {
  it("sends a plain-text and escaped HTML invitation through Resend", async () => {
    let request: Request | null = null;
    const sender = createResendInvitationEmailSender(
      "test-api-key",
      "Voyage <invites@voyage.test>",
      async (input, init) => {
        request = new Request(input, init);
        return Response.json({ id: "email_123" });
      },
    );

    await sender.sendInvitation({
      invitationId: "8b644637-fbf8-4bc6-8ddf-a61ca75fcf3a",
      recipientEmail: "traveler@example.com",
      tripName: "Japan <script>alert(1)</script>\r\nBcc: bad@example.com",
      invitationUrl: "https://voyage.test/invitations/private-token",
      expiresAt: "2026-08-08T12:00:00.000Z",
    });

    expect(request).not.toBeNull();
    const captured = request as unknown as Request;
    const payload = (await captured.json()) as {
      to: string[];
      subject: string;
      text: string;
      html: string;
    };
    expect(captured.url).toBe("https://api.resend.com/emails");
    expect(captured.headers.get("Authorization")).toBe("Bearer test-api-key");
    expect(captured.headers.get("Idempotency-Key")).toContain(
      "8b644637-fbf8-4bc6-8ddf-a61ca75fcf3a",
    );
    expect(payload.to).toEqual(["traveler@example.com"]);
    expect(payload.subject).not.toContain("\n");
    expect(payload.text).toContain("https://voyage.test/invitations/private-token");
    expect(payload.html).toContain("Japan &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(payload.html).not.toContain("<script>");
  });

  it("normalizes provider and network failures", async () => {
    const rejected = createResendInvitationEmailSender(
      "test-api-key",
      "Voyage <invites@voyage.test>",
      async () => new Response("no", { status: 422 }),
    );
    const unreachable = createResendInvitationEmailSender(
      "test-api-key",
      "Voyage <invites@voyage.test>",
      async () => {
        throw new TypeError("network failure");
      },
    );

    await expect(
      rejected.sendInvitation({
        invitationId: crypto.randomUUID(),
        recipientEmail: "traveler@example.com",
        tripName: "Japan",
        invitationUrl: "https://voyage.test/invitations/token",
        expiresAt: "2026-08-08T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(InvitationEmailError);
    await expect(
      unreachable.sendInvitation({
        invitationId: crypto.randomUUID(),
        recipientEmail: "traveler@example.com",
        tripName: "Japan",
        invitationUrl: "https://voyage.test/invitations/token",
        expiresAt: "2026-08-08T12:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(InvitationEmailError);
  });
});
