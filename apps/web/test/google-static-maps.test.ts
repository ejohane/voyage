import { describe, expect, it, vi } from "vitest";
import {
  buildStaticMapUrl,
  createGoogleStaticMapsClient,
  StaticMapsServiceError,
} from "../worker/google-static-maps";

const trip = {
  stops: [
    {
      id: "4d6a7c5f-ff4d-4621-9b74-c3bfcf8d7f01",
      name: "Lisbon, Portugal",
      position: 0,
      arrivalDate: null,
      departureDate: null,
      location: null,
    },
    {
      id: "4d6a7c5f-ff4d-4621-9b74-c3bfcf8d7f02",
      name: "Porto, Portugal",
      position: 1,
      arrivalDate: null,
      departureDate: null,
      location: null,
    },
  ],
};

describe("Google Static Maps client", () => {
  it("builds a neutral, high-density map that frames the trip stops", () => {
    const url = new URL(buildStaticMapUrl(trip, "test-key"));

    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("size")).toBe("640x320");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.getAll("markers")).toEqual([
      "size:small|color:0x242724|label:1|Lisbon, Portugal",
      "size:small|color:0x242724|label:2|Porto, Portugal",
    ]);
    expect(url.searchParams.getAll("style")).toContain(
      "feature:landscape|element:geometry|color:0xf2f0e9",
    );
  });

  it("returns image responses", async () => {
    const fetchRequest = vi.fn(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "image/png" },
        }),
    ) as unknown as typeof fetch;
    const client = createGoogleStaticMapsClient("test-key", fetchRequest);

    const response = await client.render(trip);

    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(fetchRequest).toHaveBeenCalledOnce();
  });

  it("rejects provider errors and non-image responses", async () => {
    const fetchRequest = vi.fn(async () => Response.json({ error: "disabled" }, { status: 403 }));
    const client = createGoogleStaticMapsClient(
      "test-key",
      fetchRequest as unknown as typeof fetch,
    );

    await expect(client.render(trip)).rejects.toBeInstanceOf(StaticMapsServiceError);
  });
});
