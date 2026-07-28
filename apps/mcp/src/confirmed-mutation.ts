export class ConfirmationTokenError extends Error {}
export class IdempotencyConflictError extends Error {}

const confirmationLifetimeMilliseconds = 30 * 60 * 1000;

export async function hashJson(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[a-f0-9]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function signConfirmation(secret: string, expiresAt: number, hash: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(`${expiresAt}:${hash}`),
  );
  return bytesToHex(signature);
}

export async function createConfirmationToken(
  prefix: string,
  hash: string,
  secret: string,
  now = Date.now(),
) {
  const expiresAt = now + confirmationLifetimeMilliseconds;
  const signature = await signConfirmation(secret, expiresAt, hash);
  return {
    confirmationToken: `${prefix}:${expiresAt}:${signature}`,
    confirmationExpiresAt: new Date(expiresAt).toISOString(),
  };
}

export async function verifyConfirmationToken(
  token: string,
  prefix: string,
  secret: string,
  hash: string,
  now = Date.now(),
): Promise<boolean> {
  const match = token.match(new RegExp(`^${prefix}:(\\d{13}):([a-f0-9]{64})$`));
  if (!match) return false;

  const expiresAt = Number(match[1]);
  const signature = hexToBytes(match[2]);
  if (!signature || !Number.isSafeInteger(expiresAt) || expiresAt <= now) return false;

  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    new TextEncoder().encode(`${expiresAt}:${hash}`),
  );
}
