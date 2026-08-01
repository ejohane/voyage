import Foundation

@testable import Voyage

enum TestFixtures {
  private final class BundleToken {}

  static func data(named name: String) throws -> Data {
    let bundle = Bundle(for: BundleToken.self)
    let url =
      bundle.url(forResource: name, withExtension: "json")
      ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "ContractFixtures")

    guard let url else {
      throw FixtureError.missing(name: name, bundlePath: bundle.bundlePath)
    }
    return try Data(contentsOf: url)
  }

  static func tripIndex() throws -> TripIndex {
    try JSONDecoder().decode(V1TripListDTO.self, from: data(named: "trip-list")).domain
  }

  static func workspace() throws -> TripWorkspace {
    try JSONDecoder().decode(V1TripWorkspaceDTO.self, from: data(named: "trip-workspace")).domain
  }

  enum FixtureError: Error, CustomStringConvertible {
    case missing(name: String, bundlePath: String)

    var description: String {
      switch self {
      case .missing(let name, let bundlePath):
        "Missing bundled fixture \(name).json in \(bundlePath)"
      }
    }
  }
}
actor MockHTTPTransport: HTTPTransport {
  struct Stub: Sendable {
    let statusCode: Int
    let headers: [String: String]
    let data: Data

    init(statusCode: Int, headers: [String: String], data: Data = Data()) {
      self.statusCode = statusCode
      self.headers = headers
      self.data = data
    }
  }

  enum MockError: Error {
    case missingStub
  }

  private var stubs: [Stub]
  private var recordedRequests: [URLRequest] = []

  init(stubs: [Stub]) {
    self.stubs = stubs
  }

  func send(_ request: URLRequest) async throws -> HTTPTransportResponse {
    recordedRequests.append(request)
    guard !stubs.isEmpty else { throw MockError.missingStub }
    let stub = stubs.removeFirst()
    let response = HTTPURLResponse(
      url: request.url!,
      statusCode: stub.statusCode,
      httpVersion: "HTTP/1.1",
      headerFields: stub.headers
    )!
    return HTTPTransportResponse(data: stub.data, response: response)
  }

  func request(at index: Int) -> URLRequest {
    recordedRequests[index]
  }

  var requestCount: Int {
    recordedRequests.count
  }
}

extension MockHTTPTransport.Stub {
  static func v1(
    statusCode: Int,
    data: Data = Data(),
    entityTag: String? = nil,
    requestID: String = "request-test"
  ) -> Self {
    var headers = [
      "X-Voyage-API-Version": "1",
      "X-Request-ID": requestID,
    ]
    headers["ETag"] = entityTag
    return Self(statusCode: statusCode, headers: headers, data: data)
  }
}

func makePlanInput() -> ScheduledPlanInput {
  ScheduledPlanInput(
    tripStopID: UUID(uuidString: "22222222-2222-4222-8222-222222222222")!,
    title: "Visit the MAAT",
    category: .sightseeing,
    status: .planned,
    scheduledDate: LocalDate(rawValue: "2026-10-07")!,
    startTime: LocalTime(rawValue: "10:30"),
    endTime: LocalTime(rawValue: "12:00"),
    location: "Av. Brasilia, Lisbon",
    confirmationNumber: nil,
    bookingURL: URL(string: "https://tickets.example.com/maat"),
    notes: "Walk along the river afterward"
  )
}

func makePlanResponseData(revision: Int = 4) -> Data {
  Data(
    """
    {
      "plan": {
        "id": "55555555-5555-4555-8555-555555555555",
        "tripId": "11111111-1111-4111-8111-111111111111",
        "tripStopId": "22222222-2222-4222-8222-222222222222",
        "title": "Visit the MAAT",
        "category": "sightseeing",
        "status": "planned",
        "scheduledDate": "2026-10-07",
        "startTime": "10:30",
        "endTime": "12:00",
        "location": "Av. Brasilia, Lisbon",
        "confirmationNumber": null,
        "bookingUrl": "https://tickets.example.com/maat",
        "notes": "Walk along the river afterward",
        "revision": \(revision),
        "createdAt": "2026-07-23T15:00:00.000Z",
        "updatedAt": "2026-07-28T16:30:00.000Z"
      }
    }
    """.utf8
  )
}

func makeTripResponseData() -> Data {
  Data(
    """
    {
      "trip": {
        "id": "77777777-7777-4777-8777-777777777777",
        "name": "Winter in Montréal",
        "startDate": "2026-12-04",
        "endDate": "2026-12-08",
        "stops": [
          {
            "id": "88888888-8888-4888-8888-888888888888",
            "position": 0,
            "name": "Montréal, Canada",
            "arrivalDate": "2026-12-04",
            "departureDate": "2026-12-08",
            "location": null
          }
        ],
        "accessLevel": "owner",
        "createdAt": "2026-08-01T12:00:00.000Z",
        "updatedAt": "2026-08-01T12:00:00.000Z"
      }
    }
    """.utf8
  )
}

func makeLocationSuggestionsData() -> Data {
  Data(
    """
    {
      "suggestions": [
        {
          "placeId": "ChIJDbdkHFQayUwR7-8fITgxTmU",
          "label": "Montréal, Québec, Canada",
          "primaryText": "Montréal",
          "secondaryText": "Québec, Canada",
          "types": ["locality", "political", "geocode"],
          "kind": "city"
        }
      ]
    }
    """.utf8
  )
}

func makeResolvedLocationData(placeID: String) -> Data {
  Data(
    """
    {
      "location": {
        "provider": "google",
        "placeId": "\(placeID)"
      }
    }
    """.utf8
  )
}
