import Foundation

struct GmailConnection: Codable, Equatable, Sendable {
  let connected: Bool
  let email: String?
  let connectedAt: String?
}

struct GmailCandidateSource: Codable, Equatable, Hashable, Sendable {
  let key: String
  let messageID: String
  let threadID: String
  let subject: String
  let sender: String
  let receivedAt: String
  let messageURL: URL

  private enum CodingKeys: String, CodingKey {
    case key
    case messageID = "messageId"
    case threadID = "threadId"
    case subject
    case sender
    case receivedAt
    case messageURL = "messageUrl"
  }
}

struct GmailStayPropertyReference: Codable, Equatable, Sendable {
  var provider: String
  var placeID: String

  private enum CodingKeys: String, CodingKey {
    case provider
    case placeID = "placeId"
  }
}

struct GmailStayBookingDetails: Codable, Equatable, Sendable {
  var checkInWindow: String?
  var checkOutWindow: String?
  var roomType: String?
  var guestSummary: String?
  var mealPlan: String?
  var cancellationSummary: String?
  var cancellationDeadline: LocalDate?
  var totalPriceText: String?
  var amenities: [StayAmenity]
}

struct GmailTravelInput: Codable, Equatable, Sendable {
  var kind: TransportationKind
  var type: TravelType
  var status: ReservationStatus
  var departureStopID: UUID?
  var arrivalStopID: UUID?
  var departureAirportID: Int?
  var arrivalAirportID: Int?
  var departureLocation: String
  var arrivalLocation: String
  var departureAt: LocalDateTime
  var arrivalAt: LocalDateTime?
  var carrier: String?
  var referenceNumber: String?
  var vehicleDescription: String?
  var confirmationNumber: String?
  var bookingURL: URL?
  var notes: String?

  private enum CodingKeys: String, CodingKey {
    case kind
    case type
    case status
    case departureStopID = "departureStopId"
    case arrivalStopID = "arrivalStopId"
    case departureAirportID = "departureAirportId"
    case arrivalAirportID = "arrivalAirportId"
    case departureLocation
    case arrivalLocation
    case departureAt
    case arrivalAt
    case carrier
    case referenceNumber
    case vehicleDescription
    case confirmationNumber
    case bookingURL = "bookingUrl"
    case notes
  }
}

struct GmailStayInput: Codable, Equatable, Sendable {
  var status: ReservationStatus
  var tripStopID: UUID?
  var propertyName: String
  var address: String
  var checkInDate: LocalDate
  var checkOutDate: LocalDate
  var confirmationNumber: String?
  var bookingURL: URL?
  var notes: String?
  var propertyReference: GmailStayPropertyReference?
  var bookingDetails: GmailStayBookingDetails?

  private enum CodingKeys: String, CodingKey {
    case status
    case tripStopID = "tripStopId"
    case propertyName
    case address
    case checkInDate
    case checkOutDate
    case confirmationNumber
    case bookingURL = "bookingUrl"
    case notes
    case propertyReference = "propertyRef"
    case bookingDetails
  }
}

struct GmailTravelCandidate: Codable, Equatable, Sendable {
  let kind: String
  let source: GmailCandidateSource
  let sources: [GmailCandidateSource]?
  let confidence: String
  let eventType: String?
  var input: GmailTravelInput
}

struct GmailStayCandidate: Codable, Equatable, Sendable {
  let kind: String
  let source: GmailCandidateSource
  let sources: [GmailCandidateSource]?
  let confidence: String
  let eventType: String?
  var input: GmailStayInput
}

enum GmailImportCandidate: Codable, Equatable, Identifiable, Sendable {
  case travel(GmailTravelCandidate)
  case stay(GmailStayCandidate)

  var id: String { source.key }

  var source: GmailCandidateSource {
    switch self {
    case .travel(let candidate): candidate.source
    case .stay(let candidate): candidate.source
    }
  }

  var sources: [GmailCandidateSource] {
    switch self {
    case .travel(let candidate): candidate.sources ?? [candidate.source]
    case .stay(let candidate): candidate.sources ?? [candidate.source]
    }
  }

  var confidence: String {
    switch self {
    case .travel(let candidate): candidate.confidence
    case .stay(let candidate): candidate.confidence
    }
  }

  var eventType: String? {
    switch self {
    case .travel(let candidate): candidate.eventType
    case .stay(let candidate): candidate.eventType
    }
  }

  private enum CodingKeys: String, CodingKey { case kind }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    switch try container.decode(String.self, forKey: .kind) {
    case "travel": self = .travel(try GmailTravelCandidate(from: decoder))
    case "stay": self = .stay(try GmailStayCandidate(from: decoder))
    default:
      throw DecodingError.dataCorruptedError(
        forKey: .kind,
        in: container,
        debugDescription: "Unsupported Gmail booking kind."
      )
    }
  }

  func encode(to encoder: Encoder) throws {
    switch self {
    case .travel(let candidate): try candidate.encode(to: encoder)
    case .stay(let candidate): try candidate.encode(to: encoder)
    }
  }
}

struct GmailScanSearchSummary: Codable, Equatable, Sendable {
  let rangeStart: LocalDate
  let rangeEnd: LocalDate
  let windowsSearched: Int
  let queriesRun: Int
  let followUpQueriesRun: Int
  let messagesDiscovered: Int
  let messagesFetched: Int
  let messagesReused: Int
  let gapsSearched: Int
  let rejections: [String: Int]
  let limitReached: Bool
  let stoppedReason: String
}

struct GmailScanResult: Codable, Equatable, Sendable {
  let candidates: [GmailImportCandidate]
  let alreadyImported: Int
  let messagesScanned: Int
  let search: GmailScanSearchSummary
}

struct GmailImportedItem: Codable, Equatable, Sendable {
  let sourceKey: String
  let kind: String
  let itemID: UUID

  private enum CodingKeys: String, CodingKey {
    case sourceKey
    case kind
    case itemID = "itemId"
  }
}

struct GmailSkippedItem: Codable, Equatable, Sendable {
  let sourceKey: String
  let reason: String
}

struct GmailImportResult: Codable, Equatable, Sendable {
  let imported: [GmailImportedItem]
  let skipped: [GmailSkippedItem]
}
