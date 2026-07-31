import CryptoKit
import Foundation
import Testing

@testable import Voyage

struct SnapshotCacheTests {
  @Test("Snapshots are isolated by account and purge affects only that account")
  func accountIsolationAndPurge() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let index = try TestFixtures.tripIndex()
    let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
    let snapshot = CachedTripIndex(
      value: index,
      entityTag: APIClient.entityTag(forRevision: index.revision),
      savedAt: savedAt
    )
    let userA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    let userB = SnapshotCache(userID: "user-b", baseDirectory: directory)

    try await userA.saveTripIndex(snapshot)
    #expect(try await userA.loadTripIndex() == snapshot)
    #expect(try await userB.loadTripIndex() == nil)

    let reloadedUserA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    #expect(try await reloadedUserA.loadTripIndex() == snapshot)

    let workspace = try TestFixtures.workspace()
    let workspaceSnapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    try await userB.saveWorkspace(workspaceSnapshot)
    try await reloadedUserA.purge()

    let afterPurgeA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    let afterPurgeB = SnapshotCache(userID: "user-b", baseDirectory: directory)
    #expect(try await afterPurgeA.loadTripIndex() == nil)
    #expect(try await afterPurgeB.loadWorkspace(tripID: workspace.trip.id) == workspaceSnapshot)
  }

  @Test("Removing a workspace preserves other trips and accounts")
  func removeWorkspaceIsScopedToTripAndAccount() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let index = try TestFixtures.tripIndex()
    let firstWorkspace = try TestFixtures.workspace()
    let secondTripID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
    let secondWorkspace = replacingTripID(firstWorkspace, with: secondTripID)
    let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
    let indexSnapshot = CachedTripIndex(
      value: index,
      entityTag: APIClient.entityTag(forRevision: index.revision),
      savedAt: savedAt
    )
    let firstSnapshot = CachedWorkspace(
      value: firstWorkspace,
      entityTag: APIClient.entityTag(forRevision: firstWorkspace.revision),
      savedAt: savedAt
    )
    let secondSnapshot = CachedWorkspace(
      value: secondWorkspace,
      entityTag: APIClient.entityTag(forRevision: secondWorkspace.revision),
      savedAt: savedAt.addingTimeInterval(1)
    )
    let userA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    let userB = SnapshotCache(userID: "user-b", baseDirectory: directory)

    try await userA.saveTripIndex(indexSnapshot)
    try await userA.saveWorkspace(firstSnapshot)
    try await userA.saveWorkspace(secondSnapshot)
    try await userB.saveWorkspace(firstSnapshot)
    try await userA.removeWorkspace(tripID: firstWorkspace.trip.id)

    let reloadedUserA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    let reloadedUserB = SnapshotCache(userID: "user-b", baseDirectory: directory)
    #expect(try await reloadedUserA.loadTripIndex() == indexSnapshot)
    #expect(try await reloadedUserA.loadWorkspace(tripID: firstWorkspace.trip.id) == nil)
    #expect(try await reloadedUserA.loadWorkspace(tripID: secondTripID) == secondSnapshot)
    #expect(try await reloadedUserB.loadWorkspace(tripID: firstWorkspace.trip.id) == firstSnapshot)
  }

  @Test("A corrupt account snapshot is discarded without affecting other accounts")
  func corruptRecovery() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let index = try TestFixtures.tripIndex()
    let snapshot = CachedTripIndex(
      value: index,
      entityTag: APIClient.entityTag(forRevision: index.revision),
      savedAt: Date(timeIntervalSince1970: 1_800_000_000)
    )
    let corruptUserID = "corrupt-user"
    let healthyUserID = "healthy-user"
    let corruptCache = SnapshotCache(userID: corruptUserID, baseDirectory: directory)
    let healthyCache = SnapshotCache(userID: healthyUserID, baseDirectory: directory)
    try await corruptCache.saveTripIndex(snapshot)
    try await healthyCache.saveTripIndex(snapshot)

    let corruptFile = snapshotFileURL(baseDirectory: directory, userID: corruptUserID)
    try Data("not-json".utf8).write(to: corruptFile, options: .atomic)

    let recovered = SnapshotCache(userID: corruptUserID, baseDirectory: directory)
    #expect(try await recovered.loadTripIndex() == nil)
    #expect(!FileManager.default.fileExists(atPath: corruptFile.path))

    let healthyReloaded = SnapshotCache(userID: healthyUserID, baseDirectory: directory)
    #expect(try await healthyReloaded.loadTripIndex() == snapshot)
  }

  private func temporaryDirectory() throws -> URL {
    let url = FileManager.default.temporaryDirectory
      .appending(path: "VoyageTests-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
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
      travel: workspace.travel,
      stays: workspace.stays,
      plans: workspace.plans
    )
  }

  private func snapshotFileURL(baseDirectory: URL, userID: String) -> URL {
    let digest = SHA256.hash(data: Data(userID.utf8))
      .map { String(format: "%02x", $0) }
      .joined()
    return
      baseDirectory
      .appending(path: "Voyage/Snapshots", directoryHint: .isDirectory)
      .appending(path: "\(digest).json")
  }
}
