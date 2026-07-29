import Foundation

enum TripTimelineSource: Hashable, Sendable {
  case plan(UUID)
  case travel(UUID)
  case stay(UUID)
}

enum TripTimelineAccent: Int, Comparable, Sendable {
  case flight
  case ground
  case stay
  case plan

  static func < (lhs: TripTimelineAccent, rhs: TripTimelineAccent) -> Bool {
    lhs.rawValue < rhs.rawValue
  }
}

struct TripTimelineEntry: Identifiable, Hashable, Sendable {
  let id: String
  let date: LocalDate
  let time: LocalTime?
  let title: String
  let subtitle: String?
  let systemImage: String
  let accent: TripTimelineAccent
  let source: TripTimelineSource
}

enum TripTimeline {
  static func entries(for workspace: TripWorkspace) -> [TripTimelineEntry] {
    var entries = workspace.plans.map(planEntry)
    entries.append(contentsOf: workspace.travel.flatMap(travelEntries))
    entries.append(contentsOf: workspace.stays.flatMap(stayEntries))
    return entries.sorted(by: areInDisplayOrder)
  }

  static func groupedEntries(
    for workspace: TripWorkspace
  ) -> [(date: LocalDate, entries: [TripTimelineEntry])] {
    let grouped = Dictionary(grouping: entries(for: workspace), by: \TripTimelineEntry.date)
    return grouped.keys.sorted().map { date in
      (date, grouped[date] ?? [])
    }
  }

  private static func planEntry(_ plan: Plan) -> TripTimelineEntry {
    TripTimelineEntry(
      id: "plan-\(plan.id.uuidString.lowercased())",
      date: plan.scheduledDate,
      time: plan.startTime,
      title: plan.title,
      subtitle: plan.location,
      systemImage: plan.category.systemImage,
      accent: .plan,
      source: .plan(plan.id)
    )
  }

  private static func travelEntries(_ travel: Travel) -> [TripTimelineEntry] {
    let isRental = travel.kind == .rental
    let accent: TripTimelineAccent = travel.type == .flight ? .flight : .ground
    let outboundTitle = isRental ? "Pick up \(travel.type.displayName.lowercased())" : departureTitle(for: travel)
    var values = [
      TripTimelineEntry(
        id: "travel-\(travel.id.uuidString.lowercased())-departure",
        date: travel.departureAt.date,
        time: travel.departureAt.time,
        title: outboundTitle,
        subtitle: routeSubtitle(for: travel),
        systemImage: travel.type.systemImage,
        accent: accent,
        source: .travel(travel.id)
      )
    ]

    if let arrival = travel.arrivalAt {
      values.append(
        TripTimelineEntry(
          id: "travel-\(travel.id.uuidString.lowercased())-arrival",
          date: arrival.date,
          time: arrival.time,
          title: isRental ? "Return \(travel.type.displayName.lowercased())" : "Arrive in \(travel.arrivalLocation)",
          subtitle: isRental ? travel.arrivalLocation : nil,
          systemImage: isRental ? "key.fill" : "mappin.and.ellipse",
          accent: accent,
          source: .travel(travel.id)
        )
      )
    }
    return values
  }

  private static func stayEntries(_ stay: Stay) -> [TripTimelineEntry] {
    [
      TripTimelineEntry(
        id: "stay-\(stay.id.uuidString.lowercased())-check-in",
        date: stay.checkInDate,
        time: nil,
        title: "Check in to \(stay.propertyName)",
        subtitle: stay.bookingDetails?.checkInWindow ?? stay.address,
        systemImage: "bed.double.fill",
        accent: .stay,
        source: .stay(stay.id)
      ),
      TripTimelineEntry(
        id: "stay-\(stay.id.uuidString.lowercased())-check-out",
        date: stay.checkOutDate,
        time: nil,
        title: "Check out of \(stay.propertyName)",
        subtitle: stay.bookingDetails?.checkOutWindow,
        systemImage: "door.left.hand.open",
        accent: .stay,
        source: .stay(stay.id)
      ),
    ]
  }

  private static func departureTitle(for travel: Travel) -> String {
    let carrierReference = [travel.carrier, travel.referenceNumber]
      .compactMap { $0?.nilIfBlank }
      .joined(separator: " ")
    return carrierReference.isEmpty ? "Depart \(travel.departureLocation)" : carrierReference
  }

  private static func routeSubtitle(for travel: Travel) -> String {
    "\(travel.departureLocation) to \(travel.arrivalLocation)"
  }

  private static func areInDisplayOrder(
    _ lhs: TripTimelineEntry,
    _ rhs: TripTimelineEntry
  ) -> Bool {
    if lhs.date != rhs.date { return lhs.date < rhs.date }
    switch (lhs.time, rhs.time) {
    case (.some(let left), .some(let right)) where left != right:
      return left < right
    case (.some, .none):
      return true
    case (.none, .some):
      return false
    default:
      if lhs.accent != rhs.accent { return lhs.accent < rhs.accent }
      return lhs.id < rhs.id
    }
  }
}

extension LocalDate {
  static func current(at date: Date = Date(), calendar: Calendar = .current) -> LocalDate {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return LocalDate(
      rawValue: String(
        format: "%04d-%02d-%02d",
        components.year ?? 1970,
        components.month ?? 1,
        components.day ?? 1
      )
    )!
  }

  var displayText: String {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.dateStyle = .medium
    formatter.timeStyle = .none
    return formatter.string(from: utcDate)
  }

  var longDisplayText: String {
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.calendar = Calendar(identifier: .gregorian)
    formatter.timeZone = TimeZone(secondsFromGMT: 0)
    formatter.setLocalizedDateFormatFromTemplate("EEEE, MMMM d")
    return formatter.string(from: utcDate)
  }

  private var utcDate: Date {
    let parts = rawValue.split(separator: "-").compactMap { Int($0) }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return calendar.date(
      from: DateComponents(year: parts[0], month: parts[1], day: parts[2])
    )!
  }
}

extension LocalTime {
  var displayText: String {
    let parts = rawValue.split(separator: ":").compactMap { Int($0) }
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    let date = calendar.date(
      from: DateComponents(year: 2001, month: 1, day: 1, hour: parts[0], minute: parts[1])
    )!
    let formatter = DateFormatter()
    formatter.locale = .current
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    formatter.timeStyle = .short
    formatter.dateStyle = .none
    return formatter.string(from: date)
  }
}

extension String {
  var nilIfBlank: String? {
    let value = trimmingCharacters(in: .whitespacesAndNewlines)
    return value.isEmpty ? nil : value
  }
}

extension TravelType {
  var displayName: String {
    switch self {
    case .flight: "Flight"
    case .train: "Train"
    case .bus: "Bus"
    case .drive: "Drive"
    case .ferry: "Ferry"
    case .car: "Car"
    default: rawValue.capitalized
    }
  }

  var systemImage: String {
    switch self {
    case .flight: "airplane"
    case .train: "train.side.front.car"
    case .bus: "bus.fill"
    case .ferry: "ferry.fill"
    case .drive, .car: "car.fill"
    default: "arrow.triangle.swap"
    }
  }
}

extension PlanCategory {
  var displayName: String {
    rawValue.capitalized
  }

  var systemImage: String {
    switch self {
    case .food: "fork.knife"
    case .event: "ticket.fill"
    case .sightseeing: "binoculars.fill"
    case .activity: "figure.walk"
    default: "calendar"
    }
  }
}

extension ReservationStatus {
  var displayName: String { rawValue.capitalized }
}

extension PlanStatus {
  var displayName: String { rawValue.capitalized }
}

extension TripAccessLevel {
  var canEditPlans: Bool { self == .owner || self == .editor }
  var displayName: String { rawValue.capitalized }
}
