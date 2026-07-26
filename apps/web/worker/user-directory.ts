import { createClerkClient } from "@clerk/backend";

export type UserIdentity = {
  userId: string;
  verifiedEmails: string[];
  primaryEmail: string | null;
  displayName: string | null;
  imageUrl: string | null;
};

export type UserDirectory = {
  getUser(userId: string): Promise<UserIdentity>;
};

export class UserDirectoryError extends Error {
  constructor() {
    super("User identity is unavailable.");
    this.name = "UserDirectoryError";
  }
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createClerkUserDirectory(secretKey: string): UserDirectory {
  const clerk = createClerkClient({ secretKey });

  return {
    async getUser(userId) {
      try {
        const user = await clerk.users.getUser(userId);
        const verifiedEmails = user.emailAddresses
          .filter((email) => email.verification?.status === "verified")
          .map((email) => normalizeEmail(email.emailAddress));
        const primaryEmail = user.primaryEmailAddress;

        return {
          userId: user.id,
          verifiedEmails,
          primaryEmail:
            primaryEmail?.verification?.status === "verified"
              ? normalizeEmail(primaryEmail.emailAddress)
              : (verifiedEmails[0] ?? null),
          displayName: user.fullName?.trim() || null,
          imageUrl: user.hasImage ? user.imageUrl : null,
        };
      } catch {
        throw new UserDirectoryError();
      }
    },
  };
}
