import SwiftUI

@MainActor
struct ArrivalBriefingStateView: View {
  let session: VoyageSession
  let workspace: TripWorkspace

  private var hasCandidateAnchors: Bool {
    workspace.travel.contains {
      $0.kind == .journey && $0.type == .flight && $0.status == .booked && $0.arrivalAt != nil
    } && workspace.stays.contains { $0.status == .booked }
  }

  var body: some View {
    switch session.briefingState(for: workspace.trip.id) {
    case .idle, .loading:
      if hasCandidateAnchors {
        Section("Arrival briefing") {
          HStack(spacing: 10) {
            ProgressView()
            Text("Connecting your arrival…")
              .foregroundStyle(.secondary)
          }
          .accessibilityIdentifier("briefing.loading")
        }
      }
    case .loaded(let briefing):
      if let arrival = briefing.sections.first {
        ArrivalBriefingSectionView(session: session, section: arrival, workspace: workspace)
      }
    case .failed:
      if hasCandidateAnchors {
        Section("Arrival briefing") {
          Button {
            Task { await session.loadBriefing(tripID: workspace.trip.id) }
          } label: {
            Label("Try loading the arrival briefing again", systemImage: "arrow.clockwise")
          }
          .accessibilityIdentifier("briefing.retry")
        }
      }
    }
  }
}

private struct ArrivalBriefingSectionView: View {
  let session: VoyageSession
  let section: ArrivalBriefingSection
  let workspace: TripWorkspace

  private var routeRequest: ArrivalRouteRequest? {
    ArrivalRouteRequest(section: section)
  }

  var body: some View {
    Section {
      ForEach(section.items) { item in
        itemView(item)
          .accessibilityIdentifier("briefing.item.\(item.id)")
      }

      ForEach(section.issues.filter { $0.code != .routeUnavailable }) { issue in
        BriefingIssueRow(issue: issue)
          .accessibilityIdentifier("briefing.issue.\(issue.code.rawValue)")
      }
    } header: {
      VStack(alignment: .leading, spacing: 8) {
        Text("Arrival briefing")
          .font(.subheadline)
          .foregroundStyle(.secondary)
        Text(section.date.longDisplayText)
          .font(.headline)
          .foregroundStyle(.primary)
      }
      .textCase(nil)
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      .accessibilityIdentifier("briefing.arrival")
    }
  }

  @ViewBuilder
  private func itemView(_ item: BriefingItem) -> some View {
    switch item {
    case .flightArrival(let flight):
      if let travel = workspace.travel.first(where: { $0.id == flight.sourceTravelID }) {
        NavigationLink {
          TravelDetailView(travel: travel)
        } label: {
          BriefingFlightRow(item: flight)
        }
      } else {
        BriefingFlightRow(item: flight)
      }
    case .rentalPickup(let rental):
      if let travel = workspace.travel.first(where: { $0.id == rental.sourceTravelID }) {
        NavigationLink {
          TravelDetailView(travel: travel)
        } label: {
          BriefingRentalRow(item: rental)
        }
      } else {
        BriefingRentalRow(item: rental)
      }
    case .driveEstimate:
      EmptyView()
    case .stayArrival(let arrival):
      if let routeRequest {
        BriefingAppleRouteStateView(session: session, request: routeRequest)
          .accessibilityIdentifier("briefing.route.\(routeRequest.id)")
      }
      if let stay = workspace.stays.first(where: { $0.id == arrival.sourceStayID }) {
        NavigationLink {
          StayDetailView(stay: stay)
        } label: {
          BriefingStayRow(item: arrival)
        }
      } else {
        BriefingStayRow(item: arrival)
      }
    }
  }
}

@MainActor
private struct BriefingAppleRouteStateView: View {
  let session: VoyageSession
  let request: ArrivalRouteRequest

  var body: some View {
    Group {
      switch session.arrivalRouteState(for: request.id) {
      case .idle, .loading:
        HStack(alignment: .top, spacing: 12) {
          ProgressView()
            .frame(width: 22, height: 22)
          VStack(alignment: .leading, spacing: 4) {
            Text("Estimating drive to \(request.destinationLabel)…")
              .foregroundStyle(.primary)
            Text("From \(request.originLabel)")
              .font(.caption)
              .foregroundStyle(.secondary)
            Text("Apple Maps")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Estimating drive to \(request.destinationLabel) with Apple Maps")
        .accessibilityIdentifier("briefing.route.loading")
      case .loaded(let estimate):
        Button {
          AppleMapsRouteLauncher.open(request, estimate: estimate)
        } label: {
          BriefingRouteRow(request: request, estimate: estimate)
        }
        .accessibilityHint("Opens driving directions in Apple Maps")
        .accessibilityIdentifier("briefing.route.loaded")
      case .failed:
        Button {
          Task { await session.loadArrivalRoute(request, forceRefresh: true) }
        } label: {
          BriefingRow(
            systemImage: "arrow.clockwise",
            tint: .teal,
            title: "Try the drive estimate again",
            detail: "Apple Maps couldn’t calculate the route to \(request.destinationLabel).",
            provenance: "Tap to retry"
          )
        }
        .accessibilityIdentifier("briefing.route.retry")
      }
    }
    .task(id: request.id) {
      await session.loadArrivalRoute(request)
    }
  }
}

private struct BriefingFlightRow: View {
  let item: BriefingFlightArrivalItem

  private var serviceText: String? {
    [item.carrier, item.referenceNumber].compactMap { $0?.nilIfBlank }.joined(separator: " · ")
      .nilIfBlank
  }

  var body: some View {
    BriefingRow(
      systemImage: "airplane.arrival",
      tint: .blue,
      title: "\(item.arrivalAt.time.displayText) — Land at \(item.airport.iataCode)",
      detail: [serviceText, item.airport.name].compactMap { $0 }.joined(separator: " · "),
      provenance: "Booked"
    )
  }
}

private struct BriefingRentalRow: View {
  let item: BriefingRentalPickupItem

  private var detail: String {
    let confirmation = item.confirmationNumber?.nilIfBlank.map { "Confirmation \($0)" }
    return [item.company?.nilIfBlank, confirmation, item.pickupLocation]
      .compactMap { $0 }
      .joined(separator: " · ")
  }

  var body: some View {
    BriefingRow(
      systemImage: "car.fill",
      tint: .teal,
      title: "\(item.pickupAt.time.displayText) — Pick up rental car",
      detail: detail,
      provenance: "Booked"
    )
  }
}

private struct BriefingRouteRow: View {
  let request: ArrivalRouteRequest
  let estimate: ArrivalRouteEstimate

  var body: some View {
    BriefingRow(
      systemImage: "arrow.triangle.turn.up.right.diamond.fill",
      tint: .teal,
      title: "About \(estimate.durationMinutes.durationText) to \(request.destinationLabel)",
      detail: "From \(request.originLabel)",
      provenance: "Estimated · Apple Maps"
    )
  }
}

private struct BriefingStayRow: View {
  let item: BriefingStayArrivalItem

  private var detail: String {
    [item.checkInWindow?.nilIfBlank.map { "Check-in \($0)" }, item.address]
      .compactMap { $0 }
      .joined(separator: " · ")
  }

  var body: some View {
    BriefingRow(
      systemImage: "bed.double.fill",
      tint: .purple,
      title: "Arrive at \(item.propertyName)",
      detail: detail,
      provenance: "Booked"
    )
  }
}

private struct BriefingRow: View {
  let systemImage: String
  let tint: Color
  let title: String
  let detail: String
  let provenance: String

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: systemImage)
        .font(.subheadline)
        .foregroundStyle(tint)
        .frame(width: 22, height: 22)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 4) {
        Text(title)
          .font(.body)
          .foregroundStyle(.primary)
        Text(detail)
          .font(.caption)
          .foregroundStyle(.secondary)
          .lineLimit(2)
        Text(provenance)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel([title, detail, provenance].joined(separator: ", "))
  }
}

private struct BriefingIssueRow: View {
  let issue: BriefingIssue

  private var text: String {
    switch issue.code {
    case .ambiguousFlight: "Choose which arrival flight belongs in this briefing."
    case .ambiguousStay: "Choose the first stay to complete this arrival."
    case .stayLocationUnresolved: "Add a complete stay location to estimate the drive."
    case .routeUnavailable: "Drive estimate unavailable right now."
    default: "This arrival needs attention."
    }
  }

  var body: some View {
    Label(text, systemImage: "exclamationmark.circle")
      .font(.subheadline)
      .foregroundStyle(.secondary)
      .accessibilityLabel("Needs attention. \(text)")
  }
}

extension Int {
  fileprivate var durationText: String {
    let hours = self / 60
    let minutes = self % 60
    if hours == 0 { return "\(minutes) min" }
    if minutes == 0 { return "\(hours) hr" }
    return "\(hours) hr \(minutes) min"
  }
}
