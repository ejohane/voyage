import Foundation
import Network
import Observation

@MainActor
@Observable
final class ConnectivityMonitor {
  private(set) var isConnected: Bool
  var onConnected: (@MainActor @Sendable () -> Void)?

  private let monitor: NWPathMonitor?

  init(isConnected: Bool = true, monitorsNetwork: Bool = true) {
    self.isConnected = isConnected
    guard monitorsNetwork else {
      monitor = nil
      return
    }

    let monitor = NWPathMonitor()
    self.monitor = monitor
    monitor.pathUpdateHandler = { [weak self] path in
      Task { @MainActor in
        guard let self else { return }
        let wasConnected = self.isConnected
        self.isConnected = path.status == .satisfied
        if self.isConnected && !wasConnected {
          self.onConnected?()
        }
      }
    }
    monitor.start(queue: DispatchQueue(label: "app.voyage.native.connectivity"))
  }
}

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

enum BriefingState: Equatable, Sendable {
  case idle
  case loading
  case loaded(TripBriefing, savedAt: Date, freshness: ContentFreshness)
  case failed(APIError)
}

enum PeopleState: Equatable, Sendable {
  case idle
  case loading
  case loaded(TripPeople, savedAt: Date, freshness: ContentFreshness)
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
  private(set) var briefingStates: [UUID: BriefingState] = [:]
  private(set) var peopleStates: [UUID: PeopleState] = [:]
  private(set) var arrivalRouteStates: [String: ArrivalRouteState] = [:]
  private(set) var peopleByTripID: [UUID: TripPeople] = [:]
  private(set) var planMutationState: PlanMutationState = .idle
  private(set) var lastError: APIError?
  let connectivity: ConnectivityMonitor

  private let api: any VoyageAPI
  private let cache: any SnapshotCaching
  private let arrivalRouteProvider: any ArrivalRouteProviding
  private let now: @Sendable () -> Date
  private let automaticallyRefreshAccessibleTrips: Bool
  private var didStart = false
  private var snapshotRefreshTask: Task<Void, Never>?
  private var arrivalRouteRequests: [String: ArrivalRouteRequest] = [:]
  private var arrivalRouteTripIDs: [String: UUID] = [:]
  private var isPurging = false

  init(
    api: any VoyageAPI,
    cache: any SnapshotCaching,
    arrivalRouteProvider: any ArrivalRouteProviding = AppleMapsArrivalRouteProvider(),
    now: @escaping @Sendable () -> Date = Date.init,
    automaticallyRefreshAccessibleTrips: Bool = true,
    connectivity: ConnectivityMonitor = ConnectivityMonitor()
  ) {
    self.api = api
    self.cache = cache
    self.arrivalRouteProvider = arrivalRouteProvider
    self.now = now
    self.automaticallyRefreshAccessibleTrips = automaticallyRefreshAccessibleTrips
    self.connectivity = connectivity
    connectivity.onConnected = { [weak self] in
      Task { await self?.refreshTrips() }
    }
  }

  var allowsMutations: Bool { connectivity.isConnected }

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
    try requireOnlineMutation()
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
        guard !isPurging else { return }
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
        guard !isPurging else { return }
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
        await evictTrip(tripID: tripID, error: apiError)
      } else if cached == nil {
        // A 401 can be resolved by refreshing the authenticated session and does not prove that
        // trip membership was revoked. Keep any stale snapshot for 401, transport, and decode failures.
        workspaceStates[tripID] = .failed(apiError)
      }
    }
  }

  func loadPeople(tripID: UUID) async {
    let cached = try? await cache.loadPeople(tripID: tripID)
    if let cached {
      peopleByTripID[tripID] = cached.value
      peopleStates[tripID] = .loaded(
        cached.value,
        savedAt: cached.savedAt,
        freshness: .stale
      )
    } else {
      peopleStates[tripID] = .loading
    }

    do {
      let people = try await api.people(tripID: tripID)
      guard !isPurging else { return }
      let savedAt = now()
      try await cache.savePeople(CachedPeople(value: people, savedAt: savedAt), tripID: tripID)
      peopleByTripID[tripID] = people
      peopleStates[tripID] = .loaded(people, savedAt: savedAt, freshness: .fresh)
      lastError = nil
    } catch is CancellationError {
      return
    } catch {
      let apiError = Self.map(error)
      lastError = apiError
      if Self.provesWorkspaceAccessWasRevoked(apiError) {
        await evictTrip(tripID: tripID, error: apiError)
      } else if cached == nil {
        peopleStates[tripID] = .failed(apiError)
      }
    }
  }

  func loadBriefing(tripID: UUID) async {
    let cached = try? await cache.loadBriefing(tripID: tripID)
    if let cached {
      briefingStates[tripID] = .loaded(
        cached.value,
        savedAt: cached.savedAt,
        freshness: .stale
      )
    } else {
      briefingStates[tripID] = .loading
    }

    do {
      let briefing = try await api.briefing(tripID: tripID)
      guard !isPurging else { return }
      let savedAt = now()
      try await cache.saveBriefing(
        CachedBriefing(value: briefing, savedAt: savedAt),
        tripID: tripID
      )
      briefingStates[tripID] = .loaded(briefing, savedAt: savedAt, freshness: .fresh)
    } catch is CancellationError {
      return
    } catch {
      let apiError = Self.map(error)
      if Self.provesWorkspaceAccessWasRevoked(apiError) {
        await evictTrip(tripID: tripID, error: apiError)
      } else if cached == nil {
        briefingStates[tripID] = .failed(apiError)
      }
    }
  }

  func loadArrivalRoute(
    _ request: ArrivalRouteRequest,
    tripID: UUID,
    forceRefresh: Bool = false
  ) async {
    if arrivalRouteRequests[request.id] != request || arrivalRouteTripIDs[request.id] != tripID {
      arrivalRouteStates.removeValue(forKey: request.id)
    }
    arrivalRouteRequests[request.id] = request
    arrivalRouteTripIDs[request.id] = tripID

    if !forceRefresh {
      switch arrivalRouteState(for: request.id) {
      case .loading, .loaded(_, _, .fresh):
        return
      case .idle, .loaded(_, _, .stale), .failed:
        break
      }
    }

    let cached = try? await cache.loadArrivalRoute(requestID: request.id)
    let matchingCache = cached.flatMap { snapshot in
      snapshot.tripID == tripID && snapshot.request == request ? snapshot : nil
    }
    if let matchingCache {
      arrivalRouteStates[request.id] = .loaded(
        matchingCache.estimate,
        savedAt: matchingCache.savedAt,
        freshness: .stale
      )
    } else {
      arrivalRouteStates[request.id] = .loading
    }

    do {
      let estimate = try await arrivalRouteProvider.estimate(request)
      guard !isPurging else { return }
      let savedAt = now()
      try await cache.saveArrivalRoute(
        CachedArrivalRoute(
          tripID: tripID,
          request: request,
          estimate: estimate,
          savedAt: savedAt
        )
      )
      arrivalRouteStates[request.id] = .loaded(
        estimate,
        savedAt: savedAt,
        freshness: .fresh
      )
    } catch is CancellationError {
      if matchingCache == nil {
        arrivalRouteStates[request.id] = .idle
      }
    } catch {
      if matchingCache == nil {
        arrivalRouteStates[request.id] = .failed
      }
    }
  }

  func gmailConnection() async throws -> GmailConnection {
    do {
      return try await api.gmailConnection()
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func beginGmailConnection(tripID: UUID) async throws -> URL {
    try requireOnlineMutation()
    do {
      return try await api.beginGmailConnection(tripID: tripID)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func disconnectGmail() async throws {
    try requireOnlineMutation()
    do {
      try await api.disconnectGmail()
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func scanGmail(tripID: UUID, mode: GmailScanMode = .standard) async throws
    -> GmailScanResult
  {
    try requireOnlineMutation()
    do {
      return try await api.scanGmail(tripID: tripID, mode: mode)
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  func importGmail(
    tripID: UUID,
    candidates: [GmailImportCandidate]
  ) async throws -> GmailImportResult {
    try requireOnlineMutation()
    do {
      let result = try await api.importGmail(tripID: tripID, candidates: candidates)
      await loadWorkspace(tripID: tripID, forceRefresh: true)
      return result
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw Self.map(error)
    }
  }

  @discardableResult
  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    try requireOnlineMutation()
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
    try requireOnlineMutation()
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
    try requireOnlineMutation()
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

  func briefingState(for tripID: UUID) -> BriefingState {
    briefingStates[tripID] ?? .idle
  }

  func peopleState(for tripID: UUID) -> PeopleState {
    peopleStates[tripID] ?? .idle
  }

  func arrivalRouteState(for routeID: String) -> ArrivalRouteState {
    arrivalRouteStates[routeID] ?? .idle
  }

  func waitForBackgroundSnapshotRefresh() async {
    await snapshotRefreshTask?.value
  }

  func purge() async throws {
    isPurging = true
    snapshotRefreshTask?.cancel()
    await snapshotRefreshTask?.value
    do {
      try await cache.purge()
    } catch {
      isPurging = false
      throw error
    }
    snapshotRefreshTask = nil
    tripIndexState = .idle
    workspaceStates = [:]
    briefingStates = [:]
    peopleStates = [:]
    arrivalRouteStates = [:]
    arrivalRouteRequests = [:]
    arrivalRouteTripIDs = [:]
    peopleByTripID = [:]
    planMutationState = .idle
    lastError = nil
    didStart = false
  }

  private func restoreAndRefreshTrips(forceRefresh: Bool = false) async {
    let cached = try? await cache.loadTripIndex()
    if let cached {
      tripIndexState = .loaded(cached.value, savedAt: cached.savedAt, freshness: .stale)
      scheduleAccessibleTripRefresh(cached.value.trips)
    } else {
      tripIndexState = .loading
    }

    do {
      let entityTag = forceRefresh ? nil : cached?.entityTag
      switch try await api.listTrips(ifNoneMatch: entityTag) {
      case .modified(let index, let metadata):
        guard !isPurging else { return }
        let savedAt = now()
        let snapshot = CachedTripIndex(
          value: index,
          entityTag: metadata.entityTag ?? APIClient.entityTag(forRevision: index.revision),
          savedAt: savedAt
        )
        try await cache.saveTripIndex(snapshot)
        let accessibleIDs = Set(index.trips.map(\.id))
        try await cache.retainTrips(ids: accessibleIDs)
        retainInMemoryTrips(ids: accessibleIDs)
        tripIndexState = .loaded(index, savedAt: savedAt, freshness: .fresh)
        scheduleAccessibleTripRefresh(index.trips)
        lastError = nil
      case .notModified:
        guard !isPurging else { return }
        guard let cached else { throw APIError.invalidResponse }
        let savedAt = now()
        try await cache.touchTripIndex(at: savedAt)
        tripIndexState = .loaded(cached.value, savedAt: savedAt, freshness: .fresh)
        scheduleAccessibleTripRefresh(cached.value.trips)
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
    guard !isPurging else { return }
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

  private func scheduleAccessibleTripRefresh(_ trips: [Trip]) {
    guard automaticallyRefreshAccessibleTrips else { return }
    snapshotRefreshTask?.cancel()
    snapshotRefreshTask = Task { [weak self] in
      guard let self else { return }
      await refreshAccessibleTripSnapshots(trips)
    }
  }

  private func refreshAccessibleTripSnapshots(_ trips: [Trip]) async {
    await withTaskGroup(of: Void.self) { group in
      var iterator = trips.makeIterator()
      let concurrentRefreshLimit = 3

      for _ in 0..<min(concurrentRefreshLimit, trips.count) {
        guard let trip = iterator.next() else { break }
        group.addTask { [weak self] in
          guard let self, !Task.isCancelled else { return }
          await self.refreshTripSnapshot(tripID: trip.id)
        }
      }

      while await group.next() != nil {
        guard !Task.isCancelled, let trip = iterator.next() else { continue }
        group.addTask { [weak self] in
          guard let self, !Task.isCancelled else { return }
          await self.refreshTripSnapshot(tripID: trip.id)
        }
      }
    }
  }

  private func refreshTripSnapshot(tripID: UUID) async {
    await loadWorkspace(tripID: tripID)
    guard !Task.isCancelled,
      case .loaded = workspaceState(for: tripID)
    else { return }
    await loadPeople(tripID: tripID)
    guard !Task.isCancelled,
      case .loaded = workspaceState(for: tripID)
    else { return }
    await loadBriefing(tripID: tripID)
    guard !Task.isCancelled else { return }

    guard case .loaded(let workspace, _, _) = workspaceState(for: tripID),
      case .loaded(let briefing, _, _) = briefingState(for: tripID),
      let section = briefing.sections.first,
      let request = ArrivalRouteRequest(section: section)
    else {
      return
    }
    await loadArrivalRoute(request, tripID: workspace.trip.id)
  }

  private func evictTrip(tripID: UUID, error: APIError) async {
    do {
      try await cache.removeTrip(tripID: tripID)
    } catch {
      lastError = Self.map(error)
    }
    peopleByTripID.removeValue(forKey: tripID)
    if case .loaded(let index, let savedAt, _) = tripIndexState {
      tripIndexState = .loaded(
        TripIndex(
          schemaVersion: index.schemaVersion,
          generatedAt: index.generatedAt,
          revision: index.revision,
          trips: index.trips.filter { $0.id != tripID }
        ),
        savedAt: savedAt,
        freshness: .stale
      )
    }
    peopleStates[tripID] = .failed(error)
    briefingStates[tripID] = .failed(error)
    let routeIDs = arrivalRouteTripIDs.filter { $0.value == tripID }.map(\.key)
    for routeID in routeIDs {
      arrivalRouteStates.removeValue(forKey: routeID)
      arrivalRouteRequests.removeValue(forKey: routeID)
      arrivalRouteTripIDs.removeValue(forKey: routeID)
    }
    workspaceStates[tripID] = .failed(error)
  }

  private func retainInMemoryTrips(ids: Set<UUID>) {
    workspaceStates = workspaceStates.filter { ids.contains($0.key) }
    peopleByTripID = peopleByTripID.filter { ids.contains($0.key) }
    peopleStates = peopleStates.filter { ids.contains($0.key) }
    briefingStates = briefingStates.filter { ids.contains($0.key) }
    let retainedRouteIDs = Set(
      arrivalRouteTripIDs.filter { ids.contains($0.value) }.map(\.key)
    )
    arrivalRouteStates = arrivalRouteStates.filter { retainedRouteIDs.contains($0.key) }
    arrivalRouteRequests = arrivalRouteRequests.filter { retainedRouteIDs.contains($0.key) }
    arrivalRouteTripIDs = arrivalRouteTripIDs.filter { retainedRouteIDs.contains($0.key) }
  }

  private static func map(_ error: Error) -> APIError {
    if let apiError = error as? APIError { return apiError }
    return .transport(message: String(describing: error))
  }

  private func requireOnlineMutation() throws {
    guard allowsMutations else {
      throw APIError.transport(message: "Voyage is offline and saved trips are read-only.")
    }
  }

  private static func provesWorkspaceAccessWasRevoked(_ error: APIError) -> Bool {
    guard case .server(let status, _, _, _, _, _) = error else { return false }
    return status == 403 || status == 404
  }
}
