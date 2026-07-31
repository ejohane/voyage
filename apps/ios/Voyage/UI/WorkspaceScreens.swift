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
      case .loaded(let workspace, _, let freshness):
        WorkspaceOverviewView(
          session: session,
          workspace: workspace,
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
  let freshness: ContentFreshness

  @State private var editorMode: PlanEditorMode?

  private var timeline: [TripTimelineEntry] {
    TripTimeline.entries(for: workspace)
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
      Section {
        TripSummaryView(trip: workspace.trip, travel: workspace.travel)
      }

      if comingUpGroups.isEmpty {
        Section("Coming Up") {
          EmptySectionRow(
            title: "Nothing else scheduled",
            systemImage: "calendar"
          )
        }
      } else {
        ForEach(comingUpGroups, id: \.date) { group in
          Section {
            ForEach(group.entries) { entry in
              TimelineNavigationRow(
                entry: entry,
                workspace: workspace,
                session: session
              )
            }
          } header: {
            ComingUpDayHeader(
              date: group.date,
              showsSectionTitle: group.date == comingUpGroups.first?.date
            )
          }
        }
      }

      Section {
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
    .scrollContentBackground(.hidden)
    .background(Color(red: 0.93, green: 0.92, blue: 0.90).ignoresSafeArea())
    .preferredColorScheme(.light)
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
  let travel: [Travel]

  var body: some View {
    TripMapCardView(trip: trip, travel: travel)
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

private struct ComingUpDayHeader: View {
  let date: LocalDate
  let showsSectionTitle: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if showsSectionTitle {
        Text("Coming Up")
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }

      Text(date.longDisplayText)
        .font(.headline)
        .foregroundStyle(.primary)
    }
    .textCase(nil)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
    .accessibilityIdentifier("coming-up.day.\(date.rawValue)")
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
  let workspace: TripWorkspace
  let session: VoyageSession

  var body: some View {
    NavigationLink {
      TimelineDestinationView(entry: entry, workspace: workspace, session: session)
    } label: {
      TimelineEntryRow(entry: entry)
    }
    .accessibilityIdentifier("timeline.entry.\(entry.id)")
  }
}

struct TimelineEntryRow: View {
  let entry: TripTimelineEntry

  var body: some View {
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
