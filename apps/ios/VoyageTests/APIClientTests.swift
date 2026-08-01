import Foundation
import Testing

@testable import Voyage

struct APIClientTests {
  private let baseURL = URL(string: "https://voyage.example/base")!
  private let tripID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
  private let planID = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!

  @Test("GET sends required headers and canonicalizes a weak response ETag")
  func getHeadersAndModifiedResponse() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(
        statusCode: 200,
        data: try TestFixtures.data(named: "trip-list"),
        entityTag: #"W/"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb""#,
        requestID: "request-list"
      )
    ])
    let client = makeClient(transport: transport)

    let result = try await client.listTrips(ifNoneMatch: #""prior-revision""#)
    guard case .modified(let index, let metadata) = result else {
      Issue.record("Expected a modified trip index")
      return
    }
    #expect(index.trips.first?.name == "Autumn in Lisbon")
    #expect(metadata.entityTag == #""bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb""#)
    #expect(metadata.requestID == "request-list")

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "GET")
    #expect(request.url?.absoluteString == "https://voyage.example/base/api/v1/trips")
    #expect(request.value(forHTTPHeaderField: "Authorization") == "Bearer token-test")
    #expect(request.value(forHTTPHeaderField: "Accept") == "application/json")
    #expect(request.value(forHTTPHeaderField: "X-Voyage-API-Version") == "1")
    #expect(request.value(forHTTPHeaderField: "If-None-Match") == #""prior-revision""#)
    #expect(UUID(uuidString: request.value(forHTTPHeaderField: "X-Request-ID") ?? "") != nil)
  }

  @Test("GET preserves 304 response metadata without decoding a body")
  func getNotModified() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 304, entityTag: #""current-revision""#, requestID: "request-304")
    ])
    let client = makeClient(transport: transport)

    let result = try await client.workspace(tripID: tripID, ifNoneMatch: #""current-revision""#)
    guard case .notModified(let metadata) = result else {
      Issue.record("Expected not modified")
      return
    }
    #expect(metadata.entityTag == #""current-revision""#)
    #expect(metadata.requestID == "request-304")
  }

  @Test("GET maps structured API errors with fields, revision, and request ID")
  func getErrorMapping() async {
    let data = Data(
      #"{"error":{"code":"validation_failed","message":"Check the dates","fieldErrors":{"startDate":["Must precede endDate"]},"currentRevision":7}}"#
        .utf8
    )
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 422, data: data, requestID: "request-error")
    ])
    let client = makeClient(transport: transport)

    await #expect(throws: APIError.self) {
      try await client.listTrips(ifNoneMatch: nil)
    }

    do {
      _ = try await makeClient(
        transport: MockHTTPTransport(stubs: [
          .v1(statusCode: 422, data: data, requestID: "request-error")
        ])
      ).listTrips(ifNoneMatch: nil)
      Issue.record("Expected a structured server error")
    } catch let error as APIError {
      #expect(
        error
          == .server(
            status: 422,
            code: "validation_failed",
            message: "Check the dates",
            fieldErrors: ["startDate": ["Must precede endDate"]],
            currentRevision: 7,
            requestID: "request-error"
          )
      )
    } catch {
      Issue.record("Unexpected error: \(error)")
    }
  }

  @Test("A 401 forces a fresh token and retries the same GET exactly once")
  func unauthorizedGETRefreshesTokenOnce() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 401, requestID: "request-initial"),
      .v1(
        statusCode: 200,
        data: try TestFixtures.data(named: "trip-list"),
        entityTag: #""bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb""#,
        requestID: "request-retry"
      ),
    ])
    let tokens = RecordingAuthTokenSource()
    let client = makeClient(
      transport: transport,
      tokenProvider: AuthTokenProvider { forceRefresh in
        await tokens.token(forceRefresh: forceRefresh)
      }
    )

    _ = try await client.listTrips(ifNoneMatch: #""prior-revision""#)

    #expect(await tokens.refreshRequests == [false, true])
    #expect(await transport.requestCount == 2)
    let initialRequest = await transport.request(at: 0)
    let retryRequest = await transport.request(at: 1)
    #expect(initialRequest.value(forHTTPHeaderField: "Authorization") == "Bearer token-cached")
    #expect(retryRequest.value(forHTTPHeaderField: "Authorization") == "Bearer token-refreshed")
    #expect(
      retryRequest.value(forHTTPHeaderField: "X-Request-ID")
        == initialRequest.value(forHTTPHeaderField: "X-Request-ID")
    )
    #expect(retryRequest.value(forHTTPHeaderField: "If-None-Match") == #""prior-revision""#)
  }

  @Test("A second 401 is returned without another token refresh")
  func repeatedUnauthorizedStopsAfterOneRetry() async {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 401, requestID: "request-initial"),
      .v1(statusCode: 401, requestID: "request-retry"),
    ])
    let tokens = RecordingAuthTokenSource()
    let client = makeClient(
      transport: transport,
      tokenProvider: AuthTokenProvider { forceRefresh in
        await tokens.token(forceRefresh: forceRefresh)
      }
    )

    do {
      _ = try await client.listTrips(ifNoneMatch: nil)
      Issue.record("Expected the retried request to remain unauthorized")
    } catch let APIError.server(status, _, _, _, _, requestID) {
      #expect(status == 401)
      #expect(requestID == "request-retry")
    } catch {
      Issue.record("Unexpected error: \(error)")
    }

    #expect(await tokens.refreshRequests == [false, true])
    #expect(await transport.requestCount == 2)
  }

  @Test("A retried mutation preserves its body, idempotency key, and request ID")
  func unauthorizedPOSTPreservesRequest() async throws {
    let idempotencyKey = UUID(uuidString: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")!
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 401, requestID: "request-initial"),
      .v1(
        statusCode: 201,
        data: makePlanResponseData(),
        entityTag: #""4""#,
        requestID: "request-retry"
      ),
    ])
    let tokens = RecordingAuthTokenSource()
    let client = makeClient(
      transport: transport,
      tokenProvider: AuthTokenProvider { forceRefresh in
        await tokens.token(forceRefresh: forceRefresh)
      }
    )

    _ = try await client.createPlan(
      tripID: tripID,
      input: makePlanInput(),
      idempotencyKey: idempotencyKey
    )

    let initialRequest = await transport.request(at: 0)
    let retryRequest = await transport.request(at: 1)
    #expect(await tokens.refreshRequests == [false, true])
    #expect(await transport.requestCount == 2)
    #expect(initialRequest.httpMethod == "POST")
    #expect(retryRequest.httpMethod == initialRequest.httpMethod)
    #expect(retryRequest.url == initialRequest.url)
    #expect(retryRequest.httpBody == initialRequest.httpBody)
    #expect(
      retryRequest.value(forHTTPHeaderField: "Idempotency-Key")
        == initialRequest.value(forHTTPHeaderField: "Idempotency-Key")
    )
    #expect(
      retryRequest.value(forHTTPHeaderField: "X-Request-ID")
        == initialRequest.value(forHTTPHeaderField: "X-Request-ID")
    )
    #expect(initialRequest.value(forHTTPHeaderField: "Authorization") == "Bearer token-cached")
    #expect(retryRequest.value(forHTTPHeaderField: "Authorization") == "Bearer token-refreshed")
  }

  @Test("A non-401 server error does not refresh the token")
  func nonUnauthorizedErrorDoesNotRefreshToken() async {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 503, requestID: "request-unavailable")
    ])
    let tokens = RecordingAuthTokenSource()
    let client = makeClient(
      transport: transport,
      tokenProvider: AuthTokenProvider { forceRefresh in
        await tokens.token(forceRefresh: forceRefresh)
      }
    )

    await #expect(throws: APIError.self) {
      try await client.listTrips(ifNoneMatch: nil)
    }
    #expect(await tokens.refreshRequests == [false])
    #expect(await transport.requestCount == 1)
  }

  @Test("POST plan sends idempotency and JSON body headers and accepts a weak ETag")
  func createPlanRequest() async throws {
    let idempotencyKey = UUID(uuidString: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")!
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 201, data: makePlanResponseData(), entityTag: #"W/"4""#)
    ])
    let client = makeClient(transport: transport)
    let input = ScheduledPlanInput(
      tripStopID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
      title: "Visit the MAAT",
      category: .sightseeing,
      status: .planned,
      scheduledDate: LocalDate(rawValue: "2026-10-07")!,
      startTime: nil,
      endTime: nil,
      location: nil,
      confirmationNumber: nil,
      bookingURL: nil,
      notes: nil
    )

    let plan = try await client.createPlan(
      tripID: tripID,
      input: input,
      idempotencyKey: idempotencyKey
    )
    #expect(plan.revision == 4)

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "POST")
    #expect(request.url?.path == "/base/api/v1/trips/11111111-1111-4111-8111-111111111111/plans")
    #expect(request.value(forHTTPHeaderField: "Idempotency-Key") == idempotencyKey.uuidString.lowercased())
    #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    let body = try #require(request.httpBody)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    #expect(json["tripStopId"] as? String == "22222222-2222-4222-8222-222222222222")
    #expect(json["title"] as? String == "Visit the MAAT")
    #expect(json["scheduledDate"] as? String == "2026-10-07")
    for nullableKey in [
      "startTime", "endTime", "location", "confirmationNumber", "bookingUrl", "notes",
    ] {
      #expect(json.keys.contains(nullableKey), "Missing explicit nullable key \(nullableKey)")
      #expect(json[nullableKey] is NSNull, "Expected JSON null for \(nullableKey)")
    }
  }

  @Test("POST trip sends the native create payload and decodes the created trip")
  func createTripRequest() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 201, data: makeTripResponseData())
    ])
    let client = makeClient(transport: transport)
    let input = CreateTripInput(
      name: "Winter in Montréal",
      stops: [
        TripStopInput(
          name: "Montréal, Canada",
          arrivalDate: LocalDate(rawValue: "2026-12-04"),
          departureDate: LocalDate(rawValue: "2026-12-08"),
          location: TripStopLocationInput(
            provider: "google",
            placeID: "ChIJDbdkHFQayUwR7-8fITgxTmU"
          )
        )
      ]
    )

    let trip = try await client.createTrip(input: input)
    #expect(trip.name == "Winter in Montréal")
    #expect(trip.stops.first?.name == "Montréal, Canada")

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "POST")
    #expect(request.url?.path == "/base/api/v1/trips")
    #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    let body = try #require(request.httpBody)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    #expect(json["name"] as? String == "Winter in Montréal")
    let stops = try #require(json["stops"] as? [[String: Any]])
    let stop = try #require(stops.first)
    #expect(stop["name"] as? String == "Montréal, Canada")
    #expect(stop["arrivalDate"] as? String == "2026-12-04")
    #expect(stop["departureDate"] as? String == "2026-12-08")
    let location = try #require(stop["location"] as? [String: String])
    #expect(location["provider"] == "google")
    #expect(location["placeId"] == "ChIJDbdkHFQayUwR7-8fITgxTmU")
  }

  @Test("POST trip preserves explicit null dates for an undated destination")
  func createUndatedTripRequest() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 201, data: makeTripResponseData())
    ])
    let client = makeClient(transport: transport)

    _ = try await client.createTrip(
      input: CreateTripInput(
        name: "Someday in Montréal",
        stops: [
          TripStopInput(name: "Montréal, Canada", arrivalDate: nil, departureDate: nil)
        ]
      )
    )

    let request = await transport.request(at: 0)
    let body = try #require(request.httpBody)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    let stops = try #require(json["stops"] as? [[String: Any]])
    let stop = try #require(stops.first)
    #expect(stop.keys.contains("arrivalDate"))
    #expect(stop["arrivalDate"] is NSNull)
    #expect(stop.keys.contains("departureDate"))
    #expect(stop["departureDate"] is NSNull)
    #expect(stop.keys.contains("location"))
    #expect(stop["location"] is NSNull)
  }

  @Test("GET location suggestions encodes the query and decodes native results")
  func locationSuggestionsRequest() async throws {
    let sessionToken = UUID(uuidString: "5F0D88D9-7955-4680-9FBC-BAAD1FB5890C")!
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 200, data: makeLocationSuggestionsData())
    ])
    let client = makeClient(transport: transport)

    let suggestions = try await client.locationSuggestions(
      query: "Montréal & Québec",
      sessionToken: sessionToken
    )

    #expect(suggestions.first?.primaryText == "Montréal")
    #expect(suggestions.first?.kind == .city)

    let request = await transport.request(at: 0)
    let requestURL = try #require(request.url)
    let components = try #require(
      URLComponents(url: requestURL, resolvingAgainstBaseURL: false)
    )
    #expect(request.httpMethod == "GET")
    #expect(components.path == "/base/api/v1/locations/suggestions")
    #expect(components.queryItems?.first(where: { $0.name == "q" })?.value == "Montréal & Québec")
    #expect(
      components.queryItems?.first(where: { $0.name == "sessionToken" })?.value
        == sessionToken.uuidString.lowercased()
    )
  }

  @Test("POST location resolution keeps the autocomplete session token")
  func resolveLocationRequest() async throws {
    let sessionToken = UUID(uuidString: "5F0D88D9-7955-4680-9FBC-BAAD1FB5890C")!
    let placeID = "ChIJDbdkHFQayUwR7-8fITgxTmU"
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 200, data: makeResolvedLocationData(placeID: placeID))
    ])
    let client = makeClient(transport: transport)

    let location = try await client.resolveLocation(placeID: placeID, sessionToken: sessionToken)
    #expect(location == TripStopLocationInput(provider: "google", placeID: placeID))

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "POST")
    #expect(request.url?.path == "/base/api/v1/locations/resolve")
    let body = try #require(request.httpBody)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: String])
    #expect(json["placeId"] == placeID)
    #expect(json["sessionToken"] == sessionToken.uuidString.lowercased())
  }

  @Test("PATCH plan sends quoted revision and a complete JSON body")
  func updatePlanRequest() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 200, data: makePlanResponseData(revision: 8), entityTag: #""8""#)
    ])
    let client = makeClient(transport: transport)

    let plan = try await client.updatePlan(
      tripID: tripID,
      planID: planID,
      expectedRevision: 7,
      input: makePlanInput()
    )
    #expect(plan.revision == 8)

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "PATCH")
    #expect(request.value(forHTTPHeaderField: "If-Match") == #""7""#)
    #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    #expect(request.url?.path.hasSuffix("/plans/55555555-5555-4555-8555-555555555555") == true)
    let body = try #require(request.httpBody)
    let json = try #require(JSONSerialization.jsonObject(with: body) as? [String: Any])
    #expect(json["tripStopId"] as? String == "22222222-2222-4222-8222-222222222222")
    #expect(json["bookingUrl"] as? String == "https://tickets.example.com/maat")
    #expect(json.keys.contains("confirmationNumber"))
    #expect(json["confirmationNumber"] is NSNull)
  }

  @Test("PATCH plan sends quoted revision and maps a conflict")
  func updatePlanConflict() async {
    let data = Data(
      #"{"error":{"code":"revision_conflict","message":"Plan changed","currentRevision":8},"currentRevision":8}"#.utf8
    )
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 409, data: data, requestID: "request-conflict")
    ])
    let client = makeClient(transport: transport)

    do {
      _ = try await client.updatePlan(
        tripID: tripID,
        planID: planID,
        expectedRevision: 7,
        input: makePlanInput()
      )
      Issue.record("Expected a revision conflict")
    } catch let error as APIError {
      #expect(
        error
          == .server(
            status: 409,
            code: "revision_conflict",
            message: "Plan changed",
            fieldErrors: [:],
            currentRevision: 8,
            requestID: "request-conflict"
          )
      )
    } catch {
      Issue.record("Unexpected error: \(error)")
    }

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "PATCH")
    #expect(request.value(forHTTPHeaderField: "If-Match") == #""7""#)
    #expect(request.value(forHTTPHeaderField: "Content-Type") == "application/json")
    #expect(request.url?.path.hasSuffix("/plans/55555555-5555-4555-8555-555555555555") == true)
  }

  @Test("DELETE plan sends quoted revision and accepts only an empty success")
  func deletePlanRequest() async throws {
    let transport = MockHTTPTransport(stubs: [.v1(statusCode: 204)])
    let client = makeClient(transport: transport)

    try await client.deletePlan(tripID: tripID, planID: planID, expectedRevision: 9)

    let request = await transport.request(at: 0)
    #expect(request.httpMethod == "DELETE")
    #expect(request.httpBody == nil)
    #expect(request.value(forHTTPHeaderField: "If-Match") == #""9""#)
    #expect(request.url?.path.hasSuffix("/plans/55555555-5555-4555-8555-555555555555") == true)
  }

  private func makeClient(
    transport: MockHTTPTransport,
    tokenProvider: AuthTokenProvider = AuthTokenProvider { "token-test" }
  ) -> APIClient {
    APIClient(
      baseURL: baseURL,
      tokenProvider: tokenProvider,
      transport: transport
    )
  }
}

private actor RecordingAuthTokenSource {
  private(set) var refreshRequests: [Bool] = []

  func token(forceRefresh: Bool) -> String {
    refreshRequests.append(forceRefresh)
    return forceRefresh ? "token-refreshed" : "token-cached"
  }
}
