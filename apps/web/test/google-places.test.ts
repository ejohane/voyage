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
      label: "Rome, Metropolitan City of Rome Capital, Italy",
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

  it("matches a stay only when its name and address agree", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        places: [
          {
            id: "hotel-ostuni",
            displayName: { text: "Dama Bianca Boutique Hotel Ostuni" },
            formattedAddress: "Via Giordano Bruno 13, 72017 Ostuni BR, Italy",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const client = createGooglePlacesClient("test-key", fetchRequest);

    await expect(
      client.matchStay?.(
        "Dama Bianca Boutique Hotel Ostuni",
        "Via Giordano Bruno 13, 72017 Ostuni, Italy",
      ),
    ).resolves.toEqual({ provider: "google", placeId: "hotel-ostuni" });
    await expect(client.matchStay?.("Different Hotel", "1 Main St, Rome")).resolves.toBeNull();
    expect(fetchRequest).toHaveBeenCalledWith(
      "https://places.googleapis.com/v1/places:searchText",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        }),
      }),
    );
  });

  it("maps dynamic property details without exposing photo resource names", async () => {
    const fetchRequest = vi.fn(async () =>
      Response.json({
        id: "hotel-ostuni",
        displayName: { text: "Dama Bianca Boutique Hotel Ostuni" },
        formattedAddress: "Via Giordano Bruno 13, Ostuni, Italy",
        primaryType: "hotel",
        primaryTypeDisplayName: { text: "Hotel" },
        websiteUri: "https://damabianca.example/",
        internationalPhoneNumber: "+39 0831 123456",
        rating: 4.7,
        userRatingCount: 132,
        googleMapsUri: "https://maps.google.com/?cid=123",
        photos: [
          {
            name: "places/hotel-ostuni/photos/hero",
            googleMapsUri: "https://maps.google.com/photo/hero",
            authorAttributions: [
              { displayName: "Dama Bianca", uri: "https://maps.google.com/author" },
            ],
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const property = await createGooglePlacesClient("test-key", fetchRequest).getStayProperty?.(
      "hotel-ostuni",
    );

    expect(property).toEqual({
      provider: "google",
      placeId: "hotel-ostuni",
      displayName: "Dama Bianca Boutique Hotel Ostuni",
      formattedAddress: "Via Giordano Bruno 13, Ostuni, Italy",
      primaryType: "hotel",
      primaryTypeDisplayName: "Hotel",
      websiteUri: "https://damabianca.example/",
      nationalPhoneNumber: null,
      internationalPhoneNumber: "+39 0831 123456",
      rating: 4.7,
      userRatingCount: 132,
      googleMapsUri: "https://maps.google.com/?cid=123",
      hasPhoto: true,
      photo: {
        attributionDisplayName: "Dama Bianca",
        attributionUri: "https://maps.google.com/author",
        googleMapsUri: "https://maps.google.com/photo/hero",
      },
    });
    expect(JSON.stringify(property)).not.toContain("photos/hero");
    expect(fetchRequest).toHaveBeenCalledWith(
      expect.stringContaining("places/hotel-ostuni"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Goog-FieldMask": expect.not.stringContaining("*"),
        }),
      }),
    );
  });

  it("proxies one live photo with no persistent cache", async () => {
    const fetchRequest = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("places/hotel-ostuni")) {
        return Response.json({ photos: [{ name: "places/hotel-ostuni/photos/hero" }] });
      }
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/jpeg" },
      });
    }) as unknown as typeof fetch;
    const response = await createGooglePlacesClient("test-key", fetchRequest).renderStayPhoto?.(
      "hotel-ostuni",
    );

    expect(response?.headers.get("Content-Type")).toBe("image/jpeg");
    expect(fetchRequest).toHaveBeenLastCalledWith(
      "https://places.googleapis.com/v1/places/hotel-ostuni/photos/hero/media?maxWidthPx=1200",
      expect.objectContaining({ headers: expect.objectContaining({ Accept: "image/*" }) }),
    );
  });
});
