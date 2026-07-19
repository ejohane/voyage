import type { LocationKind, LocationSuggestion, TripStopLocation } from "@voyage/contracts";

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

type SuggestInput = {
  query: string;
  sessionToken: string;
  languageCode?: string;
};

export type PlacesClient = {
  suggest(input: SuggestInput): Promise<LocationSuggestion[]>;
  resolve(placeId: string, sessionToken: string): Promise<TripStopLocation>;
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
  };
}
