import Foundation
import Testing

@testable import Voyage

struct TripTimelineTests {
  @Test("Combined itinerary emits every travel, stay, and scheduled plan milestone")
  func canonicalTimelineCoverage() throws {
    let workspace = try TestFixtures.workspace()
    let entries = TripTimeline.entries(for: workspace)

    #expect(entries.count == 7)
    #expect(entries.filter { $0.source == .plan(workspace.plans[0].id) }.count == 1)
    #expect(entries.filter { $0.source == .stay(workspace.stays[0].id) }.count == 2)
    #expect(entries.filter { $0.source == .travel(workspace.travel[0].id) }.count == 2)
    #expect(entries.filter { $0.source == .travel(workspace.travel[1].id) }.count == 2)
    #expect(entries.contains { $0.title.hasPrefix("Pick up") })
    #expect(entries.contains { $0.title.hasPrefix("Return") })
  }

  @Test("Timeline sorts dates, then timed entries before untimed entries")
  func timelineOrdering() throws {
    let workspace = try TestFixtures.workspace()
    let entries = TripTimeline.entries(for: workspace)

    #expect(entries.map(\.date) == entries.map(\.date).sorted())

    let octoberFifth = entries.filter { $0.date == LocalDate(rawValue: "2026-10-05") }
    #expect(octoberFifth.count == 2)
    #expect(octoberFifth[0].time?.rawValue == "08:10")
    #expect(octoberFifth[1].time == nil)
  }

  @Test("Upcoming preview groups five entries by day and preserves overnight boundaries")
  func upcomingPreviewGrouping() throws {
    let workspace = try TestFixtures.workspace()
    let entries = Array(TripTimeline.entries(for: workspace).reversed())
    let groups = TripTimeline.upcomingGroups(
      in: entries,
      after: try #require(LocalDate(rawValue: "2026-10-03")),
      limit: 5
    )
    let departure = try #require(groups.first?.entries.first)
    let arrival = try #require(groups.dropFirst().first?.entries.first)

    #expect(groups.flatMap(\.entries).count == 5)
    #expect(
      groups.map(\.date.rawValue)
        == ["2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"]
    )
    #expect(departure.source == .travel(workspace.travel[0].id))
    #expect(arrival.source == .travel(workspace.travel[0].id))
    #expect(departure.title == "United Airlines UA 942")
    #expect(arrival.title == "Arrive in LIS · Lisbon")
  }

  @Test("Current local day follows the supplied calendar without changing API values")
  func localDayAcrossTimeZones() throws {
    let instant = try #require(ISO8601DateFormatter().date(from: "2026-10-05T00:30:00Z"))
    var tokyo = Calendar(identifier: .gregorian)
    tokyo.timeZone = try #require(TimeZone(identifier: "Asia/Tokyo"))
    var chicago = Calendar(identifier: .gregorian)
    chicago.timeZone = try #require(TimeZone(identifier: "America/Chicago"))

    #expect(LocalDate.current(at: instant, calendar: tokyo).rawValue == "2026-10-05")
    #expect(LocalDate.current(at: instant, calendar: chicago).rawValue == "2026-10-04")
    #expect(LocalDate(rawValue: "2026-10-05")?.rawValue == "2026-10-05")
  }
}
