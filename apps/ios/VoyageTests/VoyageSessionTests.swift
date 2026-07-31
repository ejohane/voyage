import Foundation
import Testing

@testable import Voyage

@MainActor
struct VoyageSessionTests {
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

  @Test("An authenticated membership loss evicts the cached workspace", arguments: [403, 404])
  func membershipLossEvictsCachedWorkspace(status: Int) async throws {
    let workspace = try TestFixtures.workspace()
    let savedAt = Date(timeIntervalSince1970: 1_700_000_000)
    let snapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    let error = serverError(status: status)
    let cache = InMemorySnapshotCache()
    try await cache.saveWorkspace(snapshot)
    let session = VoyageSession(
      api: SessionAPI(workspaceError: error),
      cache: cache
    )

    await session.loadWorkspace(tripID: workspace.trip.id)

    #expect(session.workspaceState(for: workspace.trip.id) == .failed(error))
    #expect(session.lastError == error)
    #expect(try await cache.loadWorkspace(tripID: workspace.trip.id) == nil)
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

  @Test("A purge failure propagates without clearing in-memory session state")
  func purgeFailurePreservesSessionState() async throws {
    let index = try TestFixtures.tripIndex()
    let workspace = try TestFixtures.workspace()
    let api = SessionAPI(
      listResult: .modified(
        index,
        metadata: APIResponseMetadata(
          entityTag: APIClient.entityTag(forRevision: index.revision),
          requestID: "request-index"
        )
      ),
      workspaceResults: [modified(workspace, requestID: "request-workspace")]
    )
    let cache = PurgeFailingSnapshotCache()
    let session = VoyageSession(api: api, cache: cache)
    await session.start()
    await session.loadWorkspace(tripID: workspace.trip.id)
    await session.loadPeople(tripID: workspace.trip.id)
    let originalTripIndexState = session.tripIndexState
    let originalWorkspaceState = session.workspaceState(for: workspace.trip.id)
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
    #expect(session.peopleByTripID == originalPeople)
    #expect(session.planMutationState == originalPlanMutationState)
    #expect(session.lastError == originalLastError)
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
  private(set) var workspaceIfNoneMatches: [String?] = []
  private let workspaceError: APIError?
  private var createPlans: [Plan]
  private var updatePlans: [Plan]
  private let updateError: APIError?

  init(
    listResult: APIReadResult<TripIndex>? = nil,
    suspendList: Bool = false,
    workspaceResults: [APIReadResult<TripWorkspace>] = [],
    workspaceError: APIError? = nil,
    createPlans: [Plan] = [],
    updatePlans: [Plan] = [],
    updateError: APIError? = nil
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
    self.workspaceError = workspaceError
    self.createPlans = createPlans
    self.updatePlans = updatePlans
    self.updateError = updateError
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
    workspaceIfNoneMatches.append(ifNoneMatch)
    if let workspaceError { throw workspaceError }
    guard !workspaceResults.isEmpty else { throw APIError.invalidResponse }
    return workspaceResults.removeFirst()
  }

  func people(tripID: UUID) async throws -> TripPeople {
    TripPeople(schemaVersion: 1, generatedAt: "", members: [])
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

  func removeWorkspace(tripID: UUID) async throws {
    try await backing.removeWorkspace(tripID: tripID)
  }

  func purge() async throws {
    throw PurgeFailure.expected
  }
}
