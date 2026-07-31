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

protocol SnapshotCaching: Sendable {
  func loadTripIndex() async throws -> CachedTripIndex?
  func saveTripIndex(_ snapshot: CachedTripIndex) async throws
  func touchTripIndex(at date: Date) async throws
  func loadWorkspace(tripID: UUID) async throws -> CachedWorkspace?
  func saveWorkspace(_ snapshot: CachedWorkspace) async throws
  func touchWorkspace(tripID: UUID, at date: Date) async throws
  func removeWorkspace(tripID: UUID) async throws
  func purge() async throws
}

actor SnapshotCache: SnapshotCaching {
  private struct Store: Codable, Sendable {
    var version = 1
    var tripIndex: CachedTripIndex?
    var workspaces: [String: CachedWorkspace] = [:]
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

  func removeWorkspace(tripID: UUID) async throws {
    try loadIfNeeded()
    guard store?.workspaces.removeValue(forKey: tripID.uuidString.lowercased()) != nil else {
      return
    }
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
      let decoded = try JSONDecoder().decode(Store.self, from: data)
      store = decoded.version == 1 ? decoded : Store()
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

  func removeWorkspace(tripID: UUID) async throws {
    workspaces.removeValue(forKey: tripID)
  }

  func purge() async throws {
    tripIndex = nil
    workspaces = [:]
  }
}
