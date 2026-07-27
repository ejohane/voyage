import { env } from "cloudflare:test";
import { type AirportListResponse, airportsEndpoint } from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
});

function request(path: string, userId?: string) {
  const headers = new Headers();
  if (userId) headers.set("x-test-user", userId);
  return testApp.request(`https://voyage.test${path}`, { headers }, env);
}

describe("airport catalog API", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM airports").run();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO airports (
          id, ident, iata_code, icao_code, type, name, municipality, iso_country, iso_region,
          latitude, longitude, keywords, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        3830,
        "KORD",
        "ORD",
        "KORD",
        "large_airport",
        "Chicago O'Hare International Airport",
        "Chicago",
        "US",
        "US-IL",
        41.9786,
        -87.9048,
        "O'Hare",
        "ord kord chicago o'hare international airport us us-il",
      ),
      env.DB.prepare(
        `INSERT INTO airports (
          id, ident, iata_code, icao_code, type, name, municipality, iso_country, iso_region,
          latitude, longitude, keywords, search_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        4081,
        "KMDW",
        "MDW",
        "KMDW",
        "large_airport",
        "Chicago Midway International Airport",
        "Chicago",
        "US",
        "US-IL",
        41.7868,
        -87.7522,
        null,
        "mdw kmdw chicago midway international airport us us-il",
      ),
    ]);
  });

  it("requires authentication", async () => {
    expect((await request(`${airportsEndpoint}?q=ORD`)).status).toBe(401);
  });

  it("finds real airports by code, city, and name with exact coordinates", async () => {
    const codeResponse = await request(`${airportsEndpoint}?q=ORD`, "user_owner");
    const code = await codeResponse.json<AirportListResponse>();
    const cityResponse = await request(`${airportsEndpoint}?q=Chicago`, "user_owner");
    const city = await cityResponse.json<AirportListResponse>();

    expect(codeResponse.status).toBe(200);
    expect(code.airports[0]).toMatchObject({
      iataCode: "ORD",
      municipality: "Chicago",
      latitude: 41.9786,
      longitude: -87.9048,
    });
    expect(city.airports.map((airport) => airport.iataCode)).toEqual(["MDW", "ORD"]);
  });

  it("rejects an empty query", async () => {
    expect((await request(`${airportsEndpoint}?q=`, "user_owner")).status).toBe(422);
  });
});
