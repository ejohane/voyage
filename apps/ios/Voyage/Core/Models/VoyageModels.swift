import Foundation

protocol OpenStringValue: RawRepresentable, Codable, Hashable, Sendable where RawValue == String {}

extension OpenStringValue {
  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    let rawValue = try container.decode(String.self)
    guard let value = Self(rawValue: rawValue) else {
      throw DecodingError.dataCorruptedError(
        in: container,
        debugDescription: "Unsupported string-backed value."
      )
    }
    self = value
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }
}

struct TripAccessLevel: OpenStringValue {
  let rawValue: String

  static let owner = Self(rawValue: "owner")
  static let editor = Self(rawValue: "editor")
  static let viewer = Self(rawValue: "viewer")
}

struct ReservationStatus: OpenStringValue {
  let rawValue: String

  static let planning = Self(rawValue: "planning")
  static let booked = Self(rawValue: "booked")
}

struct TransportationKind: OpenStringValue {
  let rawValue: String

  static let journey = Self(rawValue: "journey")
  static let rental = Self(rawValue: "rental")
}

struct TravelType: OpenStringValue {
  let rawValue: String

  static let flight = Self(rawValue: "flight")
  static let train = Self(rawValue: "train")
  static let bus = Self(rawValue: "bus")
  static let drive = Self(rawValue: "drive")
  static let ferry = Self(rawValue: "ferry")
  static let car = Self(rawValue: "car")
  static let other = Self(rawValue: "other")
}

struct PlanCategory: OpenStringValue {
  let rawValue: String

  static let activity = Self(rawValue: "activity")
  static let food = Self(rawValue: "food")
  static let event = Self(rawValue: "event")
  static let sightseeing = Self(rawValue: "sightseeing")
  static let other = Self(rawValue: "other")
}

struct PlanStatus: OpenStringValue {
  let rawValue: String

  static let planned = Self(rawValue: "planned")
  static let booked = Self(rawValue: "booked")
}

struct MemberRole: OpenStringValue {
  let rawValue: String

  static let organizer = Self(rawValue: "Organizer")
  static let planner = Self(rawValue: "Planner")
  static let traveler = Self(rawValue: "Traveler")
}

struct StayAmenity: OpenStringValue {
  let rawValue: String
}

struct TripStopLocation: Codable, Equatable, Sendable {
  let provider: String
  let placeID: String
}

struct TripStop: Identifiable, Codable, Equatable, Sendable {
  let id: UUID
  let position: Int
  let name: String
  let arrivalDate: LocalDate?
  let departureDate: LocalDate?
  let location: TripStopLocation?
}

struct Trip: Identifiable, Codable, Equatable, Sendable {
  let id: UUID
  let name: String
  let startDate: LocalDate?
  let endDate: LocalDate?
  let stops: [TripStop]
  let accessLevel: TripAccessLevel
  let createdAt: String
  let updatedAt: String
}

struct Airport: Identifiable, Codable, Equatable, Sendable {
  let id: Int
  let ident: String
  let iataCode: String
  let icaoCode: String?
  let type: String
  let name: String
  let municipality: String?
  let isoCountry: String
  let isoRegion: String?
  let latitude: Double
  let longitude: Double
}

struct Travel: Identifiable, Codable, Equatable, Sendable {
  let id: UUID
  let tripID: UUID
  let kind: TransportationKind
  let type: TravelType
  let status: ReservationStatus
  let departureStopID: UUID?
  let arrivalStopID: UUID?
  let departureAirportID: Int?
  let arrivalAirportID: Int?
  let departureAirport: Airport?
  let arrivalAirport: Airport?
  let departureLocation: String
  let arrivalLocation: String
  let departureAt: LocalDateTime
  let arrivalAt: LocalDateTime?
  let carrier: String?
  let referenceNumber: String?
  let vehicleDescription: String?
  let confirmationNumber: String?
  let bookingURL: URL?
  let notes: String?
  let createdAt: String
  let updatedAt: String
}

struct StayPropertyReference: Codable, Equatable, Sendable {
  let provider: String
  let placeID: String
}

struct StayBookingDetails: Codable, Equatable, Sendable {
  let checkInWindow: String?
  let checkOutWindow: String?
  let roomType: String?
  let guestSummary: String?
  let mealPlan: String?
  let cancellationSummary: String?
  let cancellationDeadline: LocalDate?
  let totalPriceText: String?
  let amenities: [StayAmenity]
}

struct Stay: Identifiable, Codable, Equatable, Sendable {
  let id: UUID
  let tripID: UUID
  let status: ReservationStatus
  let tripStopID: UUID?
  let propertyName: String
  let address: String
  let checkInDate: LocalDate
  let checkOutDate: LocalDate
  let confirmationNumber: String?
  let bookingURL: URL?
  let notes: String?
  let propertyReference: StayPropertyReference?
  let bookingDetails: StayBookingDetails?
  let createdAt: String
  let updatedAt: String
}

struct Plan: Identifiable, Codable, Equatable, Sendable {
  let id: UUID
  let tripID: UUID
  let tripStopID: UUID
  let title: String
  let category: PlanCategory
  let status: PlanStatus
  let scheduledDate: LocalDate
  let startTime: LocalTime?
  let endTime: LocalTime?
  let location: String?
  let confirmationNumber: String?
  let bookingURL: URL?
  let notes: String?
  let revision: Int
  let createdAt: String
  let updatedAt: String
}

struct ScheduledPlanInput: Encodable, Equatable, Sendable {
  let tripStopID: UUID
  let title: String
  let category: PlanCategory
  let status: PlanStatus
  let scheduledDate: LocalDate
  let startTime: LocalTime?
  let endTime: LocalTime?
  let location: String?
  let confirmationNumber: String?
  let bookingURL: URL?
  let notes: String?

  private enum CodingKeys: String, CodingKey {
    case tripStopID = "tripStopId"
    case title
    case category
    case status
    case scheduledDate
    case startTime
    case endTime
    case location
    case confirmationNumber
    case bookingURL = "bookingUrl"
    case notes
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.container(keyedBy: CodingKeys.self)
    try container.encode(tripStopID, forKey: .tripStopID)
    try container.encode(title, forKey: .title)
    try container.encode(category, forKey: .category)
    try container.encode(status, forKey: .status)
    try container.encode(scheduledDate, forKey: .scheduledDate)
    try container.encode(startTime, forKey: .startTime)
    try container.encode(endTime, forKey: .endTime)
    try container.encode(location, forKey: .location)
    try container.encode(confirmationNumber, forKey: .confirmationNumber)
    try container.encode(bookingURL, forKey: .bookingURL)
    try container.encode(notes, forKey: .notes)
  }
}

struct TripMember: Identifiable, Codable, Equatable, Sendable {
  var id: String { userID }

  let userID: String
  let email: String?
  let displayName: String?
  let imageURL: URL?
  let role: MemberRole
  let accessLevel: TripAccessLevel
  let joinedAt: String
}

struct TripIndex: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let revision: String
  let trips: [Trip]
}

struct TripWorkspace: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let revision: String
  let trip: Trip
  let travel: [Travel]
  let stays: [Stay]
  let plans: [Plan]
}

struct TripPeople: Codable, Equatable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let members: [TripMember]
}
