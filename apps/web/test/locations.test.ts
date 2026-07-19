import {
  type LocationSuggestion,
  locationSuggestionsEndpoint,
  resolveLocationEndpoint,
  type TripStopLocation,
} from "@voyage/contracts";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../worker";
import type { PlacesClient } from "../worker/google-places";

const resolvedLocation: TripStopLocation = {
  provider: "google",
  placeId: "ChIJu46S-ZZhLxMROG5lkwZ3D7k",
};

const placesClient: PlacesClient = {
  suggest: vi.fn(
    async (): Promise<LocationSuggestion[]> => [
      {
        placeId: resolvedLocation.placeId,
        label: "Rome, Metropolitan City of Rome Capital, Italy",
        primaryText: "Rome",
        secondaryText: "Metropolitan City of Rome Capital, Italy",
        types: ["locality", "political", "geocode"],
        kind: "city",
      },
    ],
  ),
  resolve: vi.fn(async () => resolvedLocation),
};

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  placesClient,
});

function request(path: string, userId?: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return testApp.request(`https://voyage.test${path}`, { ...init, headers });
}

describe("location API", () => {
  it("requires authentication before searching", async () => {
    const response = await request(
      `${locationSuggestionsEndpoint}?q=Rome&sessionToken=5f0d88d9-7955-4680-9fbc-baad1fb5890c`,
    );

    expect(response.status).toBe(401);
  });

  it("returns normalized Google Places suggestions", async () => {
    const response = await request(
      `${locationSuggestionsEndpoint}?q=Rome&sessionToken=5f0d88d9-7955-4680-9fbc-baad1fb5890c`,
      "user_owner",
      { headers: { "Accept-Language": "en-US,en;q=0.9" } },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: [
        expect.objectContaining({
          placeId: resolvedLocation.placeId,
          primaryText: "Rome",
          kind: "city",
        }),
      ],
    });
    expect(placesClient.suggest).toHaveBeenCalledWith({
      query: "Rome",
      sessionToken: "5f0d88d9-7955-4680-9fbc-baad1fb5890c",
      languageCode: "en",
    });
  });

  it("resolves a selected suggestion with the same session", async () => {
    const response = await request(resolveLocationEndpoint, "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId: resolvedLocation.placeId,
        sessionToken: "5f0d88d9-7955-4680-9fbc-baad1fb5890c",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ location: resolvedLocation });
    expect(placesClient.resolve).toHaveBeenCalledWith(
      resolvedLocation.placeId,
      "5f0d88d9-7955-4680-9fbc-baad1fb5890c",
    );
  });

  it("rejects short searches before calling Google", async () => {
    const response = await request(
      `${locationSuggestionsEndpoint}?q=R&sessionToken=5f0d88d9-7955-4680-9fbc-baad1fb5890c`,
      "user_owner",
    );

    expect(response.status).toBe(422);
  });
});
