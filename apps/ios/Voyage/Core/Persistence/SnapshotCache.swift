import CryptoKit
import Foundation

struct CachedTripIndex: Codable, Equatable, Sendable {
  var value: TripIndex
  var entityTag: String
  var savedAt: Date
}

struct CachedWorkspace: Codable, Equatable, Sendable {
  var value: TripWorkspace
  var entityTag: String
  var savedAt: Date
}

struct CachedPeople: Codable, Equatable, Sendable {
  var value: TripPeople
  var savedAt: Date
}

struct CachedBriefing: Codable, Equatable, Sendable {
  var value: TripBriefing
  var savedAt: Date
}

struct CachedArrivalRoute: Codable, Equatable, Sendable {
  var tripID: UUID
  var request: ArrivalRouteRequest
  var estimate: ArrivalRouteEstimate
  var savedAt: Date
}

protocol SnapshotCaching: Sendable {
  func loadTripIndex() async throws -> CachedTripIndex?
  func saveTripIndex(_ snapshot: CachedTripIndex) async throws
  func touchTripIndex(at date: Date) async throws
  func loadWorkspace(tripID: UUID) async throws -> CachedWorkspace?
  func saveWorkspace(_ snapshot: CachedWorkspace) async throws
  func touchWorkspace(tripID: UUID, at date: Date) async throws
  func loadPeople(tripID: UUID) async throws -> CachedPeople?
  func savePeople(_ snapshot: CachedPeople, tripID: UUID) async throws
  func loadBriefing(tripID: UUID) async throws -> CachedBriefing?
  func saveBriefing(_ snapshot: CachedBriefing, tripID: UUID) async throws
  func loadArrivalRoute(requestID: String) async throws -> CachedArrivalRoute?
  func saveArrivalRoute(_ snapshot: CachedArrivalRoute) async throws
  func removeTrip(tripID: UUID) async throws
  func retainTrips(ids: Set<UUID>) async throws
  func purge() async throws
}

actor SnapshotCache: SnapshotCaching {
  private struct Store: Codable, Sendable {
    var version = 2
    var tripIndex: CachedTripIndex?
    var workspaces: [String: CachedWorkspace] = [:]
    var people: [String: CachedPeople] = [:]
    var briefings: [String: CachedBriefing] = [:]
    var arrivalRoutes: [String: CachedArrivalRoute] = [:]

    private enum CodingKeys: String, CodingKey {
      case version
      case tripIndex
      case workspaces
      case people
      case briefings
      case arrivalRoutes
    }

    init() {}

    init(from decoder: Decoder) throws {
      let container = try decoder.container(keyedBy: CodingKeys.self)
      version = try container.decodeIfPresent(Int.self, forKey: .version) ?? 1
      tripIndex = try container.decodeIfPresent(CachedTripIndex.self, forKey: .tripIndex)
      workspaces =
        try container.decodeIfPresent([String: CachedWorkspace].self, forKey: .workspaces) ?? [:]
      people = try container.decodeIfPresent([String: CachedPeople].self, forKey: .people) ?? [:]
      briefings =
        try container.decodeIfPresent([String: CachedBriefing].self, forKey: .briefings) ?? [:]
      arrivalRoutes =
        try container.decodeIfPresent(
          [String: CachedArrivalRoute].self,
          forKey: .arrivalRoutes
        ) ?? [:]
    }
  }

  private let directoryURL: URL
  private let fileURL: URL
  private var store: Store?

  init(userID: String, baseDirectory: URL? = nil) {
    let root =
      baseDirectory
      ?? FileManager.default.urls(
        for: .applicationSupportDirectory,
        in: .userDomainMask
      )[0]
    directoryURL = root.appending(path: "Voyage/Snapshots", directoryHint: .isDirectory)
    let digest = SHA256.hash(data: Data(userID.utf8)).map { String(format: "%02x", $0) }.joined()
    fileURL = directoryURL.appending(path: "\(digest).json")
  }

  func loadTripIndex() async throws -> CachedTripIndex? {
    try loadIfNeeded()
    return store?.tripIndex
  }

  func saveTripIndex(_ snapshot: CachedTripIndex) async throws {
    try loadIfNeeded()
    store?.tripIndex = snapshot
    try persist()
  }

  func touchTripIndex(at date: Date) async throws {
    try loadIfNeeded()
    store?.tripIndex?.savedAt = date
    try persist()
  }

  func loadWorkspace(tripID: UUID) async throws -> CachedWorkspace? {
    try loadIfNeeded()
    return store?.workspaces[tripID.uuidString.lowercased()]
  }

  func saveWorkspace(_ snapshot: CachedWorkspace) async throws {
    try loadIfNeeded()
    store?.workspaces[snapshot.value.trip.id.uuidString.lowercased()] = snapshot
    try persist()
  }

  func touchWorkspace(tripID: UUID, at date: Date) async throws {
    try loadIfNeeded()
    store?.workspaces[tripID.uuidString.lowercased()]?.savedAt = date
    try persist()
  }

  func loadPeople(tripID: UUID) async throws -> CachedPeople? {
    try loadIfNeeded()
    return store?.people[tripID.cacheKey]
  }

  func savePeople(_ snapshot: CachedPeople, tripID: UUID) async throws {
    try loadIfNeeded()
    store?.people[tripID.cacheKey] = snapshot
    try persist()
  }

  func loadBriefing(tripID: UUID) async throws -> CachedBriefing? {
    try loadIfNeeded()
    return store?.briefings[tripID.cacheKey]
  }

  func saveBriefing(_ snapshot: CachedBriefing, tripID: UUID) async throws {
    try loadIfNeeded()
    store?.briefings[tripID.cacheKey] = snapshot
    try persist()
  }

  func loadArrivalRoute(requestID: String) async throws -> CachedArrivalRoute? {
    try loadIfNeeded()
    return store?.arrivalRoutes[requestID]
  }

  func saveArrivalRoute(_ snapshot: CachedArrivalRoute) async throws {
    try loadIfNeeded()
    store?.arrivalRoutes[snapshot.request.id] = snapshot
    try persist()
  }

  func removeTrip(tripID: UUID) async throws {
    try loadIfNeeded()
    guard var updated = store else { return }
    if var tripIndex = updated.tripIndex {
      let value = tripIndex.value
      tripIndex.value = TripIndex(
        schemaVersion: value.schemaVersion,
        generatedAt: value.generatedAt,
        revision: value.revision,
        trips: value.trips.filter { $0.id != tripID }
      )
      updated.tripIndex = tripIndex
    }
    updated.workspaces.removeValue(forKey: tripID.cacheKey)
    updated.people.removeValue(forKey: tripID.cacheKey)
    updated.briefings.removeValue(forKey: tripID.cacheKey)
    updated.arrivalRoutes = updated.arrivalRoutes.filter { $0.value.tripID != tripID }
    store = updated
    try persist()
  }

  func retainTrips(ids: Set<UUID>) async throws {
    try loadIfNeeded()
    guard var updated = store else { return }
    let keys = Set(ids.map(\.cacheKey))
    updated.workspaces = updated.workspaces.filter { keys.contains($0.key) }
    updated.people = updated.people.filter { keys.contains($0.key) }
    updated.briefings = updated.briefings.filter { keys.contains($0.key) }
    updated.arrivalRoutes = updated.arrivalRoutes.filter { ids.contains($0.value.tripID) }
    store = updated
    try persist()
  }

  func purge() async throws {
    if FileManager.default.fileExists(atPath: fileURL.path) {
      try FileManager.default.removeItem(at: fileURL)
    }
    store = Store()
  }

  private func loadIfNeeded() throws {
    guard store == nil else { return }
    guard FileManager.default.fileExists(atPath: fileURL.path) else {
      store = Store()
      return
    }

    do {
      let data = try Data(contentsOf: fileURL)
      var decoded = try JSONDecoder().decode(Store.self, from: data)
      guard (1...2).contains(decoded.version) else {
        store = Store()
        try? FileManager.default.removeItem(at: fileURL)
        return
      }
      decoded.version = 2
      store = decoded
    } catch {
      store = Store()
      try? FileManager.default.removeItem(at: fileURL)
    }
  }

  private func persist() throws {
    guard let store else { return }
    try prepareDirectory()
    let data = try JSONEncoder().encode(store)
    try data.write(
      to: fileURL,
      options: [.atomic, .completeFileProtection]
    )
    try excludeFromBackup(fileURL)
  }

  private func prepareDirectory() throws {
    try FileManager.default.createDirectory(
      at: directoryURL,
      withIntermediateDirectories: true,
      attributes: [.protectionKey: FileProtectionType.complete]
    )
    try FileManager.default.setAttributes(
      [.protectionKey: FileProtectionType.complete],
      ofItemAtPath: directoryURL.path
    )
    try excludeFromBackup(directoryURL)
  }

  private func excludeFromBackup(_ url: URL) throws {
    var mutableURL = url
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try mutableURL.setResourceValues(values)
  }
}

actor InMemorySnapshotCache: SnapshotCaching {
  private var tripIndex: CachedTripIndex?
  private var workspaces: [UUID: CachedWorkspace] = [:]
  private var people: [UUID: CachedPeople] = [:]
  private var briefings: [UUID: CachedBriefing] = [:]
  private var arrivalRoutes: [String: CachedArrivalRoute] = [:]

  func loadTripIndex() async throws -> CachedTripIndex? {
    tripIndex
  }

  func saveTripIndex(_ snapshot: CachedTripIndex) async throws {
    tripIndex = snapshot
  }

  func touchTripIndex(at date: Date) async throws {
    tripIndex?.savedAt = date
  }

  func loadWorkspace(tripID: UUID) async throws -> CachedWorkspace? {
    workspaces[tripID]
  }

  func saveWorkspace(_ snapshot: CachedWorkspace) async throws {
    workspaces[snapshot.value.trip.id] = snapshot
  }

  func touchWorkspace(tripID: UUID, at date: Date) async throws {
    workspaces[tripID]?.savedAt = date
  }

  func loadPeople(tripID: UUID) async throws -> CachedPeople? {
    people[tripID]
  }

  func savePeople(_ snapshot: CachedPeople, tripID: UUID) async throws {
    people[tripID] = snapshot
  }

  func loadBriefing(tripID: UUID) async throws -> CachedBriefing? {
    briefings[tripID]
  }

  func saveBriefing(_ snapshot: CachedBriefing, tripID: UUID) async throws {
    briefings[tripID] = snapshot
  }

  func loadArrivalRoute(requestID: String) async throws -> CachedArrivalRoute? {
    arrivalRoutes[requestID]
  }

  func saveArrivalRoute(_ snapshot: CachedArrivalRoute) async throws {
    arrivalRoutes[snapshot.request.id] = snapshot
  }

  func removeTrip(tripID: UUID) async throws {
    if var tripIndex {
      let value = tripIndex.value
      tripIndex.value = TripIndex(
        schemaVersion: value.schemaVersion,
        generatedAt: value.generatedAt,
        revision: value.revision,
        trips: value.trips.filter { $0.id != tripID }
      )
      self.tripIndex = tripIndex
    }
    workspaces.removeValue(forKey: tripID)
    people.removeValue(forKey: tripID)
    briefings.removeValue(forKey: tripID)
    arrivalRoutes = arrivalRoutes.filter { $0.value.tripID != tripID }
  }

  func retainTrips(ids: Set<UUID>) async throws {
    workspaces = workspaces.filter { ids.contains($0.key) }
    people = people.filter { ids.contains($0.key) }
    briefings = briefings.filter { ids.contains($0.key) }
    arrivalRoutes = arrivalRoutes.filter { ids.contains($0.value.tripID) }
  }

  func purge() async throws {
    tripIndex = nil
    workspaces = [:]
    people = [:]
    briefings = [:]
    arrivalRoutes = [:]
  }
}

extension UUID {
  fileprivate var cacheKey: String { uuidString.lowercased() }
}
