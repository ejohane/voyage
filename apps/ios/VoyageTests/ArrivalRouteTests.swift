import Foundation
import Testing

@testable import Voyage

@MainActor
struct ArrivalRouteTests {
  @Test("Arrival anchors form an Apple Maps route request")
  func routeRequestUsesBookedAnchors() throws {
    let briefing = try TestFixtures.briefing()
    let section = try #require(briefing.sections.first)
    let request = try #require(ArrivalRouteRequest(section: section))

    #expect(request.originLatitude == 38.7742)
    #expect(request.originLongitude == -9.1342)
    #expect(request.originLabel == "Lisbon Airport")
    #expect(request.destinationLabel == "Memmo Alfama")
    #expect(request.destinationAddress == "Travessa das Merceeiras 27, Lisbon")
  }

  @Test("A loaded route is reused instead of requesting Apple Maps again")
  func sessionCachesLoadedRoute() async throws {
    let request = try makeRequest()
    let estimate = ArrivalRouteEstimate(
      durationMinutes: 24,
      distanceMeters: 9_250,
      destinationLatitude: 38.7108,
      destinationLongitude: -9.1277
    )
    let provider = StubArrivalRouteProvider(responses: [.success(estimate)])
    let session = VoyageSession(
      api: FixtureAPI(),
      cache: InMemorySnapshotCache(),
      arrivalRouteProvider: provider
    )

    await session.loadArrivalRoute(request)
    await session.loadArrivalRoute(request)

    #expect(session.arrivalRouteState(for: request.id) == .loaded(estimate))
    #expect(provider.requests == [request])
  }

  @Test("A failed route can be retried")
  func sessionRetriesFailedRoute() async throws {
    let request = try makeRequest()
    let estimate = ArrivalRouteEstimate(
      durationMinutes: 27,
      distanceMeters: 10_100,
      destinationLatitude: 38.7108,
      destinationLongitude: -9.1277
    )
    let provider = StubArrivalRouteProvider(responses: [.failure, .success(estimate)])
    let session = VoyageSession(
      api: FixtureAPI(),
      cache: InMemorySnapshotCache(),
      arrivalRouteProvider: provider
    )

    await session.loadArrivalRoute(request)
    #expect(session.arrivalRouteState(for: request.id) == .failed)

    await session.loadArrivalRoute(request, forceRefresh: true)
    #expect(session.arrivalRouteState(for: request.id) == .loaded(estimate))
    #expect(provider.requests == [request, request])
  }

  @Test("Cancellation returns route state to idle")
  func cancellationIsNotShownAsFailure() async throws {
    let request = try makeRequest()
    let provider = StubArrivalRouteProvider(responses: [.cancelled])
    let session = VoyageSession(
      api: FixtureAPI(),
      cache: InMemorySnapshotCache(),
      arrivalRouteProvider: provider
    )

    await session.loadArrivalRoute(request)

    #expect(session.arrivalRouteState(for: request.id) == .idle)
  }

  private func makeRequest() throws -> ArrivalRouteRequest {
    let briefing = try TestFixtures.briefing()
    return try #require(briefing.sections.first.flatMap(ArrivalRouteRequest.init(section:)))
  }
}

@MainActor
private final class StubArrivalRouteProvider: ArrivalRouteProviding {
  enum Response {
    case success(ArrivalRouteEstimate)
    case failure
    case cancelled
  }

  private(set) var requests: [ArrivalRouteRequest] = []
  private var responses: [Response]

  init(responses: [Response]) {
    self.responses = responses
  }

  func estimate(_ request: ArrivalRouteRequest) async throws -> ArrivalRouteEstimate {
    requests.append(request)
    guard !responses.isEmpty else { throw ArrivalRouteError.routeUnavailable }
    switch responses.removeFirst() {
    case .success(let estimate):
      return estimate
    case .failure:
      throw ArrivalRouteError.routeUnavailable
    case .cancelled:
      throw CancellationError()
    }
  }
}
