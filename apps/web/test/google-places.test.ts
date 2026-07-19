import { describe, expect, it, vi } from "vitest";
import { createGooglePlacesClient } from "../worker/google-places";

describe("Google Places client", () => {
  it("maps countries, cities, and addresses into provider-neutral suggestions", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        suggestions: [
          {
            placePrediction: {
              placeId: "country-it",
              text: { text: "Italy" },
              structuredFormat: { mainText: { text: "Italy" } },
              types: ["country", "political", "geocode"],
            },
          },
          {
            placePrediction: {
              placeId: "city-rome",
              text: { text: "Rome, Metropolitan City of Rome Capital, Italy" },
              structuredFormat: {
                mainText: { text: "Rome" },
                secondaryText: { text: "Metropolitan City of Rome Capital, Italy" },
              },
              types: ["locality", "political", "geocode"],
            },
          },
          {
            placePrediction: {
              placeId: "address-rome",
              text: { text: "Via del Corso 18, Rome, Italy" },
              structuredFormat: {
                mainText: { text: "Via del Corso 18" },
                secondaryText: { text: "Rome, Italy" },
              },
              types: ["street_address", "geocode"],
            },
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const client = createGooglePlacesClient("test-key", fetchRequest);
    const suggestions = await client.suggest({
      query: "Italy",
      sessionToken: "5f0d88d9-7955-4680-9fbc-baad1fb5890c",
      languageCode: "en",
    });

    expect(suggestions.map((suggestion) => suggestion.kind)).toEqual([
      "country",
      "city",
      "address",
    ]);
    expect(suggestions[1]).toMatchObject({
      primaryText: "Rome",
      secondaryText: "Metropolitan City of Rome Capital, Italy",
    });
    expect(fetchRequest).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:autocomplete",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("resolves a selected suggestion to its durable place id", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        id: "city-rome",
      }),
    ) as unknown as typeof fetch;
    const client = createGooglePlacesClient("test-key", fetchRequest);
    const location = await client.resolve("city-rome", "5f0d88d9-7955-4680-9fbc-baad1fb5890c");

    expect(location).toEqual({
      provider: "google",
      placeId: "city-rome",
    });
    expect(fetchRequest).toHaveBeenCalledWith(
      expect.stringContaining("places/city-rome?sessionToken="),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Goog-FieldMask": "id" }),
      }),
    );
  });
});
