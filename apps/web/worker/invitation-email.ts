export type InvitationEmail = {
  invitationId: string;
  recipientEmail: string;
  tripName: string;
  invitationUrl: string;
  expiresAt: string;
};

export type InvitationEmailSender = {
  sendInvitation(email: InvitationEmail): Promise<void>;
};

export class InvitationEmailError extends Error {
  constructor() {
    super("Invitation email could not be sent.");
    this.name = "InvitationEmailError";
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function readableExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(expiresAt));
}

export function createResendInvitationEmailSender(
  apiKey: string,
  fromEmail: string,
  fetcher: typeof fetch = fetch,
): InvitationEmailSender {
  return {
    async sendInvitation(email) {
      const safeTripName = email.tripName.replace(/[\r\n]+/g, " ").trim();
      const tripName = escapeHtml(safeTripName);
      const invitationUrl = escapeHtml(email.invitationUrl);
      const expiry = readableExpiry(email.expiresAt);
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `${email.invitationId}:${email.expiresAt}`,
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email.recipientEmail],
            subject: `You’re invited to ${safeTripName}`,
            text: [
              `You’ve been invited to join ${safeTripName} as a Traveler on Voyage.`,
              "",
              `View and accept the invitation: ${email.invitationUrl}`,
              "",
              `This private invitation expires ${expiry}. If you weren’t expecting it, you can ignore this email.`,
            ].join("\n"),
            html: `<div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:32px;color:#20241f"><p style="font-size:14px;color:#687066">VOYAGE</p><h1 style="font-size:28px;line-height:1.2">Join ${tripName}</h1><p style="font-size:16px;line-height:1.6">You’ve been invited to join this trip as a Traveler, with a clear view of the shared plan.</p><p style="margin:28px 0"><a href="${invitationUrl}" style="display:inline-block;background:#20241f;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">View invitation</a></p><p style="font-size:13px;line-height:1.6;color:#687066">This private invitation expires ${expiry}. If you weren’t expecting it, you can ignore this email.</p></div>`,
          }),
        });

        if (!response.ok) throw new InvitationEmailError();
      } catch (error) {
        if (error instanceof InvitationEmailError) throw error;
        throw new InvitationEmailError();
      }
    },
  };
}
