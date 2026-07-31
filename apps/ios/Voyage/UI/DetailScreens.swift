import SwiftUI
import UIKit
import UniformTypeIdentifiers

@MainActor
struct ItineraryView: View {
  let session: VoyageSession
  let workspace: TripWorkspace
  let freshness: ContentFreshness

  @State private var editorMode: PlanEditorMode?

  private var groups: [(date: LocalDate, entries: [TripTimelineEntry])] {
    TripTimeline.groupedEntries(for: workspace)
  }

  private var canEdit: Bool {
    freshness == .fresh && workspace.trip.accessLevel.canEditPlans
  }

  var body: some View {
    Group {
      if groups.isEmpty {
        ContentUnavailableView(
          "No itinerary yet",
          systemImage: "calendar.badge.plus",
          description: Text(
            canEdit
              ? "Add a scheduled plan, or add travel and stays on the web."
              : "Travel, stays, and scheduled plans will appear here."
          )
        )
      } else {
        List {
          if freshness == .stale {
            Section {
              Label("Offline snapshot — editing is unavailable", systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
            }
          }

          ForEach(groups, id: \.date) { group in
            Section(group.date.longDisplayText) {
              ForEach(group.entries) { entry in
                TimelineNavigationRow(
                  entry: entry,
                  workspace: workspace,
                  session: session
                )
              }
            }
          }
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle("Itinerary")
    .toolbar {
      if canEdit {
        ToolbarItem(placement: .primaryAction) {
          Button {
            editorMode = .create(idempotencyKey: UUID())
          } label: {
            Label("Add Plan", systemImage: "plus")
          }
          .accessibilityIdentifier("itinerary.add-plan")
        }
      }
    }
    .sheet(item: $editorMode) { mode in
      PlanEditorView(session: session, workspace: workspace, mode: mode)
    }
    .accessibilityIdentifier("itinerary.screen")
  }
}

struct TravelListView: View {
  let workspace: TripWorkspace

  var body: some View {
    Group {
      if workspace.travel.isEmpty {
        ContentUnavailableView(
          "No transportation",
          systemImage: "airplane.departure",
          description: Text("Transportation added on the web will appear here.")
        )
      } else {
        List(workspace.travel.sorted(by: { $0.departureAt < $1.departureAt })) { travel in
          NavigationLink {
            TravelDetailView(travel: travel)
          } label: {
            TravelRow(travel: travel)
          }
          .accessibilityIdentifier("travel.row.\(travel.id.uuidString.lowercased())")
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle("Transportation")
    .accessibilityIdentifier("travel.list")
  }
}

private struct TravelRow: View {
  let travel: Travel

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: travel.type.systemImage)
        .foregroundStyle(travel.type == .flight ? .blue : .teal)
        .frame(width: 24)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(travel.type.displayName)
            .font(.headline)
          Spacer()
          StatusText(text: travel.status.displayName)
        }
        Text("\(travel.departureLocation) → \(travel.arrivalLocation)")
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
        Text("\(travel.departureAt.date.displayText) at \(travel.departureAt.time.displayText)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
  }
}

struct TravelDetailView: View {
  let travel: Travel

  var body: some View {
    List {
      Section {
        LabeledContent("Type", value: travel.type.displayName)
        LabeledContent("Status", value: travel.status.displayName)
      }

      Section("Route") {
        DetailValueRow(
          label: travel.kind == .rental ? "Pickup" : "Departure",
          value: travel.departureLocation,
          secondary: "\(travel.departureAt.date.displayText) at \(travel.departureAt.time.displayText)"
        )
        DetailValueRow(
          label: travel.kind == .rental ? "Return" : "Arrival",
          value: travel.arrivalLocation,
          secondary: travel.arrivalAt.map {
            "\($0.date.displayText) at \($0.time.displayText)"
          }
        )
      }

      if travel.carrier != nil || travel.referenceNumber != nil || travel.vehicleDescription != nil {
        Section("Service") {
          OptionalLabeledContent(label: "Carrier", value: travel.carrier)
          OptionalLabeledContent(label: "Reference", value: travel.referenceNumber)
          OptionalLabeledContent(label: "Vehicle", value: travel.vehicleDescription)
        }
      }

      if travel.confirmationNumber != nil || travel.bookingURL != nil {
        Section("Booking") {
          if let confirmation = travel.confirmationNumber?.nilIfBlank {
            CopyValueRow(label: "Confirmation", value: confirmation)
          }
          if let bookingURL = travel.bookingURL {
            Link(destination: bookingURL) {
              Label("Open Booking", systemImage: "arrow.up.right.square")
            }
          }
        }
      }

      if let notes = travel.notes?.nilIfBlank {
        Section("Notes") {
          Text(notes)
            .textSelection(.enabled)
        }
      }
    }
    .navigationTitle(travel.type.displayName)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("travel.detail")
  }
}

struct StayListView: View {
  let workspace: TripWorkspace

  var body: some View {
    Group {
      if workspace.stays.isEmpty {
        ContentUnavailableView(
          "No stays",
          systemImage: "bed.double",
          description: Text("Stays added on the web will appear here.")
        )
      } else {
        List(workspace.stays.sorted(by: { $0.checkInDate < $1.checkInDate })) { stay in
          NavigationLink {
            StayDetailView(stay: stay)
          } label: {
            StayRow(stay: stay)
          }
          .accessibilityIdentifier("stay.row.\(stay.id.uuidString.lowercased())")
        }
        .listStyle(.insetGrouped)
      }
    }
    .navigationTitle("Stays")
    .accessibilityIdentifier("stay.list")
  }
}

private struct StayRow: View {
  let stay: Stay

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: "bed.double.fill")
        .foregroundStyle(.purple)
        .frame(width: 24)
        .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 5) {
        HStack {
          Text(stay.propertyName)
            .font(.headline)
          Spacer()
          StatusText(text: stay.status.displayName)
        }
        Text(stay.address)
          .font(.subheadline)
          .foregroundStyle(.secondary)
          .lineLimit(2)
        Text("\(stay.checkInDate.displayText) – \(stay.checkOutDate.displayText)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
  }
}

struct StayDetailView: View {
  let stay: Stay

  private var mapURL: URL? {
    var components = URLComponents(string: "https://maps.apple.com/")
    components?.queryItems = [URLQueryItem(name: "q", value: stay.address)]
    return components?.url
  }

  var body: some View {
    List {
      Section {
        LabeledContent("Status", value: stay.status.displayName)
        LabeledContent("Check-in", value: stay.checkInDate.displayText)
        LabeledContent("Check-out", value: stay.checkOutDate.displayText)
      }

      Section("Property") {
        DetailValueRow(label: "Address", value: stay.address)
        if let mapURL {
          Link(destination: mapURL) {
            Label("Open in Maps", systemImage: "map")
          }
        }
      }

      if let details = stay.bookingDetails {
        Section("Stay Details") {
          OptionalLabeledContent(label: "Check-in window", value: details.checkInWindow)
          OptionalLabeledContent(label: "Check-out window", value: details.checkOutWindow)
          OptionalLabeledContent(label: "Room", value: details.roomType)
          OptionalLabeledContent(label: "Guests", value: details.guestSummary)
          OptionalLabeledContent(label: "Meal plan", value: details.mealPlan)
          OptionalLabeledContent(label: "Total", value: details.totalPriceText)
          if let summary = details.cancellationSummary?.nilIfBlank {
            DetailValueRow(
              label: "Cancellation",
              value: summary,
              secondary: details.cancellationDeadline.map { "Deadline: \($0.displayText)" }
            )
          }
          if !details.amenities.isEmpty {
            DetailValueRow(
              label: "Amenities",
              value: details.amenities.map { $0.rawValue.replacingOccurrences(of: "_", with: " ").capitalized }
                .joined(separator: ", ")
            )
          }
        }
      }

      if stay.confirmationNumber != nil || stay.bookingURL != nil {
        Section("Booking") {
          if let confirmation = stay.confirmationNumber?.nilIfBlank {
            CopyValueRow(label: "Confirmation", value: confirmation)
          }
          if let bookingURL = stay.bookingURL {
            Link(destination: bookingURL) {
              Label("Open Booking", systemImage: "arrow.up.right.square")
            }
          }
        }
      }

      if let notes = stay.notes?.nilIfBlank {
        Section("Notes") {
          Text(notes)
            .textSelection(.enabled)
        }
      }
    }
    .navigationTitle(stay.propertyName)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("stay.detail")
  }
}

@MainActor
struct PeopleView: View {
  let session: VoyageSession
  let trip: Trip

  @State private var isLoading = true

  private var people: TripPeople? {
    session.peopleByTripID[trip.id]
  }

  var body: some View {
    Group {
      if let people {
        if people.members.isEmpty {
          ContentUnavailableView(
            "No people",
            systemImage: "person.2",
            description: Text("Trip members will appear here.")
          )
        } else {
          List(people.members) { member in
            PersonRow(member: member)
          }
          .listStyle(.insetGrouped)
        }
      } else if isLoading {
        ProgressView("Loading people…")
      } else {
        UnavailableStateView(
          title: "Couldn’t load people",
          systemImage: "person.crop.circle.badge.exclamationmark",
          message: session.lastError?.localizedDescription ?? "Check your connection and try again.",
          retryTitle: "Try Again"
        ) {
          await loadPeople()
        }
      }
    }
    .navigationTitle("People")
    .task(id: trip.id) {
      await loadPeople()
    }
    .accessibilityIdentifier("people.screen")
  }

  private func loadPeople() async {
    isLoading = true
    await session.loadPeople(tripID: trip.id)
    isLoading = false
  }
}

private struct PersonRow: View {
  let member: TripMember

  private var displayName: String {
    member.displayName?.nilIfBlank ?? member.email?.nilIfBlank ?? "Voyage traveler"
  }

  var body: some View {
    HStack(spacing: 12) {
      ZStack {
        Circle()
          .fill(.quaternary)
        Text(displayName.prefix(1).uppercased())
          .font(.headline)
          .foregroundStyle(.secondary)
      }
      .frame(width: 42, height: 42)
      .accessibilityHidden(true)

      VStack(alignment: .leading, spacing: 3) {
        Text(displayName)
          .font(.headline)
        if let email = member.email?.nilIfBlank, email != displayName {
          Text(email)
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .textSelection(.enabled)
        }
        Text("\(member.role.rawValue) · \(member.accessLevel.displayName)")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(.vertical, 2)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("person.row.\(member.userID)")
  }
}

private struct StatusText: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption.weight(.medium))
      .foregroundStyle(.secondary)
  }
}

private struct DetailValueRow: View {
  let label: String
  let value: String
  let secondary: String?

  init(label: String, value: String, secondary: String? = nil) {
    self.label = label
    self.value = value
    self.secondary = secondary
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(label)
        .font(.caption)
        .foregroundStyle(.secondary)
      Text(value)
        .textSelection(.enabled)
      if let secondary = secondary?.nilIfBlank {
        Text(secondary)
          .font(.subheadline)
          .foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

private struct OptionalLabeledContent: View {
  let label: String
  let value: String?

  var body: some View {
    if let value = value?.nilIfBlank {
      LabeledContent(label, value: value)
    }
  }
}

private struct CopyValueRow: View {
  let label: String
  let value: String

  @State private var copied = false

  var body: some View {
    Button {
      UIPasteboard.general.setItems(
        [[UTType.plainText.identifier: value]],
        options: [
          .localOnly: true,
          .expirationDate: Date().addingTimeInterval(5 * 60),
        ]
      )
      copied = true
    } label: {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(label)
            .font(.caption)
            .foregroundStyle(.secondary)
          Text(value)
            .foregroundStyle(.primary)
        }
        Spacer()
        Label(copied ? "Copied" : "Copy", systemImage: copied ? "checkmark" : "doc.on.doc")
          .font(.caption)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Copy \(label), \(value)")
  }
}
