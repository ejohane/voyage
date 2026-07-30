import SwiftUI

@MainActor
struct TripWorkspaceView: View {
  let session: VoyageSession
  let tripID: UUID

  var body: some View {
    Group {
      switch session.workspaceState(for: tripID) {
      case .idle, .loading:
        ProgressView("Loading trip…")
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .accessibilityIdentifier("workspace.loading")
      case .failed(let error):
        UnavailableStateView(
          title: "Couldn’t load this trip",
          systemImage: "exclamationmark.triangle",
          message: error.localizedDescription,
          retryTitle: "Try Again"
        ) {
          await session.loadWorkspace(tripID: tripID, forceRefresh: true)
        }
        .accessibilityIdentifier("workspace.error")
      case .loaded(let workspace, let savedAt, let freshness):
        WorkspaceOverviewView(
          session: session,
          workspace: workspace,
          savedAt: savedAt,
          freshness: freshness
        )
      }
    }
    .task(id: tripID) {
      await session.loadWorkspace(tripID: tripID)
    }
    .accessibilityIdentifier("workspace.screen")
  }
}

@MainActor
private struct WorkspaceOverviewView: View {
  let session: VoyageSession
  let workspace: TripWorkspace
  let savedAt: Date
  let freshness: ContentFreshness

  @State private var editorMode: PlanEditorMode?

  private var timeline: [TripTimelineEntry] {
    TripTimeline.entries(for: workspace)
  }

  private var todayEntries: [TripTimelineEntry] {
    let today = LocalDate.current()
    return timeline.filter { $0.date == today }
  }

  private var comingUpGroups: [(date: LocalDate, entries: [TripTimelineEntry])] {
    let today = LocalDate.current()
    return TripTimeline.upcomingGroups(in: timeline, after: today, limit: 5)
  }

  private var canEdit: Bool {
    freshness == .fresh && workspace.trip.accessLevel.canEditPlans
  }

  var body: some View {
    List {
      if freshness == .stale {
        OfflineSnapshotRow(savedAt: savedAt)
      }

      Section {
        TripSummaryView(trip: workspace.trip)
      }

      Section("Today") {
        if todayEntries.isEmpty {
          EmptySectionRow(
            title: "Nothing scheduled today",
            systemImage: "sun.max"
          )
        } else {
          ForEach(todayEntries) { entry in
            TimelineNavigationRow(entry: entry, workspace: workspace, session: session)
          }
        }
      }

      Section("Coming Up") {
        if comingUpGroups.isEmpty {
          EmptySectionRow(
            title: "Nothing else scheduled",
            systemImage: "calendar"
          )
        } else {
          ForEach(comingUpGroups, id: \.date) { group in
            ForEach(group.entries) { entry in
              TimelineNavigationRow(
                entry: entry,
                dateHeader: entry.id == group.entries.first?.id ? group.date : nil,
                workspace: workspace,
                session: session
              )
            }
          }
        }

        NavigationLink {
          ItineraryView(session: session, workspace: workspace, freshness: freshness)
        } label: {
          Label("Full Itinerary", systemImage: "list.bullet.rectangle")
        }
        .accessibilityIdentifier("workspace.itinerary")
      }

      Section("Trip Details") {
        NavigationLink {
          TravelListView(workspace: workspace)
        } label: {
          DetailNavigationLabel(
            title: "Transportation",
            value: workspace.travel.count,
            systemImage: "airplane.departure",
            tint: .blue
          )
        }
        .accessibilityIdentifier("workspace.travel")

        NavigationLink {
          StayListView(workspace: workspace)
        } label: {
          DetailNavigationLabel(
            title: "Stays",
            value: workspace.stays.count,
            systemImage: "bed.double",
            tint: .purple
          )
        }
        .accessibilityIdentifier("workspace.stays")

        NavigationLink {
          PeopleView(session: session, trip: workspace.trip)
        } label: {
          DetailNavigationLabel(
            title: "People",
            valueText: "Read-only",
            systemImage: "person.2",
            tint: .teal
          )
        }
        .accessibilityIdentifier("workspace.people")
      }

      if !workspace.trip.accessLevel.canEditPlans {
        Section {
          Label("You have view-only access to this trip.", systemImage: "eye")
            .foregroundStyle(.secondary)
        }
      } else if freshness == .stale {
        Section {
          Label("Reconnect to add or edit plans.", systemImage: "wifi.slash")
            .foregroundStyle(.secondary)
        }
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle(workspace.trip.name)
    .navigationBarTitleDisplayMode(.large)
    .refreshable {
      await session.loadWorkspace(tripID: workspace.trip.id, forceRefresh: true)
    }
    .toolbar {
      if canEdit {
        ToolbarItem(placement: .primaryAction) {
          Button {
            editorMode = .create(idempotencyKey: UUID())
          } label: {
            Label("Add Plan", systemImage: "plus")
          }
          .accessibilityIdentifier("plan.add")
        }
      }
    }
    .sheet(item: $editorMode) { mode in
      PlanEditorView(
        session: session,
        workspace: workspace,
        mode: mode
      )
    }
  }
}

private struct TripSummaryView: View {
  let trip: Trip

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if !trip.stops.isEmpty {
        Text(trip.stops.sorted(by: { $0.position < $1.position }).map(\.name).joined(separator: " → "))
          .font(.headline)
      }

      HStack(spacing: 8) {
        if let dateRange = trip.dateRangeText {
          Label(dateRange, systemImage: "calendar")
        }
        Spacer(minLength: 8)
        Text(trip.accessLevel.displayName)
          .font(.caption.weight(.medium))
          .foregroundStyle(.secondary)
      }
      .font(.subheadline)
      .foregroundStyle(.secondary)
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
  }
}

private struct EmptySectionRow: View {
  let title: String
  let systemImage: String

  var body: some View {
    Label(title, systemImage: systemImage)
      .foregroundStyle(.secondary)
      .font(.subheadline)
  }
}

private struct DetailNavigationLabel: View {
  let title: String
  let valueText: String
  let systemImage: String
  let tint: Color

  init(title: String, value: Int, systemImage: String, tint: Color) {
    self.title = title
    valueText = String(value)
    self.systemImage = systemImage
    self.tint = tint
  }

  init(title: String, valueText: String, systemImage: String, tint: Color) {
    self.title = title
    self.valueText = valueText
    self.systemImage = systemImage
    self.tint = tint
  }

  var body: some View {
    Label {
      HStack {
        Text(title)
        Spacer()
        Text(valueText)
          .foregroundStyle(.secondary)
      }
    } icon: {
      Image(systemName: systemImage)
        .foregroundStyle(tint)
    }
  }
}

struct TimelineNavigationRow: View {
  let entry: TripTimelineEntry
  let dateHeader: LocalDate?
  let workspace: TripWorkspace
  let session: VoyageSession

  init(
    entry: TripTimelineEntry,
    dateHeader: LocalDate? = nil,
    workspace: TripWorkspace,
    session: VoyageSession
  ) {
    self.entry = entry
    self.dateHeader = dateHeader
    self.workspace = workspace
    self.session = session
  }

  var body: some View {
    NavigationLink {
      TimelineDestinationView(entry: entry, workspace: workspace, session: session)
    } label: {
      TimelineEntryRow(entry: entry, dateHeader: dateHeader)
    }
    .accessibilityIdentifier("timeline.entry.\(entry.id)")
  }
}

struct TimelineEntryRow: View {
  let entry: TripTimelineEntry
  let dateHeader: LocalDate?

  init(entry: TripTimelineEntry, dateHeader: LocalDate? = nil) {
    self.entry = entry
    self.dateHeader = dateHeader
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      if let dateHeader {
        Text(dateHeader.longDisplayText)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(.secondary)
          .accessibilityHidden(true)
      }

      HStack(alignment: .top, spacing: 12) {
        Text(entry.time?.displayText ?? "Anytime")
          .font(.caption.monospacedDigit())
          .foregroundStyle(.secondary)
          .frame(width: 62, alignment: .leading)

        Image(systemName: entry.systemImage)
          .font(.subheadline)
          .foregroundStyle(entry.accent.color)
          .frame(width: 20, height: 20)
          .accessibilityHidden(true)

        VStack(alignment: .leading, spacing: 3) {
          Text(entry.title)
            .font(.body)
            .foregroundStyle(.primary)
          if let subtitle = entry.subtitle?.nilIfBlank {
            Text(subtitle)
              .font(.caption)
              .foregroundStyle(.secondary)
              .lineLimit(2)
          }
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(entry.accessibilityText)
  }
}

@MainActor
private struct TimelineDestinationView: View {
  let entry: TripTimelineEntry
  let workspace: TripWorkspace
  let session: VoyageSession

  @ViewBuilder
  var body: some View {
    switch entry.source {
    case .plan(let id):
      if let plan = workspace.plans.first(where: { $0.id == id }) {
        PlanDetailView(session: session, workspace: workspace, plan: plan)
      } else {
        MissingDetailView()
      }
    case .travel(let id):
      if let travel = workspace.travel.first(where: { $0.id == id }) {
        TravelDetailView(travel: travel)
      } else {
        MissingDetailView()
      }
    case .stay(let id):
      if let stay = workspace.stays.first(where: { $0.id == id }) {
        StayDetailView(stay: stay)
      } else {
        MissingDetailView()
      }
    }
  }
}

private struct MissingDetailView: View {
  var body: some View {
    ContentUnavailableView(
      "Item unavailable",
      systemImage: "questionmark.folder",
      description: Text("Refresh the trip and try again.")
    )
  }
}

extension TripTimelineAccent {
  var color: Color {
    switch self {
    case .flight: .blue
    case .ground: .teal
    case .stay: .purple
    case .plan: .green
    }
  }
}

extension TripTimelineEntry {
  var accessibilityText: String {
    let when = time.map { "\(date.longDisplayText), \($0.displayText)" } ?? date.longDisplayText
    return [when, title, subtitle].compactMap { $0?.nilIfBlank }.joined(separator: ", ")
  }
}
