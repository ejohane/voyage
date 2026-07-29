import SwiftUI

@MainActor
struct VoyageShellView: View {
  let session: VoyageSession
  let onSignOut: () async throws -> Void

  @State private var selectedTab = AppTab.trips
  @State private var tripsRouter = AppRouter()

  var body: some View {
    TabView(selection: $selectedTab) {
      Tab("Trips", systemImage: "suitcase", value: .trips) {
        NavigationStack(path: $tripsRouter.path) {
          TripsView(session: session)
            .navigationTitle("Trips")
            .navigationDestination(for: AppRoute.self) { route in
              switch route {
              case .workspace(let tripID):
                TripWorkspaceView(session: session, tripID: tripID)
              }
            }
        }
        .environment(tripsRouter)
      }

      Tab("Settings", systemImage: "gearshape", value: .settings) {
        NavigationStack {
          SettingsView(onSignOut: onSignOut)
            .navigationTitle("Settings")
        }
      }
    }
  }
}

@MainActor
private struct TripsView: View {
  let session: VoyageSession

  var body: some View {
    content
      .refreshable {
        await session.refreshTrips()
      }
      .accessibilityIdentifier("trips.screen")
  }

  @ViewBuilder
  private var content: some View {
    switch session.tripIndexState {
    case .idle, .loading:
      ProgressView("Loading trips…")
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityIdentifier("trips.loading")
    case .failed(let error):
      UnavailableStateView(
        title: "Couldn’t load trips",
        systemImage: "wifi.exclamationmark",
        message: error.localizedDescription,
        retryTitle: "Try Again"
      ) {
        await session.refreshTrips()
      }
      .accessibilityIdentifier("trips.error")
    case .loaded(let index, let savedAt, let freshness):
      if index.trips.isEmpty {
        ContentUnavailableView(
          "No trips yet",
          systemImage: "suitcase",
          description: Text(
            freshness == .stale
              ? "Your saved trips are available offline, but this snapshot is empty."
              : "Trips created on the web will appear here."
          )
        )
        .accessibilityIdentifier("trips.empty")
      } else {
        List {
          if freshness == .stale {
            OfflineSnapshotRow(savedAt: savedAt)
          }

          ForEach(index.trips) { trip in
            NavigationLink(value: AppRoute.workspace(tripID: trip.id)) {
              TripRow(trip: trip)
            }
            .accessibilityIdentifier("trip.row.\(trip.id.uuidString.lowercased())")
          }
        }
        .listStyle(.insetGrouped)
        .accessibilityIdentifier("trips.list")
      }
    }
  }
}

private struct TripRow: View {
  let trip: Trip

  private var status: TripTemporalStatus {
    TripTemporalStatus(trip: trip, today: .current())
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(alignment: .firstTextBaseline) {
        Text(trip.name)
          .font(.headline)
          .foregroundStyle(.primary)

        Spacer(minLength: 8)

        if status == .now {
          Text("Now")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.green)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(.green.opacity(0.12), in: Capsule())
        }
      }

      if !trip.stops.isEmpty {
        Text(trip.stops.sorted(by: { $0.position < $1.position }).map(\.name).joined(separator: " · "))
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }

      HStack(spacing: 6) {
        if let dateRange = trip.dateRangeText {
          Text(dateRange)
        }
        if trip.dateRangeText != nil {
          Text("·")
        }
        Text(trip.accessLevel.displayName)
      }
      .font(.caption)
      .foregroundStyle(.secondary)
    }
    .padding(.vertical, 3)
    .accessibilityElement(children: .combine)
  }
}

private enum TripTemporalStatus {
  case upcoming
  case now
  case past
  case undated

  init(trip: Trip, today: LocalDate) {
    guard let start = trip.startDate, let end = trip.endDate else {
      self = .undated
      return
    }
    if today < start {
      self = .upcoming
    } else if today > end {
      self = .past
    } else {
      self = .now
    }
  }
}

private struct SettingsView: View {
  let onSignOut: () async throws -> Void

  @State private var isSigningOut = false
  @State private var errorMessage: String?

  private var versionText: String {
    let values = Bundle.main.infoDictionary ?? [:]
    let version = values["CFBundleShortVersionString"] as? String ?? "—"
    let build = values["CFBundleVersion"] as? String ?? "—"
    return "\(version) (\(build))"
  }

  private var environmentText: String {
    let value = Bundle.main.object(forInfoDictionaryKey: "VoyageEnvironment") as? String
    return (value ?? "production").capitalized
  }

  var body: some View {
    List {
      Section("Voyage") {
        LabeledContent("Version", value: versionText)
        LabeledContent("Environment", value: environmentText)
      }

      Section {
        Button("Sign Out", role: .destructive) {
          Task { await signOut() }
        }
        .disabled(isSigningOut)
        .accessibilityIdentifier("settings.sign-out")
      } footer: {
        Text("Signing out removes this account’s offline trip snapshots from this iPhone.")
      }
    }
    .overlay {
      if isSigningOut {
        ProgressView("Signing out…")
          .padding()
          .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
      }
    }
    .alert(
      "Couldn’t sign out",
      isPresented: Binding(
        get: { errorMessage != nil },
        set: { if !$0 { errorMessage = nil } }
      )
    ) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(errorMessage ?? "Please try again.")
    }
    .accessibilityIdentifier("settings.screen")
  }

  @MainActor
  private func signOut() async {
    isSigningOut = true
    defer { isSigningOut = false }
    do {
      try await onSignOut()
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

struct OfflineSnapshotRow: View {
  let savedAt: Date

  var body: some View {
    Section {
      Label {
        VStack(alignment: .leading, spacing: 2) {
          Text("Offline snapshot")
          Text("Saved \(savedAt.formatted(date: .abbreviated, time: .shortened))")
            .font(.caption)
            .foregroundStyle(.secondary)
        }
      } icon: {
        Image(systemName: "wifi.slash")
          .foregroundStyle(.orange)
      }
      .accessibilityIdentifier("content.offline-snapshot")
    }
  }
}

struct UnavailableStateView: View {
  let title: String
  let systemImage: String
  let message: String
  let retryTitle: String
  let retry: () async -> Void

  @State private var isRetrying = false

  var body: some View {
    ContentUnavailableView {
      Label(title, systemImage: systemImage)
    } description: {
      Text(message)
    } actions: {
      Button(retryTitle) {
        Task {
          isRetrying = true
          await retry()
          isRetrying = false
        }
      }
      .buttonStyle(.borderedProminent)
      .disabled(isRetrying)
    }
  }
}

extension Trip {
  var dateRangeText: String? {
    switch (startDate, endDate) {
    case (.some(let start), .some(let end)):
      "\(start.displayText) – \(end.displayText)"
    case (.some(let start), .none):
      "From \(start.displayText)"
    case (.none, .some(let end)):
      "Through \(end.displayText)"
    case (.none, .none):
      nil
    }
  }
}
