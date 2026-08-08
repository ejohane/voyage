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
  @State private var selectedQuickAction: WorkspaceQuickAction?

  private var itineraryGroups: [(date: LocalDate, entries: [TripTimelineEntry])] {
    TripTimeline.groupedEntries(for: workspace)
  }

  private var canEdit: Bool {
    freshness == .fresh && workspace.trip.accessLevel.canEditPlans
  }

  var body: some View {
    List {
      Section {
        TripSummaryView(trip: workspace.trip, travel: workspace.travel)
      }

      Section {
        TripQuickActionsCard(
          travelCount: workspace.travel.count,
          stayCount: workspace.stays.count
        ) { action in
          selectedQuickAction = action
        }
      }
      .listRowInsets(.init(top: 0, leading: 0, bottom: 0, trailing: 0))

      if itineraryGroups.isEmpty {
        Section("Itinerary") {
          EmptySectionRow(
            title: "No itinerary yet",
            systemImage: "calendar"
          )
        }
      } else {
        ForEach(itineraryGroups, id: \.date) { group in
          Section {
            ForEach(group.entries) { entry in
              TimelineNavigationRow(
                entry: entry,
                workspace: workspace,
                session: session
              )
            }
          } header: {
            ItineraryDayHeader(
              date: group.date,
              showsSectionTitle: group.date == itineraryGroups.first?.date
            )
          }
        }
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
    .listSectionSpacing(16)
    .navigationTitle(workspace.trip.name)
    .navigationBarTitleDisplayMode(.large)
    .refreshable {
      await session.loadWorkspace(tripID: workspace.trip.id, forceRefresh: true)
    }
    .navigationDestination(item: $selectedQuickAction) { action in
      switch action {
      case .travel:
        TravelListView(workspace: workspace)
      case .stays:
        StayListView(workspace: workspace)
      case .people:
        PeopleView(session: session, trip: workspace.trip)
      case .more:
        TripDirectoryView(
          session: session,
          workspace: workspace,
          freshness: freshness
        )
      }
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

private enum WorkspaceQuickAction: String, Identifiable {
  case travel
  case stays
  case people
  case more

  var id: Self { self }
}

private struct TripQuickActionsCard: View {
  let travelCount: Int
  let stayCount: Int
  let select: (WorkspaceQuickAction) -> Void

  var body: some View {
    HStack(spacing: 0) {
      actionButton(
        title: "Travel",
        systemImage: "airplane.departure",
        tint: .blue,
        accessibilityValue: itemCountText(travelCount),
        identifier: "workspace.travel",
        action: .travel
      )

      Divider()

      actionButton(
        title: "Stays",
        systemImage: "bed.double",
        tint: .purple,
        accessibilityValue: itemCountText(stayCount),
        identifier: "workspace.stays",
        action: .stays
      )

      Divider()

      actionButton(
        title: "People",
        systemImage: "person.2",
        tint: .teal,
        accessibilityValue: "Trip members",
        identifier: "workspace.people",
        action: .people
      )

      Divider()

      actionButton(
        title: "More",
        systemImage: "ellipsis.circle",
        tint: .secondary,
        accessibilityValue: "All trip sections",
        identifier: "workspace.more",
        action: .more
      )
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 12)
  }

  private func actionButton(
    title: String,
    systemImage: String,
    tint: Color,
    accessibilityValue: String,
    identifier: String,
    action: WorkspaceQuickAction
  ) -> some View {
    Button {
      select(action)
    } label: {
      VStack(spacing: 7) {
        Image(systemName: systemImage)
          .font(.title3)
          .foregroundStyle(tint)
          .frame(height: 24)
          .accessibilityHidden(true)

        Text(title)
          .font(.caption.weight(.medium))
          .foregroundStyle(.primary)
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
      .frame(maxWidth: .infinity, minHeight: 50)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(accessibilityValue)
    .accessibilityIdentifier(identifier)
  }

  private func itemCountText(_ count: Int) -> String {
    "\(count) \(count == 1 ? "item" : "items")"
  }
}

@MainActor
private struct TripDirectoryView: View {
  let session: VoyageSession
  let workspace: TripWorkspace
  let freshness: ContentFreshness

  var body: some View {
    List {
      Section("Planning") {
        NavigationLink {
          ItineraryView(session: session, workspace: workspace, freshness: freshness)
        } label: {
          DetailNavigationLabel(
            title: "Full Itinerary",
            value: TripTimeline.entries(for: workspace).count,
            systemImage: "list.bullet.rectangle",
            tint: .green
          )
        }
        .accessibilityIdentifier("workspace.itinerary")
      }

      Section("Bookings") {
        if workspace.trip.accessLevel.canEditPlans && freshness == .fresh {
          NavigationLink {
            GmailImportView(session: session, workspace: workspace)
          } label: {
            DetailNavigationLabel(
              title: "Find Bookings",
              valueText: "Gmail",
              systemImage: "envelope.badge",
              tint: .orange
            )
          }
          .accessibilityIdentifier("directory.gmail")
        }

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
        .accessibilityIdentifier("directory.travel")

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
        .accessibilityIdentifier("directory.stays")
      }

      Section("Collaboration") {
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
        .accessibilityIdentifier("directory.people")
      }
    }
    .listStyle(.insetGrouped)
    .navigationTitle("More")
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("trip.directory")
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

private struct ItineraryDayHeader: View {
  let date: LocalDate
  let showsSectionTitle: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if showsSectionTitle {
        Text("Itinerary")
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
    .accessibilityIdentifier("itinerary.day.\(date.rawValue)")
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
