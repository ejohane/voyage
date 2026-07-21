import type { Trip } from "@voyage/contracts";

const maximumGeocodedLocations = 15;

const mapStyles = [
  "feature:all|element:labels.icon|visibility:off",
  "feature:poi|visibility:off",
  "feature:transit|visibility:off",
  "feature:administrative|element:geometry.stroke|color:0xc9c5ba",
  "feature:landscape|element:geometry|color:0xf2f0e9",
  "feature:road|element:geometry|color:0xffffff",
  "feature:road|element:geometry.stroke|color:0xdedbd2",
  "feature:water|element:geometry|color:0xcbdbe0",
  "feature:water|element:labels.text.fill|color:0x6e858b",
];

function visibleStops(trip: Pick<Trip, "stops">) {
  if (trip.stops.length <= maximumGeocodedLocations) return trip.stops;

  const lastStop = trip.stops.at(-1);
  return lastStop ? [...trip.stops.slice(0, maximumGeocodedLocations - 1), lastStop] : [];
}

export function buildStaticMapUrl(trip: Pick<Trip, "stops">, apiKey: string) {
  const parameters = new URLSearchParams({
    size: "640x320",
    scale: "2",
    format: "png32",
    maptype: "roadmap",
    language: "en",
    key: apiKey,
  });

  for (const style of mapStyles) parameters.append("style", style);
  visibleStops(trip).forEach((stop, index) => {
    const label = index < 9 ? `|label:${index + 1}` : "";
    parameters.append("markers", `size:small|color:0x242724${label}|${stop.name}`);
  });

  return `https://maps.googleapis.com/maps/api/staticmap?${parameters.toString()}`;
}

export type StaticMapsClient = {
  render(trip: Pick<Trip, "stops">): Promise<Response>;
};

export class StaticMapsServiceError extends Error {
  constructor() {
    super("Google Static Maps request failed.");
    this.name = "StaticMapsServiceError";
  }
}

export function createGoogleStaticMapsClient(
  apiKey: string,
  fetchRequest: typeof fetch = fetch,
): StaticMapsClient {
  return {
    async render(trip) {
      const response = await fetchRequest(buildStaticMapUrl(trip, apiKey), {
        headers: { Accept: "image/png" },
      });

      if (!response.ok || !response.headers.get("Content-Type")?.startsWith("image/")) {
        throw new StaticMapsServiceError();
      }

      return response;
    },
  };
}
