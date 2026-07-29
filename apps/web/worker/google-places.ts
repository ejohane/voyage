import type {
  LocationKind,
  LocationSuggestion,
  StayProperty,
  StayPropertyRef,
  TripStopLocation,
} from "@voyage/contracts";

type GoogleText = { text?: string };

type GooglePlacePrediction = {
  placeId?: string;
  text?: GoogleText;
  structuredFormat?: {
    mainText?: GoogleText;
    secondaryText?: GoogleText;
  };
  types?: string[];
};

type GoogleAutocompleteResponse = {
  suggestions?: { placePrediction?: GooglePlacePrediction }[];
};

type GooglePlaceDetailsResponse = {
  id?: string;
};

type GoogleAuthorAttribution = {
  displayName?: string;
  uri?: string;
};

type GooglePhoto = {
  name?: string;
  authorAttributions?: GoogleAuthorAttribution[];
  googleMapsUri?: string;
};

type GoogleStayPlace = {
  id?: string;
  displayName?: GoogleText;
  formattedAddress?: string;
  primaryType?: string;
  primaryTypeDisplayName?: GoogleText;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  photos?: GooglePhoto[];
};

type GoogleTextSearchResponse = {
  places?: GoogleStayPlace[];
};

type SuggestInput = {
  query: string;
  sessionToken: string;
  languageCode?: string;
};

export type PlacesClient = {
  suggest(input: SuggestInput): Promise<LocationSuggestion[]>;
  resolve(placeId: string, sessionToken: string): Promise<TripStopLocation>;
  matchStay?(propertyName: string, address: string): Promise<StayPropertyRef | null>;
  getStayProperty?(placeId: string): Promise<StayProperty>;
  renderStayPhoto?(placeId: string): Promise<Response>;
};

export class PlacesServiceError extends Error {
  constructor() {
    super("Google Places request failed.");
    this.name = "PlacesServiceError";
  }
}

function locationKind(types: string[]): LocationKind {
  if (types.includes("country")) return "country";
  if (types.some((type) => type.startsWith("administrative_area_level_"))) return "region";
  if (types.some((type) => ["locality", "postal_town"].includes(type))) return "city";
  if (types.some((type) => ["neighborhood", "sublocality"].includes(type))) {
    return "neighborhood";
  }
  if (
    types.some((type) =>
      ["street_address", "premise", "subpremise", "route", "street_number"].includes(type),
    )
  ) {
    return "address";
  }
  return "place";
}

async function readGoogleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new PlacesServiceError();

  try {
    return (await response.json()) as T;
  } catch {
    throw new PlacesServiceError();
  }
}

function normalizedTokens(value: string) {
  return new Set(
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 2),
  );
}

function tokenCoverage(expected: Set<string>, actual: Set<string>) {
  if (expected.size === 0) return 0;
  return [...expected].filter((token) => actual.has(token)).length / expected.size;
}

function isHighConfidenceStayMatch(
  propertyName: string,
  address: string,
  candidate: GoogleStayPlace,
) {
  const expectedName = normalizedTokens(propertyName);
  const actualName = normalizedTokens(candidate.displayName?.text ?? "");
  const expectedAddress = normalizedTokens(address);
  const actualAddress = normalizedTokens(candidate.formattedAddress ?? "");
  const expectedNumbers = [...expectedAddress].filter((token) => /^\d+$/.test(token));
  const numbersAgree =
    expectedNumbers.length === 0 || expectedNumbers.some((token) => actualAddress.has(token));

  return (
    tokenCoverage(expectedName, actualName) >= 0.8 &&
    tokenCoverage(expectedAddress, actualAddress) >= 0.45 &&
    numbersAgree
  );
}

function mapStayProperty(place: GoogleStayPlace): StayProperty {
  const placeId = place.id?.trim();
  const displayName = place.displayName?.text?.trim();
  const formattedAddress = place.formattedAddress?.trim();
  const googleMapsUri = place.googleMapsUri?.trim();
  if (!placeId || !displayName || !formattedAddress || !googleMapsUri) {
    throw new PlacesServiceError();
  }

  const photo = place.photos?.find((candidate) => candidate.name);
  const attribution = photo?.authorAttributions?.[0];
  return {
    provider: "google",
    placeId,
    displayName,
    formattedAddress,
    primaryType: place.primaryType?.trim() || null,
    primaryTypeDisplayName: place.primaryTypeDisplayName?.text?.trim() || null,
    websiteUri: place.websiteUri?.trim() || null,
    nationalPhoneNumber: place.nationalPhoneNumber?.trim() || null,
    internationalPhoneNumber: place.internationalPhoneNumber?.trim() || null,
    rating: typeof place.rating === "number" ? place.rating : null,
    userRatingCount: Number.isInteger(place.userRatingCount)
      ? (place.userRatingCount ?? null)
      : null,
    googleMapsUri,
    hasPhoto: Boolean(photo?.name),
    photo: photo?.name
      ? {
          attributionDisplayName: attribution?.displayName?.trim() || null,
          attributionUri: attribution?.uri?.trim() || null,
          googleMapsUri: photo.googleMapsUri?.trim() || googleMapsUri,
        }
      : null,
  };
}

export function createGooglePlacesClient(
  apiKey: string,
  fetchRequest: typeof fetch = fetch,
): PlacesClient {
  return {
    async suggest({ query, sessionToken, languageCode }) {
      const response = await fetchRequest("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": [
            "suggestions.placePrediction.placeId",
            "suggestions.placePrediction.text.text",
            "suggestions.placePrediction.structuredFormat.mainText.text",
            "suggestions.placePrediction.structuredFormat.secondaryText.text",
            "suggestions.placePrediction.types",
          ].join(","),
        },
        body: JSON.stringify({
          input: query,
          sessionToken,
          ...(languageCode ? { languageCode } : {}),
        }),
      });
      const payload = await readGoogleResponse<GoogleAutocompleteResponse>(response);

      return (payload.suggestions ?? [])
        .flatMap((suggestion): LocationSuggestion[] => {
          const prediction = suggestion.placePrediction;
          const placeId = prediction?.placeId?.trim();
          const label = prediction?.text?.text?.trim().slice(0, 160);
          const primaryText = prediction?.structuredFormat?.mainText?.text?.trim().slice(0, 160);

          if (!prediction || !placeId || !label || !primaryText) return [];

          const types = (prediction.types ?? []).filter((type) => type.length <= 80).slice(0, 20);
          return [
            {
              placeId,
              label,
              primaryText,
              secondaryText:
                prediction.structuredFormat?.secondaryText?.text?.trim().slice(0, 300) || null,
              types,
              kind: locationKind(types),
            },
          ];
        })
        .slice(0, 5);
    },

    async resolve(placeId, sessionToken) {
      const response = await fetchRequest(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "id",
          },
        },
      );
      const payload = await readGoogleResponse<GooglePlaceDetailsResponse>(response);
      const resolvedPlaceId = payload.id?.trim();

      if (!resolvedPlaceId) throw new PlacesServiceError();

      return {
        provider: "google",
        placeId: resolvedPlaceId,
      };
    },

    async matchStay(propertyName, address) {
      const response = await fetchRequest("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({ textQuery: `${propertyName} ${address}`, maxResultCount: 3 }),
      });
      const payload = await readGoogleResponse<GoogleTextSearchResponse>(response);
      const matches = (payload.places ?? []).filter(
        (candidate) => candidate.id && isHighConfidenceStayMatch(propertyName, address, candidate),
      );
      return matches.length === 1
        ? { provider: "google", placeId: matches[0].id?.trim() ?? "" }
        : null;
    },

    async getStayProperty(placeId) {
      const response = await fetchRequest(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": [
              "id",
              "displayName",
              "formattedAddress",
              "primaryType",
              "primaryTypeDisplayName",
              "websiteUri",
              "nationalPhoneNumber",
              "internationalPhoneNumber",
              "rating",
              "userRatingCount",
              "googleMapsUri",
              "photos",
            ].join(","),
          },
        },
      );
      return mapStayProperty(await readGoogleResponse<GoogleStayPlace>(response));
    },

    async renderStayPhoto(placeId) {
      const detailsResponse = await fetchRequest(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "photos",
          },
        },
      );
      const place = await readGoogleResponse<GoogleStayPlace>(detailsResponse);
      const photoName = place.photos?.find((photo) => photo.name)?.name;
      if (!photoName) throw new PlacesServiceError();
      const photoResponse = await fetchRequest(
        `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=1200`,
        { headers: { "X-Goog-Api-Key": apiKey, Accept: "image/*" } },
      );
      if (!photoResponse.ok || !photoResponse.headers.get("Content-Type")?.startsWith("image/")) {
        throw new PlacesServiceError();
      }
      return photoResponse;
    },
  };
}
