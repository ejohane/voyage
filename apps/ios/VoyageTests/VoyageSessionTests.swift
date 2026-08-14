import Foundation
import Testing

@testable import Voyage

@MainActor
struct VoyageSessionTests {
  @Test("Creating a trip refreshes the trip index")
  func creatingTripRefreshesTrips() async throws {
    let existingIndex = try TestFixtures.tripIndex()
    let createdTrip = Trip(
      id: UUID(uuidString: "77777777-7777-4777-8777-777777777777")!,
      name: "Winter in Montréal",
      startDate: LocalDate(rawValue: "2026-12-04"),
      endDate: LocalDate(rawValue: "2026-12-08"),
      stops: [
        TripStop(
          id: UUID(uuidString: "88888888-8888-4888-8888-888888888888")!,
          position: 0,
          name: "Montréal, Canada",
          arrivalDate: LocalDate(rawValue: "2026-12-04"),
          departureDate: LocalDate(rawValue: "2026-12-08"),
          location: nil
        )
      ],
      accessLevel: .owner,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z"
    )
    let refreshedIndex = TripIndex(
      schemaVersion: existingIndex.schemaVersion,
      generatedAt: "2026-08-01T12:00:00.000Z",
      revision: String(repeating: "a", count: 64),
      trips: existingIndex.trips + [createdTrip]
    )
    let api = SessionAPI(
      listResult: .modified(
        refreshedIndex,
        metadata: APIResponseMetadata(
          entityTag: APIClient.entityTag(forRevision: refreshedIndex.revision),
          requestID: "request-create-trip"
        )
      ),
      createTrips: [createdTrip]
    )
    let session = VoyageSession(api: api, cache: InMemorySnapshotCache())

    let returned = try await session.createTrip(
      input: CreateTripInput(
        name: createdTrip.name,
        stops: [
          TripStopInput(
            name: "Montréal, Canada",
            arrivalDate: LocalDate(rawValue: "2026-12-04"),
            departureDate: LocalDate(rawValue: "2026-12-08")
          )
        ]
      )
    )

    #expect(returned == createdTrip)
    #expect(session.trips.contains(createdTrip))
    #expect(await api.listIfNoneMatches == [nil])
  }

  @Test("Cached trips are immediately stale, then 304 touches and marks them fresh")
  func cachedTripsBecomeFreshAfterNotModified() async throws {
    let index = try TestFixtures.tripIndex()
    let oldDate = Date(timeIntervalSince1970: 1_700_000_000)
    let freshDate = Date(timeIntervalSince1970: 1_800_000_000)
    let entityTag = APIClient.entityTag(forRevision: index.revision)
    let cache = InMemorySnapshotCache()
    try await cache.saveTripIndex(
      CachedTripIndex(value: index, entityTag: entityTag, savedAt: oldDate)
    )
    let api = SessionAPI(
      listResult: .notModified(
        metadata: APIResponseMetadata(entityTag: entityTag, requestID: "request-304")
      ),
      suspendList: true
    )
    let session = VoyageSession(api: api, cache: cache, now: { freshDate })

    let start = Task { await session.start() }
    await api.waitForListRequest()

    guard case .loaded(let staleIndex, let staleSavedAt, .stale) = session.tripIndexState else {
      Issue.record("Expected the cached trip index to be visible as stale")
      await api.resumeList()
      await start.value
      return
    }
    #expect(staleIndex == index)
    #expect(staleSavedAt == oldDate)

    await api.resumeList()
    await start.value

    #expect(session.tripIndexState == .loaded(index, savedAt: freshDate, freshness: .fresh))
    #expect(try await cache.loadTripIndex()?.savedAt == freshDate)
    #expect(await api.listIfNoneMatches == [entityTag])
  }

  @Test("Successful plan mutations force-refresh workspace and settle to idle")
  func successfulMutationsReconcileAndRefresh() async throws {
    let initial = try TestFixtures.workspace()
    let originalPlan = try #require(initial.plans.first)
    let createdPlan = copy(
      originalPlan,
      id: UUID(uuidString: "66666666-6666-4666-8666-666666666666")!,
      title: "Dinner in Alfama",
      revision: 1
    )
    let updatedPlan = copy(originalPlan, title: "Visit MAAT and the riverfront", revision: 4)
    let afterCreate = replacingPlans(initial, plans: [originalPlan, createdPlan])
    let afterUpdate = replacingPlans(initial, plans: [updatedPlan, createdPlan])
    let afterDelete = replacingPlans(initial, plans: [updatedPlan])
    let cachedEntityTag = APIClient.entityTag(forRevision: initial.revision)
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(
      CachedWorkspace(
        value: initial,
        entityTag: cachedEntityTag,
        savedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
    )
    let api = SessionAPI(
      workspaceResults: [
        .notModified(
          metadata: APIResponseMetadata(
            entityTag: cachedEntityTag,
            requestID: "request-initial"
          )
        ),
        modified(afterCreate, requestID: "request-create"),
        modified(afterUpdate, requestID: "request-update"),
        modified(afterDelete, requestID: "request-delete"),
      ],
      createPlans: [createdPlan],
      updatePlans: [updatedPlan]
    )
    let session = VoyageSession(
      api: api,
      cache: cache,
      now: { Date(timeIntervalSince1970: 1_800_000_000) }
    )

    await session.loadWorkspace(tripID: initial.trip.id)
    let created = try await session.createPlan(
      tripID: initial.trip.id,
      input: makePlanInput(),
      idempotencyKey: UUID()
    )
    #expect(created == createdPlan)
    #expect(session.planMutationState == .idle)
    #expect(workspace(from: session, tripID: initial.trip.id)?.plans == afterCreate.plans)

    let updated = try await session.updatePlan(
      tripID: initial.trip.id,
      planID: originalPlan.id,
      expectedRevision: originalPlan.revision,
      input: makePlanInput()
    )
    #expect(updated == updatedPlan)
    #expect(session.planMutationState == .idle)
    #expect(workspace(from: session, tripID: initial.trip.id)?.plans == afterUpdate.plans)

    try await session.deletePlan(
      tripID: initial.trip.id,
      planID: createdPlan.id,
      expectedRevision: createdPlan.revision
    )
    #expect(session.planMutationState == .idle)
    #expect(workspace(from: session, tripID: initial.trip.id)?.plans == afterDelete.plans)
    #expect(await api.workspaceIfNoneMatches == [cachedEntityTag, nil, nil, nil])
  }

  @Test("Importing Gmail bookings force-refreshes the workspace")
  func gmailImportRefreshesWorkspace() async throws {
    let initial = try TestFixtures.workspace()
    let scan = try JSONDecoder().decode(GmailScanResult.self, from: makeGmailScanData())
    let importResult = try JSONDecoder().decode(
      GmailImportResult.self,
      from: makeGmailImportData()
    )
    let api = SessionAPI(
      workspaceResults: [modified(initial, requestID: "request-gmail-refresh")],
      gmailImportResult: importResult
    )
    let session = VoyageSession(api: api, cache: InMemorySnapshotCache())

    let returned = try await session.importGmail(
      tripID: initial.trip.id,
      candidates: scan.candidates
    )

    #expect(returned == importResult)
    #expect(await api.workspaceIfNoneMatches == [nil])
    #expect(await api.gmailImportTripIDs == [initial.trip.id])
    #expect(workspace(from: session, tripID: initial.trip.id) == initial)
  }

  @Test("A mutation conflict is stored, mirrored as lastError, and rethrown")
  func mutationConflictIsExposed() async throws {
    let workspace = try TestFixtures.workspace()
    let plan = try #require(workspace.plans.first)
    let conflict = APIError.server(
      status: 409,
      code: "revision_conflict",
      message: "Plan changed",
      fieldErrors: [:],
      currentRevision: 8,
      requestID: "request-conflict"
    )
    let api = SessionAPI(updateError: conflict)
    let session = VoyageSession(api: api, cache: InMemorySnapshotCache())

    do {
      _ = try await session.updatePlan(
        tripID: workspace.trip.id,
        planID: plan.id,
        expectedRevision: plan.revision,
        input: makePlanInput()
      )
      Issue.record("Expected the conflict to be rethrown")
    } catch let error as APIError {
      #expect(error == conflict)
    } catch {
      Issue.record("Unexpected error: \(error)")
    }

    #expect(session.planMutationState == .failed(conflict))
    #expect(session.lastError == conflict)
  }

  @Test("Offline mutations fail immediately and are never queued")
  func offlineMutationsAreRejected() async throws {
    let workspace = try TestFixtures.workspace()
    let plan = try #require(workspace.plans.first)
    let expected = APIError.transport(
      message: "Voyage is offline and saved trips are read-only."
    )
    let session = VoyageSession(
      api: SessionAPI(createPlans: [plan]),
      cache: InMemorySnapshotCache(),
      automaticallyRefreshAccessibleTrips: false,
      connectivity: ConnectivityMonitor(isConnected: false, monitorsNetwork: false)
    )

    do {
      _ = try await session.createPlan(
        tripID: workspace.trip.id,
        input: makePlanInput(),
        idempotencyKey: UUID()
      )
      Issue.record("Expected offline plan creation to be rejected")
    } catch let error as APIError {
      #expect(error == expected)
    } catch {
      Issue.record("Unexpected error: \(error)")
    }

    #expect(session.planMutationState == .idle)
    #expect(!session.allowsMutations)
  }

  @Test("An authenticated membership loss evicts the cached workspace", arguments: [403, 404])
  func membershipLossEvictsCachedWorkspace(status: Int) async throws {
    let workspace = try TestFixtures.workspace()
    let people = try TestFixtures.people()
    let briefing = try TestFixtures.briefing()
    let routeRequest = try #require(
      briefing.sections.first.flatMap(ArrivalRouteRequest.init(section:))
    )
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let snapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    let error = serverError(status: status)
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(snapshot)
    try await cache.savePeople(CachedPeople(value: people, savedAt: savedAt), tripID: workspace.trip.id)
    try await cache.saveBriefing(
      CachedBriefing(value: briefing, savedAt: savedAt),
      tripID: workspace.trip.id
    )
    try await cache.saveArrivalRoute(
      CachedArrivalRoute(
        tripID: workspace.trip.id,
        request: routeRequest,
        estimate: ArrivalRouteEstimate(
          durationMinutes: 24,
          distanceMeters: 9_250,
          destinationLatitude: 38.7108,
          destinationLongitude: -9.1277
        ),
        savedAt: savedAt
      )
    )
    let session = VoyageSession(
      api: SessionAPI(workspaceError: error),
      cache: cache
    )

    await session.loadWorkspace(tripID: workspace.trip.id)

    #expect(session.workspaceState(for: workspace.trip.id) == .failed(error))
    #expect(session.lastError == error)
    #expect(try await cache.loadWorkspace(tripID: workspace.trip.id) == nil)
    #expect(try await cache.loadPeople(tripID: workspace.trip.id) == nil)
    #expect(try await cache.loadBriefing(tripID: workspace.trip.id) == nil)
    #expect(try await cache.loadArrivalRoute(requestID: routeRequest.id) == nil)
  }

  @Test(
    "Offline and decode failures preserve a cached stale workspace",
    arguments: [
      APIError.transport(message: "The network is offline"),
      APIError.decoding(message: "The response was malformed", requestID: "request-decode"),
    ]
  )
  func recoverableReadFailurePreservesCachedWorkspace(error: APIError) async throws {
    let workspace = try TestFixtures.workspace()
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let snapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(snapshot)
    let session = VoyageSession(
      api: SessionAPI(workspaceError: error),
      cache: cache
    )

    await session.loadWorkspace(tripID: workspace.trip.id)

    #expect(
      session.workspaceState(for: workspace.trip.id)
        == .loaded(workspace, savedAt: savedAt, freshness: .stale)
    )
    #expect(session.lastError == error)
    #expect(try await cache.loadWorkspace(tripID: workspace.trip.id) == snapshot)
  }

  @Test("A 401 preserves cached content because it does not prove membership loss")
  func unauthorizedPreservesCachedWorkspace() async throws {
    let workspace = try TestFixtures.workspace()
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let snapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    let error = serverError(status: 401)
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(snapshot)
    let session = VoyageSession(
      api: SessionAPI(workspaceError: error),
      cache: cache
    )

    // A 401 can be a refreshable session failure, so it is not evidence that access was revoked.
    await session.loadWorkspace(tripID: workspace.trip.id)

    #expect(
      session.workspaceState(for: workspace.trip.id)
        == .loaded(workspace, savedAt: savedAt, freshness: .stale)
    )
    #expect(session.lastError == error)
    #expect(try await cache.loadWorkspace(tripID: workspace.trip.id) == snapshot)
  }

  @Test("Every accessible trip refreshes and persists in the background")
  func automaticAccessibleTripRefresh() async throws {
    let firstWorkspace = try TestFixtures.workspace()
    let secondTripID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
    let secondWorkspace = replacingTripID(firstWorkspace, with: secondTripID)
    let orphanTripID = UUID(uuidString: "99999999-9999-4999-8999-999999999999")!
    let orphanWorkspace = replacingTripID(firstWorkspace, with: orphanTripID)
    let index = TripIndex(
      schemaVersion: 1,
      generatedAt: "2026-08-14T12:00:00.000Z",
      revision: String(repeating: "a", count: 64),
      trips: [firstWorkspace.trip, secondWorkspace.trip]
    )
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(
      CachedWorkspace(
        value: orphanWorkspace,
        entityTag: APIClient.entityTag(forRevision: orphanWorkspace.revision),
        savedAt: Date(timeIntervalSince1970: 1_700_000_000)
      )
    )
    let briefing = try TestFixtures.briefing()
    let api = SessionAPI(
      listResult: .modified(
        index,
        metadata: APIResponseMetadata(
          entityTag: APIClient.entityTag(forRevision: index.revision),
          requestID: "request-all-trips"
        )
      ),
      workspaceResultsByTripID: [
        firstWorkspace.trip.id: modified(firstWorkspace, requestID: "request-first"),
        secondTripID: modified(secondWorkspace, requestID: "request-second"),
      ],
      briefingResults: [briefing, briefing]
    )
    let session = VoyageSession(
      api: api,
      cache: cache,
      arrivalRouteProvider: UnavailableArrivalRouteProvider()
    )

    await session.start()
    await session.waitForBackgroundSnapshotRefresh()

    let accessibleIDs = Set(index.trips.map(\.id))
    #expect(Set(await api.workspaceTripIDs) == accessibleIDs)
    #expect(Set(await api.peopleTripIDs) == accessibleIDs)
    #expect(Set(await api.briefingTripIDs) == accessibleIDs)
    #expect(try await cache.loadWorkspace(tripID: firstWorkspace.trip.id)?.value == firstWorkspace)
    #expect(try await cache.loadWorkspace(tripID: secondTripID)?.value == secondWorkspace)
    #expect(try await cache.loadPeople(tripID: firstWorkspace.trip.id) != nil)
    #expect(try await cache.loadPeople(tripID: secondTripID) != nil)
    #expect(try await cache.loadBriefing(tripID: firstWorkspace.trip.id)?.value == briefing)
    #expect(try await cache.loadBriefing(tripID: secondTripID)?.value == briefing)
    #expect(try await cache.loadWorkspace(tripID: orphanTripID) == nil)
  }

  @Test("People, briefing, and route snapshots remain visible when refreshes fail")
  func extendedSnapshotsRestoreBeforeFailedRefresh() async throws {
    let workspace = try TestFixtures.workspace()
    let people = try TestFixtures.people()
    let briefing = try TestFixtures.briefing()
    let request = try #require(
      briefing.sections.first.flatMap(ArrivalRouteRequest.init(section:))
    )
    let estimate = ArrivalRouteEstimate(
      durationMinutes: 24,
      distanceMeters: 9_250,
      destinationLatitude: 38.7108,
      destinationLongitude: -9.1277
    )
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let cache = InMemorySnapshotCache()
    try await cache.savePeople(CachedPeople(value: people, savedAt: savedAt), tripID: workspace.trip.id)
    try await cache.saveBriefing(
      CachedBriefing(value: briefing, savedAt: savedAt),
      tripID: workspace.trip.id
    )
    try await cache.saveArrivalRoute(
      CachedArrivalRoute(
        tripID: workspace.trip.id,
        request: request,
        estimate: estimate,
        savedAt: savedAt
      )
    )
    let offline = APIError.transport(message: "offline")
    let session = VoyageSession(
      api: SessionAPI(briefingError: offline, peopleError: offline),
      cache: cache,
      arrivalRouteProvider: UnavailableArrivalRouteProvider(),
      automaticallyRefreshAccessibleTrips: false
    )

    await session.loadPeople(tripID: workspace.trip.id)
    await session.loadBriefing(tripID: workspace.trip.id)
    await session.loadArrivalRoute(request, tripID: workspace.trip.id)

    #expect(
      session.peopleState(for: workspace.trip.id)
        == .loaded(people, savedAt: savedAt, freshness: .stale)
    )
    #expect(
      session.briefingState(for: workspace.trip.id)
        == .loaded(briefing, savedAt: savedAt, freshness: .stale)
    )
    #expect(
      session.arrivalRouteState(for: request.id)
        == .loaded(estimate, savedAt: savedAt, freshness: .stale)
    )
  }

  @Test("A purge failure propagates without clearing in-memory session state")
  func purgeFailurePreservesSessionState() async throws {
    let index = try TestFixtures.tripIndex()
    let workspace = try TestFixtures.workspace()
    let briefing = try TestFixtures.briefing()
    let api = SessionAPI(
      listResult: .modified(
        index,
        metadata: APIResponseMetadata(
          entityTag: APIClient.entityTag(forRevision: index.revision),
          requestID: "request-index"
        )
      ),
      workspaceResults: [modified(workspace, requestID: "request-workspace")],
      briefingResults: [briefing]
    )
    let cache = PurgeFailingSnapshotCache()
    let session = VoyageSession(api: api, cache: cache)
    await session.start()
    await session.loadWorkspace(tripID: workspace.trip.id)
    await session.loadBriefing(tripID: workspace.trip.id)
    await session.loadPeople(tripID: workspace.trip.id)
    let originalTripIndexState = session.tripIndexState
    let originalWorkspaceState = session.workspaceState(for: workspace.trip.id)
    let originalBriefingState = session.briefingState(for: workspace.trip.id)
    let originalPeople = session.peopleByTripID
    let originalPlanMutationState = session.planMutationState
    let originalLastError = session.lastError

    do {
      try await session.purge()
      Issue.record("Expected the cache purge failure to propagate")
    } catch PurgeFailure.expected {
      // Expected.
    } catch {
      Issue.record("Unexpected error: \(error)")
    }

    #expect(session.tripIndexState == originalTripIndexState)
    #expect(session.workspaceState(for: workspace.trip.id) == originalWorkspaceState)
    #expect(session.briefingState(for: workspace.trip.id) == originalBriefingState)
    #expect(session.peopleByTripID == originalPeople)
    #expect(session.planMutationState == originalPlanMutationState)
    #expect(session.lastError == originalLastError)
  }

  @Test("A briefing loads independently from its workspace")
  func briefingLoadsIndependently() async throws {
    let workspace = try TestFixtures.workspace()
    let briefing = try TestFixtures.briefing()
    let api = SessionAPI(
      workspaceResults: [modified(workspace, requestID: "request-workspace")],
      briefingResults: [briefing]
    )
    let session = VoyageSession(api: api, cache: InMemorySnapshotCache())

    await session.loadWorkspace(tripID: workspace.trip.id)
    await session.loadBriefing(tripID: workspace.trip.id)

    #expect(self.workspace(from: session, tripID: workspace.trip.id) == workspace)
    guard
      case .loaded(let loadedBriefing, _, .fresh) = session.briefingState(
        for: workspace.trip.id
      )
    else {
      Issue.record("Expected a fresh briefing")
      return
    }
    #expect(loadedBriefing == briefing)
    #expect(await api.briefingTripIDs == [workspace.trip.id])
  }

  @Test("A briefing failure leaves the loaded workspace available")
  func briefingFailurePreservesWorkspace() async throws {
    let workspace = try TestFixtures.workspace()
    let error = APIError.transport(message: "offline")
    let api = SessionAPI(
      workspaceResults: [modified(workspace, requestID: "request-workspace")],
      briefingError: error
    )
    let session = VoyageSession(api: api, cache: InMemorySnapshotCache())

    await session.loadWorkspace(tripID: workspace.trip.id)
    await session.loadBriefing(tripID: workspace.trip.id)

    #expect(self.workspace(from: session, tripID: workspace.trip.id) == workspace)
    #expect(session.briefingState(for: workspace.trip.id) == .failed(error))
    #expect(session.lastError == nil)
  }

  private func modified(
    _ workspace: TripWorkspace,
    requestID: String
  ) -> APIReadResult<TripWorkspace> {
    .modified(
      workspace,
      metadata: APIResponseMetadata(
        entityTag: APIClient.entityTag(forRevision: workspace.revision),
        requestID: requestID
      )
    )
  }

  private func serverError(status: Int) -> APIError {
    .server(
      status: status,
      code: status == 401 ? "unauthorized" : "trip_not_found",
      message: status == 401 ? "Sign in again" : "Trip access is unavailable",
      fieldErrors: [:],
      currentRevision: nil,
      requestID: "request-\(status)"
    )
  }

  private func replacingPlans(_ workspace: TripWorkspace, plans: [Plan]) -> TripWorkspace {
    TripWorkspace(
      schemaVersion: workspace.schemaVersion,
      generatedAt: workspace.generatedAt,
      revision: workspace.revision,
      trip: workspace.trip,
      travel: workspace.travel,
      stays: workspace.stays,
      plans: plans
    )
  }

  private func replacingTripID(_ workspace: TripWorkspace, with id: UUID) -> TripWorkspace {
    let current = workspace.trip
    let trip = Trip(
      id: id,
      name: current.name,
      startDate: current.startDate,
      endDate: current.endDate,
      stops: current.stops,
      accessLevel: current.accessLevel,
      createdAt: current.createdAt,
      updatedAt: current.updatedAt
    )
    return TripWorkspace(
      schemaVersion: workspace.schemaVersion,
      generatedAt: workspace.generatedAt,
      revision: workspace.revision,
      trip: trip,
      travel: [],
      stays: [],
      plans: []
    )
  }

  private func copy(
    _ plan: Plan,
    id: UUID? = nil,
    title: String? = nil,
    revision: Int
  ) -> Plan {
    Plan(
      id: id ?? plan.id,
      tripID: plan.tripID,
      tripStopID: plan.tripStopID,
      title: title ?? plan.title,
      category: plan.category,
      status: plan.status,
      scheduledDate: plan.scheduledDate,
      startTime: plan.startTime,
      endTime: plan.endTime,
      location: plan.location,
      confirmationNumber: plan.confirmationNumber,
      bookingURL: plan.bookingURL,
      notes: plan.notes,
      revision: revision,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    )
  }

  private func workspace(from session: VoyageSession, tripID: UUID) -> TripWorkspace? {
    guard case .loaded(let workspace, _, .fresh) = session.workspaceState(for: tripID) else {
      Issue.record("Expected a fresh workspace")
      return nil
    }
    return workspace
  }
}
actor SessionAPI: VoyageAPI {
  private var listResult: APIReadResult<TripIndex>
  private let suspendList: Bool
  private var listResumeContinuation: CheckedContinuation<Void, Never>?
  private var listRequestContinuation: CheckedContinuation<Void, Never>?
  private(set) var listIfNoneMatches: [String?] = []

  private var workspaceResults: [APIReadResult<TripWorkspace>]
  private var workspaceResultsByTripID: [UUID: APIReadResult<TripWorkspace>]
  private(set) var workspaceIfNoneMatches: [String?] = []
  private(set) var workspaceTripIDs: [UUID] = []
  private let workspaceError: APIError?
  private var briefingResults: [TripBriefing]
  private let briefingError: APIError?
  private(set) var briefingTripIDs: [UUID] = []
  private let peopleError: APIError?
  private(set) var peopleTripIDs: [UUID] = []
  private var createTrips: [Trip]
  private var createPlans: [Plan]
  private var updatePlans: [Plan]
  private let updateError: APIError?
  private let gmailImportResult: GmailImportResult?
  private(set) var gmailImportTripIDs: [UUID] = []

  init(
    listResult: APIReadResult<TripIndex>? = nil,
    suspendList: Bool = false,
    workspaceResults: [APIReadResult<TripWorkspace>] = [],
    workspaceResultsByTripID: [UUID: APIReadResult<TripWorkspace>] = [:],
    workspaceError: APIError? = nil,
    briefingResults: [TripBriefing] = [],
    briefingError: APIError? = nil,
    peopleError: APIError? = nil,
    createTrips: [Trip] = [],
    createPlans: [Plan] = [],
    updatePlans: [Plan] = [],
    updateError: APIError? = nil,
    gmailImportResult: GmailImportResult? = nil
  ) {
    self.listResult =
      listResult
      ?? .modified(
        TripIndex(schemaVersion: 1, generatedAt: "", revision: String(repeating: "0", count: 64), trips: []),
        metadata: APIResponseMetadata(
          entityTag: #""0000000000000000000000000000000000000000000000000000000000000000""#,
          requestID: "request-default")
      )
    self.suspendList = suspendList
    self.workspaceResults = workspaceResults
    self.workspaceResultsByTripID = workspaceResultsByTripID
    self.workspaceError = workspaceError
    self.briefingResults = briefingResults
    self.briefingError = briefingError
    self.peopleError = peopleError
    self.createTrips = createTrips
    self.createPlans = createPlans
    self.updatePlans = updatePlans
    self.updateError = updateError
    self.gmailImportResult = gmailImportResult
  }

  func listTrips(ifNoneMatch: String?) async throws -> APIReadResult<TripIndex> {
    listIfNoneMatches.append(ifNoneMatch)
    listRequestContinuation?.resume()
    listRequestContinuation = nil
    if suspendList {
      await withCheckedContinuation { continuation in
        listResumeContinuation = continuation
      }
    }
    return listResult
  }

  func createTrip(input: CreateTripInput) async throws -> Trip {
    guard !createTrips.isEmpty else { throw APIError.invalidResponse }
    return createTrips.removeFirst()
  }

  func locationSuggestions(query: String, sessionToken: UUID) async throws
    -> [LocationSuggestion]
  {
    []
  }

  func resolveLocation(placeID: String, sessionToken: UUID) async throws
    -> TripStopLocationInput
  {
    TripStopLocationInput(provider: "google", placeID: placeID)
  }

  func waitForListRequest() async {
    guard listIfNoneMatches.isEmpty else { return }
    await withCheckedContinuation { continuation in
      listRequestContinuation = continuation
    }
  }

  func resumeList() {
    listResumeContinuation?.resume()
    listResumeContinuation = nil
  }

  func workspace(
    tripID: UUID,
    ifNoneMatch: String?
  ) async throws -> APIReadResult<TripWorkspace> {
    workspaceTripIDs.append(tripID)
    workspaceIfNoneMatches.append(ifNoneMatch)
    if let workspaceError { throw workspaceError }
    if let result = workspaceResultsByTripID.removeValue(forKey: tripID) {
      return result
    }
    guard !workspaceResults.isEmpty else { throw APIError.invalidResponse }
    return workspaceResults.removeFirst()
  }

  func people(tripID: UUID) async throws -> TripPeople {
    peopleTripIDs.append(tripID)
    if let peopleError { throw peopleError }
    return TripPeople(schemaVersion: 1, generatedAt: "", members: [])
  }

  func briefing(tripID: UUID) async throws -> TripBriefing {
    briefingTripIDs.append(tripID)
    if let briefingError { throw briefingError }
    guard !briefingResults.isEmpty else { throw APIError.invalidResponse }
    return briefingResults.removeFirst()
  }

  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    guard !createPlans.isEmpty else { throw APIError.invalidResponse }
    return createPlans.removeFirst()
  }

  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan {
    if let updateError { throw updateError }
    guard !updatePlans.isEmpty else { throw APIError.invalidResponse }
    return updatePlans.removeFirst()
  }

  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws {}

  func importGmail(
    tripID: UUID,
    candidates: [GmailImportCandidate]
  ) async throws -> GmailImportResult {
    gmailImportTripIDs.append(tripID)
    guard let gmailImportResult else { throw APIError.invalidResponse }
    return gmailImportResult
  }
}

@MainActor
private final class UnavailableArrivalRouteProvider: ArrivalRouteProviding {
  func estimate(_ request: ArrivalRouteRequest) async throws -> ArrivalRouteEstimate {
    throw ArrivalRouteError.routeUnavailable
  }
}

private enum PurgeFailure: Error {
  case expected
}

private actor PurgeFailingSnapshotCache: SnapshotCaching {
  private let backing = InMemorySnapshotCache()

  func loadTripIndex() async throws -> CachedTripIndex? {
    try await backing.loadTripIndex()
  }

  func saveTripIndex(_ snapshot: CachedTripIndex) async throws {
    try await backing.saveTripIndex(snapshot)
  }

  func touchTripIndex(at date: Date) async throws {
    try await backing.touchTripIndex(at: date)
  }

  func loadWorkspace(tripID: UUID) async throws -> CachedWorkspace? {
    try await backing.loadWorkspace(tripID: tripID)
  }

  func saveWorkspace(_ snapshot: CachedWorkspace) async throws {
    try await backing.saveWorkspace(snapshot)
  }

  func touchWorkspace(tripID: UUID, at date: Date) async throws {
    try await backing.touchWorkspace(tripID: tripID, at: date)
  }

  func loadPeople(tripID: UUID) async throws -> CachedPeople? {
    try await backing.loadPeople(tripID: tripID)
  }

  func savePeople(_ snapshot: CachedPeople, tripID: UUID) async throws {
    try await backing.savePeople(snapshot, tripID: tripID)
  }

  func loadBriefing(tripID: UUID) async throws -> CachedBriefing? {
    try await backing.loadBriefing(tripID: tripID)
  }

  func saveBriefing(_ snapshot: CachedBriefing, tripID: UUID) async throws {
    try await backing.saveBriefing(snapshot, tripID: tripID)
  }

  func loadArrivalRoute(requestID: String) async throws -> CachedArrivalRoute? {
    try await backing.loadArrivalRoute(requestID: requestID)
  }

  func saveArrivalRoute(_ snapshot: CachedArrivalRoute) async throws {
    try await backing.saveArrivalRoute(snapshot)
  }

  func removeTrip(tripID: UUID) async throws {
    try await backing.removeTrip(tripID: tripID)
  }

  func retainTrips(ids: Set<UUID>) async throws {
    try await backing.retainTrips(ids: ids)
  }

  func purge() async throws {
    throw PurgeFailure.expected
  }
}
