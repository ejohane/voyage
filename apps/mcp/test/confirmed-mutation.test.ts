import { describe, expect, it } from "vitest";
import {
  createConfirmationToken,
  hashJson,
  verifyConfirmationToken,
} from "../src/confirmed-mutation";

describe("confirmed mutations", () => {
  it("binds a signed token to its prefix, proposal hash, and 30-minute lifetime", async () => {
    const now = Date.UTC(2026, 6, 27, 12, 0, 0);
    const prefix = "voyage-test-v1";
    const secret = "test-confirmation-secret";
    const hash = await hashJson({ tripId: "trip_123", plans: [{ title: "Museum" }] });
    const signed = await createConfirmationToken(prefix, hash, secret, now);

    expect(signed.confirmationToken).toMatch(/^voyage-test-v1:\d{13}:[a-f0-9]{64}$/);
    expect(signed.confirmationExpiresAt).toBe("2026-07-27T12:30:00.000Z");
    await expect(
      verifyConfirmationToken(
        signed.confirmationToken,
        prefix,
        secret,
        hash,
        now + 30 * 60 * 1000 - 1,
      ),
    ).resolves.toBe(true);
    await expect(
      verifyConfirmationToken(signed.confirmationToken, prefix, secret, hash, now + 30 * 60 * 1000),
    ).resolves.toBe(false);
    await expect(
      verifyConfirmationToken(signed.confirmationToken, "voyage-other-v1", secret, hash, now),
    ).resolves.toBe(false);
    await expect(
      verifyConfirmationToken(
        signed.confirmationToken,
        prefix,
        secret,
        await hashJson({ tripId: "trip_123", plans: [{ title: "Changed" }] }),
        now,
      ),
    ).resolves.toBe(false);
  });
});
