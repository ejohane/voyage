import { env } from "cloudflare:test";
import {
  createTravelInputSchema,
  type GmailConnection,
  type GmailConnectResponse,
  type GmailImportCandidate,
  type GmailImportResponse,
  type GmailScanResponse,
  gmailConnectEndpoint,
  gmailIntegrationEndpoint,
  type StayListResponse,
  type TravelListResponse,
  type Trip,
  type TripResponse,
  tripGmailImportEndpoint,
  tripGmailScanEndpoint,
  tripStaysEndpoint,
  tripsEndpoint,
  tripTravelEndpoint,
} from "@voyage/contracts";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../worker";
import { type GmailMessage, gmailSearchWindows, listTripMessages } from "../worker/gmail-api";
import { consolidateGmailCandidates, relevantGmailCandidates } from "../worker/gmail-candidates";
import { extractGmailCandidates } from "../worker/gmail-extractor";
import { importGmailCandidate } from "../worker/gmail-import-repository";
import { findItineraryGaps, followUpGmailSearchQueries } from "../worker/gmail-query-planner";

function encodeBody(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function oneStop(name: string, arrivalDate: string | null, departureDate: string | null) {
  return [
    {
      id: "00000000-0000-4000-8000-000000000001",
      name,
      position: 0,
      arrivalDate,
      departureDate,
      location: null,
    },
  ];
}

const flightMarkup = `
  <html><body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "FlightReservation",
        "reservationNumber": "VOY123",
        "url": "https://airline.example/manage/VOY123",
        "reservationFor": {
          "@type": "Flight",
          "flightNumber": "942",
          "airline": { "@type": "Airline", "name": "United Airlines" },
          "departureAirport": { "@type": "Airport", "iataCode": "ORD", "name": "Chicago O'Hare" },
          "arrivalAirport": { "@type": "Airport", "iataCode": "LIS", "name": "Lisbon" },
          "departureTime": "2026-10-04T18:30:00-05:00",
          "arrivalTime": "2026-10-05T08:10:00+01:00"
        }
      }
    </script>
    Your flight is confirmed.
  </body></html>`;

const stayMarkup = `
  <html><body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "LodgingReservation",
        "reservationNumber": "HOTEL456",
        "url": "https://hotel.example/reservations/HOTEL456",
        "checkinTime": "2026-10-05T15:00:00+01:00",
        "checkoutTime": "2026-10-12T11:00:00+01:00",
        "reservationFor": {
          "@type": "LodgingBusiness",
          "name": "Memmo Alfama",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "Travessa das Merceeiras 27",
            "addressLocality": "Lisbon",
            "addressCountry": "Portugal"
          }
        }
      }
    </script>
    Your stay is confirmed.
  </body></html>`;

const deltaCheckInMarkup = `
  <html><body>
    <div>Confirmation Number</div>
    <div><a href="https://www.delta.com/mytrips/findPnr.action?confirmationNumber=F9BPRK">F9BPRK</a></div>
    <div>Your flight on Thursday, January 29 is available for check-in.</div>
    <table>
      <tr><td>Thursday</td></tr>
      <tr><td>January 29</td></tr>
      <tr><td>DEPART</td><td>ARRIVE</td><td>SEAT</td></tr>
      <tr><td>4964</td></tr>
      <tr><td>Operated by Endeavor Air DBA Delta Connection</td></tr>
      <tr><td>LaGuardia, New York</td><td>03:24 pm</td></tr>
      <tr><td>Milwaukee, Wisconsin</td><td>05:05 pm</td></tr>
    </table>
  </body></html>`;

const bookingConfirmationMarkup = `
  <html><body>
    <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "LodgingReservation",
        "reservationNumber": "6293011329",
        "checkinTime": "2026-08-31T14:00:00+02:00",
        "checkoutTime": "2026-09-01T10:00:00+02:00",
        "reservationFor": {
          "@type": "LodgingBusiness",
          "name": "noreply@booking.com",
          "address": "0from August 17, 2026 12:00 AM:"
        }
      }
    </script>
    <h1>Thanks, Kathryn! Your booking in Ostuni is confirmed.</h1>
    <strong>Dama Bianca Boutique Hotel Ostuni</strong> is expecting you on <strong>Mon, Aug 31</strong>
    <div>Reservation details</div>
    <div>Check-in Monday, August 31, 2026</div>
    <div>Check-out Tuesday, September 1, 2026</div>
    <div>Location</div>
    <div>Via Giordano Bruno 13, 72017 Ostuni, Italy</div>
    <a href="https://secure.booking.com/confirmation.en-us.html?bn=6293011329">Manage booking</a>
  </body></html>`;

const chaseFlightMarkup = `
  <html><body>
    <h2>Flight</h2>
    <p>Confirmed</p>
    <p>Sun, Aug 30, 2026 - Fri, Sep 11, 2026</p>
    <p>Airline confirmation: BBJBA2</p>
    <div>Chicago (ORD)</div><img alt="to"><div>Bari (BRI)</div>
    <div>Olbia (OLB)</div><img alt="to"><div>Chicago (ORD)</div>
    <p>Flight 1:</p>
    <p>Sun, Aug 30, 2026</p>
    <div>03:35 pm</div><div>ORD</div><img alt="to"><div>12:15 pm</div><div>BRI</div>
    <div>Next day arrival</div>
    <p>Lufthansa German Airlines</p>
    <p>LH 437</p>
    <p>LH 1896</p>
    <p>Fare:</p>
    <p>Flight 2:</p>
    <p>Fri, Sep 11, 2026</p>
    <div>12:00 pm</div><div>OLB</div><img alt="to"><div>06:15 pm</div><div>ORD</div>
    <p>Lufthansa German Airlines</p>
    <p>LH 1913</p>
    <p>LH 434</p>
    <p>Fare:</p>
    <p>cxLoyalty</p>
    <p>77 N. Water Street</p>
    <p>Norwalk, CT 06853</p>
    <a href="https://secure.chase.com/travel/TRIP_DETAILS/1012650428">See trip</a>
  </body></html>`;

const bookingFlightMarkup = `
  <html><body>
    <h1>Your Olbia flight booking</h1>
    <p>Here is the essential information about your upcoming Bari – Olbia flights.</p>
    <h2>Flight to Olbia</h2>
    <div>Bari (BRI) to Olbia (OLB)</div>
    <div>Sat, Sep 5 · 4:05 PM - Sat, Sep 5 · 5:30 PM</div>
    <div>Direct · 1h 25m · Economy</div>
    <div>Volotea · V71608</div>
    <div>Booking reference: P6IIWV</div>
    <a href="https://flights.booking.com/booking-details/P6IIWV">Manage booking</a>
  </body></html>`;

const flightScheduleChangeMarkup = `
  <html><body>
    <h1>Important! Kathryn, your upcoming flight has a time change.</h1>
    <h2>Booking no. P6IIWV</h2>
    <p>Due to operational reasons, we have been forced to reschedule your flight.</p>
    <h2>05 Sep, 2026:</h2>
    <div>New time</div>
    <div><strong>12.50h</strong> <span style="text-decoration: line-through">16.05h</span></div>
    <div><strong>Bari</strong> Departure</div>
    <div>V71608</div>
    <div><span style="text-decoration: line-through">17.30h</span> <strong>14.15h</strong></div>
    <div><strong>Olbia</strong> Arrival</div>
    <a href="https://flights.booking.com/booking-details/P6IIWV">Manage your booking</a>
    <p>©2026 Volotea</p>
  </body></html>`;

const airbnbStayMarkup = `
  <html><body>
    <h1>Reservation for trullo lantane by Pugliadamre, Sep 1 – 5</h1>
    <p>For your protection and safety, always communicate through Airbnb.</p>
    <p>Booking confirmation trullo lantane by Pugliadamre</p>
    <p>trullo lantane by Pugliadamre</p>
    <p>Trullo - Entire home/apt hosted by Elisa</p>
    <p>Check-in Tuesday September 1, 2026 4:00 PM</p>
    <p>Checkout Saturday September 5, 2026 10:00 AM</p>
    <a href="https://www.airbnb.com/rooms/988917946509447401">View listing</a>
    <p>Airbnb, Inc., 888 Brannan St., San Francisco, CA 94103, USA</p>
  </body></html>`;

const voiStayMarkup = `
  <html><body>
    <h1>Your reservation at VOI Colonna Village is confirmed!</h1>
    <p>VOIhotels - 20351OJ17435</p>
    <p>Check-in: Saturday, September 05, 2026</p>
    <p>Check-out: Friday, September 11, 2026</p>
    <p>Transfer available for a fee from/to Olbia, Golfo Aranci, and Porto Cervo.</p>
    <a href="https://booking.voihotels.com/reservation/20351OJ17435">Manage reservation</a>
  </body></html>`;

const googleCalls: string[] = [];
const googleFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  googleCalls.push(`${request.method} ${url.pathname}`);

  if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
    const body = await request.formData();
    if (body.get("grant_type") === "authorization_code") {
      return Response.json({
        access_token: "initial-access-token",
        refresh_token: "super-secret-refresh-token",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        token_type: "Bearer",
      });
    }
    return Response.json({
      access_token: "refreshed-access-token",
      expires_in: 3600,
      token_type: "Bearer",
    });
  }

  if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/revoke") {
    return new Response(null, { status: 200 });
  }

  if (url.pathname.endsWith("/profile")) {
    return Response.json({ emailAddress: "traveler@example.com" });
  }

  if (url.pathname.endsWith("/messages")) {
    return Response.json({
      messages: [
        { id: "message-flight", threadId: "thread-flight" },
        { id: "message-stay", threadId: "thread-stay" },
        { id: "message-stay-update", threadId: "thread-stay-update" },
      ],
    });
  }

  if (url.pathname.endsWith("/messages/message-flight")) {
    return Response.json({
      id: "message-flight",
      threadId: "thread-flight",
      internalDate: String(Date.UTC(2026, 6, 1)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Your flight confirmation" },
          { name: "From", value: "United Airlines <reservations@example.com>" },
        ],
        body: { data: encodeBody(flightMarkup) },
      },
    });
  }

  if (url.pathname.endsWith("/messages/message-stay/attachments/attachment-stay")) {
    return Response.json({ data: encodeBody(stayMarkup) });
  }

  if (url.pathname.endsWith("/messages/message-stay")) {
    return Response.json({
      id: "message-stay",
      threadId: "thread-stay",
      internalDate: String(Date.UTC(2026, 6, 2)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Your stay at Memmo Alfama" },
          { name: "From", value: "Memmo Alfama <reservations@example.com>" },
        ],
        body: { attachmentId: "attachment-stay" },
      },
    });
  }

  if (url.pathname.endsWith("/messages/message-stay-update")) {
    return Response.json({
      id: "message-stay-update",
      threadId: "thread-stay-update",
      internalDate: String(Date.UTC(2026, 6, 3)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "An update for your stay at Memmo Alfama" },
          { name: "From", value: "Memmo Alfama <reservations@example.com>" },
        ],
        body: { data: encodeBody(stayMarkup) },
      },
    });
  }

  return new Response("Unexpected Google request", { status: 500 });
};

const testApp = createApp({
  authenticateRequest: async (request) => request.headers.get("x-test-user"),
  gmailFetch: googleFetch,
});

async function request(
  path: string,
  userId?: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
) {
  const headers = new Headers(init.headers);
  if (userId) headers.set("x-test-user", userId);
  return testApp.request(`https://voyage.test${path}`, { ...init, headers }, env);
}

async function createTrip() {
  const response = await request(tripsEndpoint, "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Autumn in Lisbon",
      stops: [
        {
          name: "Lisbon, Portugal",
          arrivalDate: "2026-10-04",
          departureDate: "2026-10-12",
        },
      ],
    }),
  });
  return response.json<TripResponse>();
}

async function connectGmail(returnTo = "/trips") {
  const connectResponse = await request(gmailConnectEndpoint(), "user_owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnTo }),
  });
  const { authorizationUrl } = await connectResponse.json<GmailConnectResponse>();
  const authorization = new URL(authorizationUrl);
  const state = authorization.searchParams.get("state");
  const callbackResponse = await request(
    `/api/integrations/gmail/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`,
  );
  return { connectResponse, authorization, callbackResponse, state };
}

describe("Gmail import", () => {
  beforeEach(async () => {
    googleCalls.length = 0;
    await env.DB.batch([
      env.DB.prepare("DELETE FROM gmail_import_sources"),
      env.DB.prepare("DELETE FROM gmail_oauth_states"),
      env.DB.prepare("DELETE FROM gmail_connections"),
      env.DB.prepare("DELETE FROM travel_segments"),
      env.DB.prepare("DELETE FROM stays"),
      env.DB.prepare("DELETE FROM trip_memberships"),
      env.DB.prepare("DELETE FROM trips"),
    ]);
  });

  it("rejects incomplete heuristic travel data without throwing", () => {
    expect(() =>
      createTravelInputSchema.safeParse({
        type: "flight",
        status: "booked",
        departureLocation: "ORD",
        arrivalLocation: "LIS",
        departureAt: "",
        arrivalAt: null,
        carrier: null,
        referenceNumber: null,
        confirmationNumber: null,
        bookingUrl: null,
        notes: null,
      }),
    ).not.toThrow();

    expect(
      createTravelInputSchema.safeParse({
        type: "flight",
        status: "booked",
        departureLocation: "ORD",
        arrivalLocation: "LIS",
        departureAt: "",
        arrivalAt: null,
        carrier: null,
        referenceNumber: null,
        confirmationNumber: null,
        bookingUrl: null,
        notes: null,
      }).success,
    ).toBe(false);
  });

  it("extracts airline table itineraries with a shared date", () => {
    const message: GmailMessage = {
      id: "message-delta-check-in",
      threadId: "thread-delta-check-in",
      internalDate: String(Date.UTC(2026, 0, 28)),
      payload: {
        mimeType: "multipart/alternative",
        headers: [
          { name: "Subject", value: "It's Time To Check In For Your Flight" },
          { name: "From", value: "Delta Air Lines <DeltaAirLines@t.delta.com>" },
        ],
        parts: [
          {
            mimeType: "text/plain",
            body: {
              data: encodeBody(`
                Confirmation Number
                https://click.t.delta.com/u/?qs=opaque-tracking-link
                F9BPRK
                Thursday
                January 29
                4964
                Operated by Endeavor Air DBA Delta Connection
                LaGuardia, New York
                03:24 pm
                Milwaukee, Wisconsin
                05:05 pm
              `),
            },
          },
          { mimeType: "text/html", body: { data: encodeBody(deltaCheckInMarkup) } },
        ],
      },
    };
    const trip = {
      id: "0877bce9-4b66-470a-b8b1-8a1dc635a0ad",
      name: "Gmail Import Verification",
      stops: oneStop("Upcoming bookings", null, null),
      startDate: null,
      endDate: null,
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;

    expect(extractGmailCandidates(message, trip)).toMatchObject([
      {
        kind: "travel",
        confidence: "medium",
        input: {
          departureLocation: "LaGuardia, New York",
          arrivalLocation: "Milwaukee, Wisconsin",
          departureAt: "2026-01-29T15:24",
          arrivalAt: "2026-01-29T17:05",
          carrier: "Delta Air Lines",
          referenceNumber: "4964",
          confirmationNumber: "F9BPRK",
        },
      },
    ]);
  });

  it("ignores promotional airline emails that resemble itineraries", () => {
    const message: GmailMessage = {
      id: "message-frontier-promotion",
      threadId: "thread-frontier-promotion",
      internalDate: String(Date.UTC(2025, 3, 30)),
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Two Free Checked Bags, 50K Miles, and More!" },
          { name: "From", value: "Frontier Airlines <deals@emails.flyfrontier.com>" },
        ],
        body: {
          data: encodeBody(`
            Confirmation Number BONUS50
            Your flight offer is available April 30 through May 20.
            Earn enough miles for five one-way domestic flights.
          `),
        },
      },
    };
    const trip = {
      id: "trip-promotion-test",
      name: "Upcoming bookings",
      stops: oneStop("Upcoming bookings", null, null),
      startDate: null,
      endDate: null,
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;

    expect(extractGmailCandidates(message, trip)).toEqual([]);
  });

  it("ranks targeted booking matches ahead of a crowded generic search", async () => {
    const trip = {
      id: "trip-deep-search",
      name: "Autumn in Lisbon",
      stops: oneStop("Lisbon, Portugal", "2026-10-04", "2026-10-12"),
      startDate: "2026-10-04",
      endDate: "2026-10-12",
      accessLevel: "owner",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    } satisfies Trip;
    const newer = Array.from({ length: 45 }, (_, index) => ({
      id: `newer-${index}`,
      threadId: `newer-thread-${index}`,
      received: "2026-06-01",
    }));
    const oldBooking = {
      id: "old-flight-confirmation",
      threadId: "old-flight-thread",
      received: "2025-06-01",
    };
    const mailbox = [...newer, oldBooking];
    const searchQueries: string[] = [];

    const pagedFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.pathname.endsWith("/messages")) {
        const query = url.searchParams.get("q") ?? "";
        searchQueries.push(query);
        const after =
          query
            .match(/after:(\d{4})\/(\d{2})\/(\d{2})/)
            ?.slice(1)
            .join("-") ?? "";
        const before =
          query
            .match(/before:(\d{4})\/(\d{2})\/(\d{2})/)
            ?.slice(1)
            .join("-") ?? "";
        const matches = mailbox.filter(
          (message) => message.received > after && message.received < before,
        );
        const pageSize = Number(url.searchParams.get("maxResults") ?? 5);
        if (query.includes("subject:flight")) {
          const targeted = matches.filter((message) => message.id === oldBooking.id);
          return Response.json({
            messages: targeted.map(({ id, threadId }) => ({ id, threadId })),
            resultSizeEstimate: targeted.length,
          });
        }
        if (!query.includes('"confirmation number"')) return Response.json({ messages: [] });
        const page = matches.slice(0, pageSize);
        return Response.json({
          messages: page.map(({ id, threadId }) => ({ id, threadId })),
          nextPageToken: page.length < matches.length ? "more" : undefined,
          resultSizeEstimate: matches.length,
        });
      }

      const id = url.pathname.split("/").at(-1) ?? "";
      const source = mailbox.find((message) => message.id === id);
      if (!source) return new Response("Unknown message", { status: 404 });
      return Response.json({
        id: source.id,
        threadId: source.threadId,
        internalDate: String(Date.parse(`${source.received}T12:00:00.000Z`)),
        payload:
          source.id === oldBooking.id
            ? {
                mimeType: "text/html",
                headers: [
                  { name: "Subject", value: "Your flight confirmation" },
                  { name: "From", value: "United Airlines <reservations@example.com>" },
                ],
                body: { data: encodeBody(flightMarkup) },
              }
            : { mimeType: "text/plain", body: { data: encodeBody("Booking update") } },
      });
    };

    const windows = gmailSearchWindows(trip, new Date("2026-07-18T12:00:00.000Z"));
    const result = await listTripMessages(pagedFetch, "access-token", trip, {
      now: new Date("2026-07-18T12:00:00.000Z"),
      maximum: 80,
      pageSize: 5,
    });
    const extracted = result.messages.flatMap((message) =>
      extractGmailCandidates(message, trip, "traveler@example.com"),
    );

    expect(windows.map((window) => window.start.toISOString().slice(0, 10))).toContain(
      "2025-04-04",
    );
    expect(searchQueries[0]).toContain("after:2024/10/03");
    expect(searchQueries.every((query) => !query.includes("newer_than"))).toBe(true);
    expect(result).toMatchObject({
      rangeStart: "2024-10-04",
      rangeEnd: "2026-07-19",
      windowsSearched: windows.length,
      limitReached: true,
    });
    expect(result.messages.some((message) => message.id === oldBooking.id)).toBe(true);
    expect(extracted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "travel",
          input: expect.objectContaining({ confirmationNumber: "VOY123" }),
        }),
      ]),
    );
  });

  it("filters structured reservations whose travel dates do not match the trip", () => {
    const message: GmailMessage = {
      id: "wrong-trip-flight",
      threadId: "wrong-trip-thread",
      internalDate: String(Date.UTC(2025, 5, 1)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Your flight confirmation" },
          { name: "From", value: "United Airlines <reservations@example.com>" },
        ],
        body: { data: encodeBody(flightMarkup) },
      },
    };
    const unrelatedTrip = {
      id: "trip-unrelated",
      name: "New York weekend",
      stops: oneStop("New York", "2026-11-20", "2026-11-22"),
      startDate: "2026-11-20",
      endDate: "2026-11-22",
      accessLevel: "owner",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    } satisfies Trip;

    expect(
      relevantGmailCandidates(
        extractGmailCandidates(message, unrelatedTrip, "traveler@example.com"),
        unrelatedTrip,
      ),
    ).toEqual([]);
  });

  it("repairs Booking.com fields and consolidates related emails into one stay", () => {
    const trip = {
      id: "trip-booking-test",
      name: "Italy",
      stops: oneStop("Italy", "2026-08-30", "2026-09-11"),
      startDate: "2026-08-30",
      endDate: "2026-09-11",
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;
    const confirmation: GmailMessage = {
      id: "message-booking-confirmation",
      threadId: "thread-booking-confirmation",
      internalDate: String(Date.UTC(2026, 6, 16)),
      payload: {
        mimeType: "text/html",
        headers: [
          {
            name: "Subject",
            value: "🛄 Thanks! Your booking is confirmed at Dama Bianca Boutique Hotel Ostuni",
          },
          { name: "From", value: "noreply@booking.com" },
        ],
        body: { data: encodeBody(bookingConfirmationMarkup) },
      },
    };
    const requestUpdate: GmailMessage = {
      ...confirmation,
      id: "message-booking-request",
      threadId: "thread-booking-request",
      payload: {
        ...confirmation.payload,
        headers: [
          { name: "Subject", value: "Special Request for your Reservation 6293011329" },
          {
            name: "From",
            value:
              "Dama Bianca Boutique Hotel Ostuni through Booking.com <reply@property.booking.com>",
          },
        ],
      },
    };

    const candidates = consolidateGmailCandidates([
      ...extractGmailCandidates(confirmation, trip, "kkoch92@gmail.com"),
      ...extractGmailCandidates(requestUpdate, trip, "kkoch92@gmail.com"),
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      kind: "stay",
      confidence: "high",
      input: {
        propertyName: "Dama Bianca Boutique Hotel Ostuni",
        address: "Via Giordano Bruno 13, 72017 Ostuni, Italy",
        checkInDate: "2026-08-31",
        checkOutDate: "2026-09-01",
        confirmationNumber: "6293011329",
        bookingUrl: "https://secure.booking.com/confirmation.en-us.html?bn=6293011329",
      },
      sources: expect.arrayContaining([
        expect.objectContaining({
          messageId: "message-booking-confirmation",
          messageUrl:
            "https://mail.google.com/mail/?authuser=kkoch92%40gmail.com#inbox/thread-booking-confirmation",
        }),
        expect.objectContaining({ messageId: "message-booking-request" }),
      ]),
    });
  });

  it("extracts Chase round trips as two real flight segments without a footer-address stay", () => {
    const trip = {
      id: "trip-chase-test",
      name: "Italy",
      stops: oneStop("Italy", "2026-08-30", "2026-09-11"),
      startDate: "2026-08-30",
      endDate: "2026-09-11",
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;
    const message: GmailMessage = {
      id: "message-chase-flight",
      threadId: "thread-chase-flight",
      internalDate: String(Date.UTC(2026, 1, 12)),
      payload: {
        mimeType: "text/html",
        headers: [
          {
            name: "Subject",
            value: "URGENT – Your New Flight Schedule for Trip ID: 1012650428",
          },
          { name: "From", value: "Chase Travel <donotreply@chasetravel.com>" },
        ],
        body: { data: encodeBody(chaseFlightMarkup) },
      },
    };

    expect(extractGmailCandidates(message, trip, "kkoch92@gmail.com")).toMatchObject([
      {
        kind: "travel",
        confidence: "high",
        input: {
          departureLocation: "ORD · Chicago",
          arrivalLocation: "BRI · Bari",
          departureAt: "2026-08-30T15:35",
          arrivalAt: "2026-08-31T12:15",
          carrier: "Lufthansa German Airlines",
          referenceNumber: "LH 437 · LH 1896",
          confirmationNumber: "BBJBA2",
        },
      },
      {
        kind: "travel",
        confidence: "high",
        input: {
          departureLocation: "OLB · Olbia",
          arrivalLocation: "ORD · Chicago",
          departureAt: "2026-09-11T12:00",
          arrivalAt: "2026-09-11T18:15",
          carrier: "Lufthansa German Airlines",
          referenceNumber: "LH 1913 · LH 434",
          confirmationNumber: "BBJBA2",
        },
      },
    ]);
  });

  it("finds the Bari to Olbia gap and merges its Booking.com schedule update", () => {
    const trip = {
      id: "trip-olbia-test",
      name: "Italy",
      stops: oneStop("Italy", "2026-08-30", "2026-09-11"),
      startDate: "2026-08-30",
      endDate: "2026-09-11",
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;
    const chaseMessage: GmailMessage = {
      id: "message-chase-italy",
      threadId: "thread-chase-italy",
      internalDate: String(Date.UTC(2026, 1, 12)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Travel Reservation Center Trip ID # 1012650428" },
          { name: "From", value: "Chase Travel <donotreply@chasetravel.com>" },
        ],
        body: { data: encodeBody(chaseFlightMarkup) },
      },
    };
    const confirmationMessage: GmailMessage = {
      id: "message-olbia-confirmation",
      threadId: "thread-olbia-confirmation",
      internalDate: String(Date.UTC(2026, 2, 14)),
      payload: {
        mimeType: "text/html",
        headers: [
          { name: "Subject", value: "Olbia flight booking details" },
          { name: "From", value: "Booking.com <noreply@booking.com>" },
        ],
        body: { data: encodeBody(bookingFlightMarkup) },
      },
    };
    const changeMessage: GmailMessage = {
      id: "message-olbia-change",
      threadId: "thread-olbia-change",
      internalDate: String(Date.UTC(2026, 2, 26)),
      payload: {
        mimeType: "text/html",
        headers: [
          {
            name: "Subject",
            value: "Important! Kathryn, there has been a change to your flights - P6IIWV",
          },
          {
            name: "From",
            value:
              "Gotogate in partnership with Booking.com <no-reply@flightsonbooking.gotogate.support>",
          },
        ],
        body: { data: encodeBody(flightScheduleChangeMarkup) },
      },
    };

    const chase = extractGmailCandidates(chaseMessage, trip, "kkoch92@gmail.com");
    const initialGaps = findItineraryGaps(chase);
    const olbia = consolidateGmailCandidates([
      ...extractGmailCandidates(confirmationMessage, trip, "kkoch92@gmail.com"),
      ...extractGmailCandidates(changeMessage, trip, "kkoch92@gmail.com"),
    ]);
    const followUps = followUpGmailSearchQueries([...chase, ...olbia], initialGaps);

    expect(initialGaps).toEqual([{ from: "BRI · Bari", to: "OLB · Olbia" }]);
    expect(followUps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "reference:p6iiwv", expression: '"P6IIWV"' }),
        expect.objectContaining({ id: "route-gap:0" }),
      ]),
    );
    expect(olbia).toHaveLength(1);
    expect(olbia[0]).toMatchObject({
      kind: "travel",
      confidence: "high",
      eventType: "schedule_change",
      input: {
        departureLocation: "BRI · Bari",
        arrivalLocation: "OLB · Olbia",
        departureAt: "2026-09-05T12:50",
        arrivalAt: "2026-09-05T14:15",
        carrier: "Volotea",
        referenceNumber: "V71608",
        confirmationNumber: "P6IIWV",
      },
      sources: expect.arrayContaining([
        expect.objectContaining({ messageId: "message-olbia-confirmation" }),
        expect.objectContaining({ messageId: "message-olbia-change" }),
      ]),
    });
    expect(findItineraryGaps([...chase, ...olbia])).toEqual([]);
  });

  it("extracts Airbnb and VOI stays from provider confirmations without relying on labels", () => {
    const trip = {
      id: "trip-provider-stays",
      name: "Italy",
      stops: oneStop("Italy", "2026-08-30", "2026-09-11"),
      startDate: "2026-08-30",
      endDate: "2026-09-11",
      accessLevel: "owner",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
    } satisfies Trip;
    const airbnb: GmailMessage = {
      id: "message-airbnb",
      threadId: "thread-airbnb",
      internalDate: String(Date.UTC(2026, 4, 12)),
      payload: {
        mimeType: "text/html",
        headers: [
          {
            name: "Subject",
            value: "RE: Reservation for trullo lantane by Pugliadamre, Sep 1 – 5",
          },
          { name: "From", value: "Airbnb <automated@airbnb.com>" },
        ],
        body: { data: encodeBody(airbnbStayMarkup) },
      },
    };
    const voi: GmailMessage = {
      id: "message-voi",
      threadId: "thread-voi",
      internalDate: String(Date.UTC(2026, 4, 20)),
      payload: {
        mimeType: "text/html",
        headers: [
          {
            name: "Subject",
            value:
              "Booking VOIhotels Website - Your reservation at VOI Colonna Village is confirmed!",
          },
          { name: "From", value: "VOIhotels <booking@voihotels.com>" },
        ],
        body: { data: encodeBody(voiStayMarkup) },
      },
    };

    expect(extractGmailCandidates(airbnb, trip, "kkoch92@gmail.com")).toMatchObject([
      {
        kind: "stay",
        confidence: "medium",
        input: {
          propertyName: "trullo lantane",
          address: "Italy",
          checkInDate: "2026-09-01",
          checkOutDate: "2026-09-05",
          confirmationNumber: null,
        },
      },
    ]);
    expect(extractGmailCandidates(voi, trip, "kkoch92@gmail.com")).toMatchObject([
      {
        kind: "stay",
        confidence: "high",
        input: {
          propertyName: "VOI Colonna Village",
          address: "Golfo Aranci, Sardinia, Italy",
          checkInDate: "2026-09-05",
          checkOutDate: "2026-09-11",
          confirmationNumber: "20351OJ17435",
        },
      },
    ]);
  });

  it("imports both flight legs when a round trip shares one confirmation number", async () => {
    const { trip } = await createTrip();
    const source = {
      threadId: "thread-round-trip",
      subject: "Your round trip is confirmed",
      sender: "Example Air <reservations@example.com>",
      receivedAt: "2025-06-01T12:00:00.000Z",
      messageUrl: "https://mail.google.com/mail/u/0/#inbox/thread-round-trip",
    };
    const candidates = [
      {
        kind: "travel",
        confidence: "high",
        source: {
          ...source,
          key: "round-trip:outbound",
          messageId: "round-trip-outbound",
        },
        input: {
          type: "flight",
          status: "booked",
          departureStopId: null,
          arrivalStopId: null,
          departureLocation: "ORD",
          arrivalLocation: "BRI",
          departureAt: "2026-10-04T15:35",
          arrivalAt: "2026-10-05T12:15",
          carrier: "Example Air",
          referenceNumber: "EA 101",
          confirmationNumber: "SHARED1",
          bookingUrl: null,
          notes: null,
        },
      },
      {
        kind: "travel",
        confidence: "high",
        source: {
          ...source,
          key: "round-trip:return",
          messageId: "round-trip-return",
        },
        input: {
          type: "flight",
          status: "booked",
          departureStopId: null,
          arrivalStopId: null,
          departureLocation: "OLB",
          arrivalLocation: "ORD",
          departureAt: "2026-10-12T12:00",
          arrivalAt: "2026-10-12T18:15",
          carrier: "Example Air",
          referenceNumber: "EA 202",
          confirmationNumber: "SHARED1",
          bookingUrl: null,
          notes: null,
        },
      },
    ] satisfies GmailImportCandidate[];

    const results = [];
    for (const candidate of candidates) {
      results.push(await importGmailCandidate(env.DB, "user_owner", trip.id, candidate));
    }
    const travel = await (
      await request(tripTravelEndpoint(trip.id), "user_owner")
    ).json<TravelListResponse>();

    expect(results.map((result) => result.result)).toEqual(["imported", "imported"]);
    expect(travel.travel).toHaveLength(2);
    expect(travel.travel.map((segment) => segment.departureLocation).sort()).toEqual([
      "OLB",
      "ORD",
    ]);
  });

  it("connects with PKCE, stores an encrypted token, and consumes state once", async () => {
    const { connectResponse, authorization, callbackResponse, state } =
      await connectGmail("/trips/trip-123");
    const statusResponse = await request(gmailIntegrationEndpoint, "user_owner");
    const status = await statusResponse.json<GmailConnection>();
    const stored = await env.DB.prepare(
      "SELECT encrypted_refresh_token FROM gmail_connections WHERE user_id = ?",
    )
      .bind("user_owner")
      .first<{ encrypted_refresh_token: string }>();
    const repeatedCallback = await request(
      `/api/integrations/gmail/callback?code=test-code&state=${encodeURIComponent(state ?? "")}`,
    );

    expect(connectResponse.status).toBe(200);
    expect(authorization.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/gmail.readonly",
    );
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toContain("/trips/trip-123?gmail=connected");
    expect(status).toMatchObject({ connected: true, email: "traveler@example.com" });
    expect(stored?.encrypted_refresh_token).toMatch(/^v1\./);
    expect(stored?.encrypted_refresh_token).not.toContain("super-secret-refresh-token");
    expect(repeatedCallback.headers.get("location")).toContain("/trips?gmail=error");
    expect(googleCalls.filter((call) => call === "POST /token")).toHaveLength(1);
  });

  it("scans, imports approved travel and stays, deduplicates, and disconnects", async () => {
    const { trip } = await createTrip();
    await connectGmail(`/trips/${trip.id}`);

    const scanResponse = await request(tripGmailScanEndpoint(trip.id), "user_owner", {
      method: "POST",
    });
    const scan = await scanResponse.json<GmailScanResponse>();
    const importResponse = await request(tripGmailImportEndpoint(trip.id), "user_owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: scan.candidates }),
    });
    const imported = await importResponse.json<GmailImportResponse>();
    const travel = await (
      await request(tripTravelEndpoint(trip.id), "user_owner")
    ).json<TravelListResponse>();
    const stays = await (
      await request(tripStaysEndpoint(trip.id), "user_owner")
    ).json<StayListResponse>();
    await env.DB.prepare(
      `INSERT INTO gmail_message_processing (
        user_id, trip_id, gmail_message_id, gmail_thread_id, extraction_version,
        candidate_json, rejection_reason, processed_at
      ) VALUES (?, ?, ?, ?, 0, NULL, 'legacy', ?)`,
    )
      .bind("user_owner", trip.id, "legacy-message", "legacy-thread", new Date().toISOString())
      .run();
    const repeatScan = await (
      await request(tripGmailScanEndpoint(trip.id), "user_owner", { method: "POST" })
    ).json<GmailScanResponse>();
    const repeatImport = await (
      await request(tripGmailImportEndpoint(trip.id), "user_owner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: scan.candidates }),
      })
    ).json<GmailImportResponse>();
    const cachedBeforeDisconnect = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM gmail_message_processing WHERE trip_id = ?",
    )
      .bind(trip.id)
      .first<{ count: number }>();
    const disconnectResponse = await request(gmailIntegrationEndpoint, "user_owner", {
      method: "DELETE",
    });
    const disconnected = await (
      await request(gmailIntegrationEndpoint, "user_owner")
    ).json<GmailConnection>();

    expect(scanResponse.status).toBe(200);
    expect(scan.messagesScanned).toBe(3);
    expect(scan.search).toMatchObject({ messagesFetched: 3, messagesReused: 0 });
    expect(scan.candidates.map((candidate) => candidate.kind).sort()).toEqual(["stay", "travel"]);
    expect(scan.candidates.find((candidate) => candidate.kind === "stay")?.sources).toHaveLength(2);
    expect(imported.imported).toHaveLength(2);
    expect(imported.skipped).toHaveLength(0);
    expect(travel.travel[0]).toMatchObject({
      departureLocation: "ORD · Chicago O'Hare",
      arrivalLocation: "LIS · Lisbon",
      confirmationNumber: "VOY123",
    });
    expect(stays.stays[0]).toMatchObject({
      propertyName: "Memmo Alfama",
      confirmationNumber: "HOTEL456",
    });
    expect(
      (
        await env.DB.prepare("SELECT COUNT(*) AS count FROM gmail_import_sources WHERE trip_id = ?")
          .bind(trip.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(3);
    expect(repeatScan).toMatchObject({
      candidates: [],
      alreadyImported: 2,
      search: { messagesFetched: 0, messagesReused: 3 },
    });
    expect(cachedBeforeDisconnect?.count).toBe(3);
    expect(repeatImport.imported).toHaveLength(0);
    expect(repeatImport.skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "already_imported" }),
        expect.objectContaining({ reason: "already_imported" }),
      ]),
    );
    expect(disconnectResponse.status).toBe(204);
    expect(disconnected).toEqual({ connected: false });
    expect(
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM gmail_message_processing WHERE trip_id = ?",
        )
          .bind(trip.id)
          .first<{ count: number }>()
      )?.count,
    ).toBe(0);
    expect(googleCalls).toContain("POST /revoke");
  });

  it("requires authentication and edit access", async () => {
    const { trip } = await createTrip();
    await env.DB.prepare(
      "INSERT INTO trip_memberships (trip_id, user_id, access_level, joined_at) VALUES (?, ?, 'viewer', ?)",
    )
      .bind(trip.id, "user_viewer", new Date().toISOString())
      .run();

    const anonymousConnect = await request(gmailConnectEndpoint(), undefined, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ returnTo: "/trips" }),
    });
    const viewerScan = await request(tripGmailScanEndpoint(trip.id), "user_viewer", {
      method: "POST",
    });

    expect(anonymousConnect.status).toBe(401);
    expect(viewerScan.status).toBe(403);
  });
});
