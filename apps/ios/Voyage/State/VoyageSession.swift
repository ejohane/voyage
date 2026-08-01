import Foundation
import Observation

enum ContentFreshness: Equatable, Sendable {
  case fresh
  case stale
}

enum TripIndexState: Equatable, Sendable {
  case idle
  case loading
  case loaded(TripIndex, savedAt: Date, freshness: ContentFreshness)
  case failed(APIError)
}

enum WorkspaceState: Equatable, Sendable {
  case idle
  case loading
  case loaded(TripWorkspace, savedAt: Date, freshness: ContentFreshness)
  case failed(APIError)
}

enum PlanMutationState: Equatable, Sendable {
  case idle
  case saving
  case deleting
  case failed(APIError)
}

@MainActor
@Observable
final class VoyageSession {
  private(set) var tripIndexState: TripIndexState = .idle
  private(set) var workspaceStates: [UUID: WorkspaceState] = [:]
  private(set) var peopleByTripID: [UUID: TripPeople] = [:]
  private(set) var planMutationState: PlanMutationState = .idle
  private(set) var lastError: APIError?

  private let api: any VoyageAPI
  private let cache: any SnapshotCaching
  private let now: @Sendable () -> Date
  private var didStart = false

  init(
    api: any VoyageAPI,
    cache: any SnapshotCaching,
    now: @escaping @Sendable () -> Date = Date.init
  ) {
    self.api = api
    self.cache = cache
    self.now = now
  }

  var trips: [Trip] {
    guard case .loaded(let index, _, _) = tripIndexState else { return [] }
    return index.trips
  }

  func start() async {
    guard !didStart else { return }
    didStart = true
    await restoreAndRefreshTrips()
    if Task.isCancelled {
      didStart = false
    }
  }

  func refreshTrips() async {
    await restoreAndRefreshTrips(forceRefresh: true)
  }

  @discardableResult
  func createTrip(input: CreateTripInput) async throws -> Trip {
    lastError = nil
    do {
      let trip = try await api.createTrip(input: input)
      await refreshTrips()
      return trip
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      let apiError = Self.map(error)
      lastError = apiError
      throw apiError
    }
  }

  func locationSuggestions(query: String, sessionToken: UUID) async throws
    -> [LocationSuggestion]
  {
    do {
      return try await api.locationSuggestions(query: query, sessionToken: sessionToken)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func resolveLocation(placeID: String, sessionToken: UUID) async throws
    -> TripStopLocationInput
  {
    do {
      return try await api.resolveLocation(placeID: placeID, sessionToken: sessionToken)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func loadWorkspace(tripID: UUID, forceRefresh: Bool = false) async {
    let cached = try? await cache.loadWorkspace(tripID: tripID)
    if let cached {
      workspaceStates[tripID] = .loaded(
        cached.value,
        savedAt: cached.savedAt,
        freshness: .stale
      )
    } else {
      workspaceStates[tripID] = .loading
    }

    do {
      let entityTag = forceRefresh ? nil : cached?.entityTag
      switch try await api.workspace(tripID: tripID, ifNoneMatch: entityTag) {
      case .modified(let workspace, let metadata):
        let savedAt = now()
        let snapshot = CachedWorkspace(
          value: workspace,
          entityTag: metadata.entityTag ?? APIClient.entityTag(forRevision: workspace.revision),
          savedAt: savedAt
        )
        try await cache.saveWorkspace(snapshot)
        workspaceStates[tripID] = .loaded(workspace, savedAt: savedAt, freshness: .fresh)
        lastError = nil
      case .notModified:
        guard let cached else { throw APIError.invalidResponse }
        let savedAt = now()
        try await cache.touchWorkspace(tripID: tripID, at: savedAt)
        workspaceStates[tripID] = .loaded(
          cached.value,
          savedAt: savedAt,
          freshness: .fresh
        )
        lastError = nil
      }
    } catch is CancellationError {
      return
    } catch {
      let apiError = Self.map(error)
      lastError = apiError
      if Self.provesWorkspaceAccessWasRevoked(apiError) {
        do {
          try await cache.removeWorkspace(tripID: tripID)
        } catch {
          lastError = Self.map(error)
        }
        peopleByTripID.removeValue(forKey: tripID)
        workspaceStates[tripID] = .failed(apiError)
      } else if cached == nil {
        // A 401 can be resolved by refreshing the authenticated session and does not prove that
        // trip membership was revoked. Keep any stale snapshot for 401, transport, and decode failures.
        workspaceStates[tripID] = .failed(apiError)
      }
    }
  }

  func loadPeople(tripID: UUID) async {
    do {
      peopleByTripID[tripID] = try await api.people(tripID: tripID)
      lastError = nil
    } catch is CancellationError {
      return
    } catch {
      let apiError = Self.map(error)
      lastError = apiError
      if Self.provesWorkspaceAccessWasRevoked(apiError) {
        do {
          try await cache.removeWorkspace(tripID: tripID)
        } catch {
          lastError = Self.map(error)
        }
        peopleByTripID.removeValue(forKey: tripID)
        workspaceStates[tripID] = .failed(apiError)
      }
    }
  }

  @discardableResult
  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    planMutationState = .saving
    lastError = nil
    do {
      let plan = try await api.createPlan(
        tripID: tripID,
        input: input,
        idempotencyKey: idempotencyKey
      )
      await reconcilePlanMutation(tripID: tripID) { plans in
        plans.removeAll { $0.id == plan.id }
        plans.append(plan)
      }
      planMutationState = .idle
      return plan
    } catch is CancellationError {
      planMutationState = .idle
      throw CancellationError()
    } catch {
      let apiError = Self.map(error)
      planMutationState = .failed(apiError)
      lastError = apiError
      throw apiError
    }
  }

  @discardableResult
  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan {
    planMutationState = .saving
    lastError = nil
    do {
      let plan = try await api.updatePlan(
        tripID: tripID,
        planID: planID,
        expectedRevision: expectedRevision,
        input: input
      )
      await reconcilePlanMutation(tripID: tripID) { plans in
        guard let index = plans.firstIndex(where: { $0.id == planID }) else {
          plans.append(plan)
          return
        }
        plans[index] = plan
      }
      planMutationState = .idle
      return plan
    } catch is CancellationError {
      planMutationState = .idle
      throw CancellationError()
    } catch {
      let apiError = Self.map(error)
      planMutationState = .failed(apiError)
      lastError = apiError
      throw apiError
    }
  }

  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws {
    planMutationState = .deleting
    lastError = nil
    do {
      try await api.deletePlan(
        tripID: tripID,
        planID: planID,
        expectedRevision: expectedRevision
      )
      await reconcilePlanMutation(tripID: tripID) { plans in
        plans.removeAll { $0.id == planID }
      }
      planMutationState = .idle
    } catch is CancellationError {
      planMutationState = .idle
      throw CancellationError()
    } catch {
      let apiError = Self.map(error)
      planMutationState = .failed(apiError)
      lastError = apiError
      throw apiError
    }
  }

  func workspaceState(for tripID: UUID) -> WorkspaceState {
    workspaceStates[tripID] ?? .idle
  }

  func purge() async throws {
    try await cache.purge()
    tripIndexState = .idle
    workspaceStates = [:]
    peopleByTripID = [:]
    planMutationState = .idle
    lastError = nil
    didStart = false
  }

  private func restoreAndRefreshTrips(forceRefresh: Bool = false) async {
    let cached = try? await cache.loadTripIndex()
    if let cached {
      tripIndexState = .loaded(cached.value, savedAt: cached.savedAt, freshness: .stale)
    } else {
      tripIndexState = .loading
    }

    do {
      let entityTag = forceRefresh ? nil : cached?.entityTag
      switch try await api.listTrips(ifNoneMatch: entityTag) {
      case .modified(let index, let metadata):
        let savedAt = now()
        let snapshot = CachedTripIndex(
          value: index,
          entityTag: metadata.entityTag ?? APIClient.entityTag(forRevision: index.revision),
          savedAt: savedAt
        )
        try await cache.saveTripIndex(snapshot)
        tripIndexState = .loaded(index, savedAt: savedAt, freshness: .fresh)
        lastError = nil
      case .notModified:
        guard let cached else { throw APIError.invalidResponse }
        let savedAt = now()
        try await cache.touchTripIndex(at: savedAt)
        tripIndexState = .loaded(cached.value, savedAt: savedAt, freshness: .fresh)
        lastError = nil
      }
    } catch is CancellationError {
      return
    } catch {
      let apiError = Self.map(error)
      lastError = apiError
      if cached == nil {
        tripIndexState = .failed(apiError)
      }
    }
  }

  private func reconcilePlanMutation(
    tripID: UUID,
    update: (inout [Plan]) -> Void
  ) async {
    guard case .loaded(let current, _, _) = workspaceStates[tripID] else {
      await loadWorkspace(tripID: tripID, forceRefresh: true)
      return
    }

    var plans = current.plans
    update(&plans)
    let reconciled = TripWorkspace(
      schemaVersion: current.schemaVersion,
      generatedAt: current.generatedAt,
      revision: current.revision,
      trip: current.trip,
      travel: current.travel,
      stays: current.stays,
      plans: plans
    )
    let savedAt = now()
    let previous = try? await cache.loadWorkspace(tripID: tripID)
    let snapshot = CachedWorkspace(
      value: reconciled,
      entityTag: previous?.entityTag ?? APIClient.entityTag(forRevision: current.revision),
      savedAt: savedAt
    )
    try? await cache.saveWorkspace(snapshot)
    workspaceStates[tripID] = .loaded(reconciled, savedAt: savedAt, freshness: .stale)
    await loadWorkspace(tripID: tripID, forceRefresh: true)
  }

  private static func map(_ error: Error) -> APIError {
    if let apiError = error as? APIError { return apiError }
    return .transport(message: String(describing: error))
  }

  private static func provesWorkspaceAccessWasRevoked(_ error: APIError) -> Bool {
    guard case .server(let status, _, _, _, _, _) = error else { return false }
    return status == 403 || status == 404
  }
}
