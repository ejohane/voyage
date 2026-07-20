import {
  gmailImportInputSchema,
  gmailImportResponseSchema,
  gmailScanInputSchema,
  gmailScanResponseSchema,
} from "@voyage/contracts";
import { Hono } from "hono";
import { type AuthenticateRequest, createAuthMiddleware } from "./auth";
import { gmailCandidateSources } from "./gmail-candidates";
import { decryptSecret, encryptSecret } from "./gmail-crypto";
import { importGmailCandidate } from "./gmail-import-repository";
import { scanGmailBookings } from "./gmail-ingestion";
import {
  getGmailConnection,
  listImportedSourceKeys,
  saveGmailConnection,
} from "./gmail-repository";
import { refreshGoogleAccessToken } from "./google-oauth";
import { listTravel } from "./planning-repository";
import { getTrip } from "./trips-repository";
import type { WorkerEnvironment } from "./types";

type GmailImportDependencies = {
  fetcher?: typeof fetch;
};

async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function createGmailImportRoutes(
  authenticateRequest: AuthenticateRequest,
  dependencies: GmailImportDependencies = {},
) {
  const routes = new Hono<WorkerEnvironment>();
  const fetcher = dependencies.fetcher ?? fetch;
  routes.use("*", createAuthMiddleware(authenticateRequest));

  routes.post("/:tripId/imports/gmail/scan", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    const scanInput = gmailScanInputSchema.safeParse((await readJson(context.req.raw)) ?? {});
    if (!scanInput.success) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Choose a supported Gmail scan mode.",
          },
        },
        422,
      );
    }

    const connection = await getGmailConnection(context.env.DB, context.var.authUserId);
    if (!connection) {
      return context.json(
        {
          error: {
            code: "gmail_not_connected" as const,
            message: "Connect Gmail before scanning for bookings.",
          },
        },
        409,
      );
    }

    const refreshToken = await decryptSecret(
      connection.encryptedRefreshToken,
      context.env.GMAIL_TOKEN_ENCRYPTION_KEY,
    );
    const tokens = await refreshGoogleAccessToken(fetcher, {
      refreshToken,
      clientId: context.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: context.env.GOOGLE_OAUTH_CLIENT_SECRET,
    });
    if (tokens.refresh_token) {
      await saveGmailConnection(context.env.DB, {
        ...connection,
        encryptedRefreshToken: await encryptSecret(
          tokens.refresh_token,
          context.env.GMAIL_TOKEN_ENCRYPTION_KEY,
        ),
        updatedAt: new Date().toISOString(),
      });
    }

    const scan = await scanGmailBookings({
      database: context.env.DB,
      userId: context.var.authUserId,
      fetcher,
      accessToken: tokens.access_token,
      trip,
      accountEmail: connection.email,
      existingTravel: await listTravel(context.env.DB, trip.id),
      mode: scanInput.data.mode,
    });
    const importedKeys = await listImportedSourceKeys(
      context.env.DB,
      context.var.authUserId,
      trip.id,
    );
    const candidates = scan.candidates.filter((candidate) =>
      gmailCandidateSources(candidate).some((source) => !importedKeys.has(source.key)),
    );

    return context.json(
      gmailScanResponseSchema.parse({
        candidates,
        alreadyImported: scan.candidates.length - candidates.length,
        messagesScanned: scan.messagesScanned,
        search: scan.search,
      }),
      200,
      { "Cache-Control": "no-store" },
    );
  });

  routes.post("/:tripId/imports/gmail", async (context) => {
    const trip = await getTrip(context.env.DB, context.var.authUserId, context.req.param("tripId"));
    if (!trip) {
      return context.json(
        { error: { code: "not_found" as const, message: "Trip not found." } },
        404,
      );
    }
    if (trip.accessLevel === "viewer") {
      return context.json(
        { error: { code: "forbidden" as const, message: "You cannot edit this trip." } },
        403,
      );
    }

    if (!(await getGmailConnection(context.env.DB, context.var.authUserId))) {
      return context.json(
        {
          error: {
            code: "gmail_not_connected" as const,
            message: "Connect Gmail before importing bookings.",
          },
        },
        409,
      );
    }

    const parsed = gmailImportInputSchema.safeParse(await readJson(context.req.raw));
    if (!parsed.success) {
      return context.json(
        {
          error: {
            code: "validation_error" as const,
            message: "Review the selected Gmail bookings and try again.",
          },
        },
        422,
      );
    }

    const imported = [];
    const skipped = [];
    for (const candidate of parsed.data.candidates) {
      const result = await importGmailCandidate(
        context.env.DB,
        context.var.authUserId,
        trip.id,
        candidate,
      );
      if (result.result === "imported" && result.item) imported.push(result.item);
      else skipped.push({ sourceKey: candidate.source.key, reason: result.result });
    }

    return context.json(gmailImportResponseSchema.parse({ imported, skipped }), 200, {
      "Cache-Control": "no-store",
    });
  });

  return routes;
}
