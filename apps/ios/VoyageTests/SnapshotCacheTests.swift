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

  @Test("Removing a trip preserves other trips and accounts")
  func removeTripIsScopedToTripAndAccount() async throws {
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
    try await userA.removeTrip(tripID: firstWorkspace.trip.id)

    let reloadedUserA = SnapshotCache(userID: "user-a", baseDirectory: directory)
    let reloadedUserB = SnapshotCache(userID: "user-b", baseDirectory: directory)
    let retainedIndex = try #require(try await reloadedUserA.loadTripIndex())
    #expect(retainedIndex.entityTag == indexSnapshot.entityTag)
    #expect(retainedIndex.savedAt == indexSnapshot.savedAt)
    #expect(try await reloadedUserA.loadWorkspace(tripID: firstWorkspace.trip.id) == nil)
    #expect(
      retainedIndex.value.trips.contains {
        $0.id == firstWorkspace.trip.id
      } == false
    )
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

  @Test("Extended trip snapshots round-trip and retention removes every inaccessible value")
  func extendedSnapshotsRoundTripAndRetention() async throws {
    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }

    let workspace = try TestFixtures.workspace()
    let secondTripID = UUID(uuidString: "77777777-7777-4777-8777-777777777777")!
    let secondWorkspace = replacingTripID(workspace, with: secondTripID)
    let people = try TestFixtures.people()
    let briefing = try TestFixtures.briefing()
    let routeRequest = try #require(
      briefing.sections.first.flatMap(ArrivalRouteRequest.init(section:))
    )
    let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
    let route = CachedArrivalRoute(
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
    let cache = SnapshotCache(userID: "extended-user", baseDirectory: directory)

    try await cache.saveWorkspace(
      CachedWorkspace(
        value: workspace,
        entityTag: APIClient.entityTag(forRevision: workspace.revision),
        savedAt: savedAt
      )
    )
    try await cache.saveWorkspace(
      CachedWorkspace(
        value: secondWorkspace,
        entityTag: APIClient.entityTag(forRevision: secondWorkspace.revision),
        savedAt: savedAt
      )
    )
    let peopleSnapshot = CachedPeople(value: people, savedAt: savedAt)
    let briefingSnapshot = CachedBriefing(value: briefing, savedAt: savedAt)
    try await cache.savePeople(peopleSnapshot, tripID: workspace.trip.id)
    try await cache.saveBriefing(briefingSnapshot, tripID: workspace.trip.id)
    try await cache.saveArrivalRoute(route)

    let reloaded = SnapshotCache(userID: "extended-user", baseDirectory: directory)
    #expect(try await reloaded.loadPeople(tripID: workspace.trip.id) == peopleSnapshot)
    #expect(try await reloaded.loadBriefing(tripID: workspace.trip.id) == briefingSnapshot)
    #expect(try await reloaded.loadArrivalRoute(requestID: routeRequest.id) == route)

    try await reloaded.retainTrips(ids: [secondTripID])

    let retained = SnapshotCache(userID: "extended-user", baseDirectory: directory)
    #expect(try await retained.loadWorkspace(tripID: workspace.trip.id) == nil)
    #expect(try await retained.loadPeople(tripID: workspace.trip.id) == nil)
    #expect(try await retained.loadBriefing(tripID: workspace.trip.id) == nil)
    #expect(try await retained.loadArrivalRoute(requestID: routeRequest.id) == nil)
    #expect(try await retained.loadWorkspace(tripID: secondTripID)?.value == secondWorkspace)
  }

  @Test("Version one stores migrate additively when extended data is saved")
  func versionOneMigration() async throws {
    struct VersionOneStore: Codable {
      let version: Int
      let tripIndex: CachedTripIndex
      let workspaces: [String: CachedWorkspace]
    }

    let directory = try temporaryDirectory()
    defer { try? FileManager.default.removeItem(at: directory) }
    let userID = "version-one-user"
    let index = try TestFixtures.tripIndex()
    let workspace = try TestFixtures.workspace()
    let savedAt = Date(timeIntervalSince1970: 1_800_000_000)
    let indexSnapshot = CachedTripIndex(
      value: index,
      entityTag: APIClient.entityTag(forRevision: index.revision),
      savedAt: savedAt
    )
    let workspaceSnapshot = CachedWorkspace(
      value: workspace,
      entityTag: APIClient.entityTag(forRevision: workspace.revision),
      savedAt: savedAt
    )
    let fileURL = snapshotFileURL(baseDirectory: directory, userID: userID)
    try FileManager.default.createDirectory(
      at: fileURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    try JSONEncoder().encode(
      VersionOneStore(
        version: 1,
        tripIndex: indexSnapshot,
        workspaces: [workspace.trip.id.uuidString.lowercased(): workspaceSnapshot]
      )
    ).write(to: fileURL, options: .atomic)

    let cache = SnapshotCache(userID: userID, baseDirectory: directory)
    #expect(try await cache.loadTripIndex() == indexSnapshot)
    #expect(try await cache.loadWorkspace(tripID: workspace.trip.id) == workspaceSnapshot)

    let people = CachedPeople(value: try TestFixtures.people(), savedAt: savedAt)
    try await cache.savePeople(people, tripID: workspace.trip.id)

    let encoded = try JSONSerialization.jsonObject(with: Data(contentsOf: fileURL))
    let object = try #require(encoded as? [String: Any])
    #expect(object["version"] as? Int == 2)
    #expect(try await cache.loadPeople(tripID: workspace.trip.id) == people)
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
