import Foundation
import Testing

@testable import Voyage

struct APIClientTests {
  private let baseURL = URL(string: "https://voyage.example/base")!
  private let tripID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
  private let planID = UUID(uuidString: "55555555-5555-4555-8555-555555555555")!

  @Test("GET sends auth, version, request ID, and conditional ETag headers")
  func getHeadersAndModifiedResponse() async throws {
    let transport = MockHTTPTransport(stubs: [
      .v1(
        statusCode: 200,
        data: try TestFixtures.data(named: "trip-list"),
        entityTag: #""bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb""#,
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

  @Test("POST plan sends idempotency and JSON body headers")
  func createPlanRequest() async throws {
    let idempotencyKey = UUID(uuidString: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")!
    let transport = MockHTTPTransport(stubs: [
      .v1(statusCode: 201, data: makePlanResponseData(), entityTag: #""4""#)
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

  private func makeClient(transport: MockHTTPTransport) -> APIClient {
    APIClient(
      baseURL: baseURL,
      tokenProvider: AuthTokenProvider { "token-test" },
      transport: transport
    )
  }
}
