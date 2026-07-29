import Foundation

struct APIResponseMetadata: Equatable, Sendable {
  let entityTag: String?
  let requestID: String?
}

enum APIReadResult<Value: Sendable>: Sendable {
  case modified(Value, metadata: APIResponseMetadata)
  case notModified(metadata: APIResponseMetadata)
}

protocol VoyageAPI: Sendable {
  func listTrips(ifNoneMatch: String?) async throws -> APIReadResult<TripIndex>
  func workspace(tripID: UUID, ifNoneMatch: String?) async throws -> APIReadResult<TripWorkspace>
  func people(tripID: UUID) async throws -> TripPeople
  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan
  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan
  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws
}

struct AuthTokenProvider: Sendable {
  private let operation: @Sendable () async throws -> String

  init(operation: @escaping @Sendable () async throws -> String) {
    self.operation = operation
  }

  func token() async throws -> String {
    try await operation()
  }
}

struct HTTPTransportResponse: @unchecked Sendable {
  let data: Data
  let response: HTTPURLResponse
}

protocol HTTPTransport: Sendable {
  func send(_ request: URLRequest) async throws -> HTTPTransportResponse
}

struct URLSessionTransport: HTTPTransport {
  let session: URLSession

  static let live: URLSessionTransport = {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.urlCache = nil
    configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
    configuration.httpCookieStorage = nil
    configuration.httpShouldSetCookies = false
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 60
    return URLSessionTransport(session: URLSession(configuration: configuration))
  }()

  func send(_ request: URLRequest) async throws -> HTTPTransportResponse {
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
    return HTTPTransportResponse(data: data, response: http)
  }
}

actor APIClient: VoyageAPI {
  static let version = 1

  private let baseURL: URL
  private let tokenProvider: AuthTokenProvider
  private let transport: any HTTPTransport
  private let decoder: JSONDecoder
  private let encoder: JSONEncoder

  init(
    baseURL: URL,
    tokenProvider: AuthTokenProvider,
    transport: any HTTPTransport = URLSessionTransport.live
  ) {
    self.baseURL = baseURL
    self.tokenProvider = tokenProvider
    self.transport = transport
    decoder = JSONDecoder()
    encoder = JSONEncoder()
  }

  func listTrips(ifNoneMatch: String? = nil) async throws -> APIReadResult<TripIndex> {
    let result: APIReadResult<V1TripListDTO> = try await get(
      path: "/api/v1/trips",
      ifNoneMatch: ifNoneMatch
    )
    return try result.mapValidated { dto, metadata in
      try Self.validateEnvelope(
        schemaVersion: dto.schemaVersion,
        revision: dto.revision,
        metadata: metadata
      )
      return dto.domain
    }
  }

  func workspace(
    tripID: UUID,
    ifNoneMatch: String? = nil
  ) async throws -> APIReadResult<TripWorkspace> {
    let result: APIReadResult<V1TripWorkspaceDTO> = try await get(
      path: "/api/v1/trips/\(tripID.uuidString.lowercased())/workspace",
      ifNoneMatch: ifNoneMatch
    )
    return try result.mapValidated { dto, metadata in
      try Self.validateEnvelope(
        schemaVersion: dto.schemaVersion,
        revision: dto.revision,
        metadata: metadata
      )
      return dto.domain
    }
  }

  func people(tripID: UUID) async throws -> TripPeople {
    let result: APIReadResult<V1TripPeopleDTO> = try await get(
      path: "/api/v1/trips/\(tripID.uuidString.lowercased())/people",
      ifNoneMatch: nil
    )
    switch result {
    case .modified(let dto, _):
      guard dto.schemaVersion == Self.version else {
        throw APIError.unsupportedAPIVersion(received: String(dto.schemaVersion))
      }
      return dto.domain
    case .notModified:
      throw APIError.invalidResponse
    }
  }

  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    let (response, metadata): (V1PlanResponseDTO, APIResponseMetadata) = try await mutate(
      path: "/api/v1/trips/\(tripID.uuidString.lowercased())/plans",
      method: "POST",
      body: try encode(input),
      headers: ["Idempotency-Key": idempotencyKey.uuidString.lowercased()],
      expectedStatus: 201
    )
    return try Self.validate(
      plan: response.plan.domain,
      tripID: tripID,
      planID: nil,
      metadata: metadata
    )
  }

  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan {
    guard expectedRevision > 0 else { throw APIError.invalidResponse }
    let (response, metadata): (V1PlanResponseDTO, APIResponseMetadata) = try await mutate(
      path: "/api/v1/trips/\(tripID.uuidString.lowercased())/plans/\(planID.uuidString.lowercased())",
      method: "PATCH",
      body: try encode(input),
      headers: ["If-Match": "\"\(expectedRevision)\""],
      expectedStatus: 200
    )
    return try Self.validate(
      plan: response.plan.domain,
      tripID: tripID,
      planID: planID,
      metadata: metadata
    )
  }

  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws {
    guard expectedRevision > 0 else { throw APIError.invalidResponse }
    try await mutateWithoutResponse(
      path: "/api/v1/trips/\(tripID.uuidString.lowercased())/plans/\(planID.uuidString.lowercased())",
      method: "DELETE",
      headers: ["If-Match": "\"\(expectedRevision)\""]
    )
  }

  static func entityTag(forRevision revision: String) -> String {
    "\"\(revision)\""
  }

  private func get<Response: Decodable & Sendable>(
    path: String,
    ifNoneMatch: String?
  ) async throws -> APIReadResult<Response> {
    let token = try await tokenProvider.token()
    guard !token.isEmpty else { throw APIError.missingSession }

    var request = URLRequest(
      url: endpoint(path: path),
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 30
    )
    request.httpMethod = "GET"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(String(Self.version), forHTTPHeaderField: "X-Voyage-API-Version")
    request.setValue(UUID().uuidString.lowercased(), forHTTPHeaderField: "X-Request-ID")
    if let ifNoneMatch {
      request.setValue(ifNoneMatch, forHTTPHeaderField: "If-None-Match")
    }

    let transportResponse: HTTPTransportResponse
    do {
      transportResponse = try await transport.send(request)
    } catch let error as APIError {
      throw error
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw APIError.transport(message: String(describing: error))
    }

    let response = transportResponse.response
    let metadata = APIResponseMetadata(
      entityTag: response.value(forHTTPHeaderField: "ETag"),
      requestID: response.value(forHTTPHeaderField: "X-Request-ID")
    )
    guard let requestID = metadata.requestID, !requestID.isEmpty else {
      throw APIError.invalidResponse
    }
    try validateVersionHeader(response)

    if response.statusCode == 304 {
      guard metadata.entityTag != nil else { throw APIError.invalidResponse }
      return .notModified(metadata: metadata)
    }

    guard (200..<300).contains(response.statusCode) else {
      throw serverError(
        status: response.statusCode,
        data: transportResponse.data,
        requestID: requestID
      )
    }

    do {
      return .modified(try decoder.decode(Response.self, from: transportResponse.data), metadata: metadata)
    } catch {
      throw APIError.decoding(
        message: String(describing: error),
        requestID: requestID
      )
    }
  }

  private func mutate<Response: Decodable & Sendable>(
    path: String,
    method: String,
    body: Data,
    headers: [String: String],
    expectedStatus: Int
  ) async throws -> (Response, APIResponseMetadata) {
    var request = try await authorizedRequest(path: path, method: method)
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    for header in headers {
      request.setValue(header.value, forHTTPHeaderField: header.key)
    }

    let transportResponse = try await perform(request)
    let metadata = try responseMetadata(transportResponse.response)
    try validateVersionHeader(transportResponse.response)
    guard transportResponse.response.statusCode == expectedStatus else {
      if (200..<300).contains(transportResponse.response.statusCode) {
        throw APIError.invalidResponse
      }
      throw serverError(
        status: transportResponse.response.statusCode,
        data: transportResponse.data,
        requestID: metadata.requestID
      )
    }

    do {
      return (try decoder.decode(Response.self, from: transportResponse.data), metadata)
    } catch {
      throw APIError.decoding(message: String(describing: error), requestID: metadata.requestID)
    }
  }

  private func mutateWithoutResponse(
    path: String,
    method: String,
    headers: [String: String]
  ) async throws {
    var request = try await authorizedRequest(path: path, method: method)
    for header in headers {
      request.setValue(header.value, forHTTPHeaderField: header.key)
    }

    let transportResponse = try await perform(request)
    let metadata = try responseMetadata(transportResponse.response)
    try validateVersionHeader(transportResponse.response)
    guard transportResponse.response.statusCode == 204 else {
      if !(200..<300).contains(transportResponse.response.statusCode) {
        throw serverError(
          status: transportResponse.response.statusCode,
          data: transportResponse.data,
          requestID: metadata.requestID
        )
      }
      throw APIError.invalidResponse
    }
  }

  private func authorizedRequest(path: String, method: String) async throws -> URLRequest {
    let token = try await tokenProvider.token()
    guard !token.isEmpty else { throw APIError.missingSession }

    var request = URLRequest(
      url: endpoint(path: path),
      cachePolicy: .reloadIgnoringLocalCacheData,
      timeoutInterval: 30
    )
    request.httpMethod = method
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue(String(Self.version), forHTTPHeaderField: "X-Voyage-API-Version")
    request.setValue(UUID().uuidString.lowercased(), forHTTPHeaderField: "X-Request-ID")
    return request
  }

  private func perform(_ request: URLRequest) async throws -> HTTPTransportResponse {
    do {
      return try await transport.send(request)
    } catch let error as APIError {
      throw error
    } catch is CancellationError {
      throw CancellationError()
    } catch {
      throw APIError.transport(message: String(describing: error))
    }
  }

  private func encode<Value: Encodable>(_ value: Value) throws -> Data {
    do {
      return try encoder.encode(value)
    } catch {
      throw APIError.invalidResponse
    }
  }

  private func endpoint(path: String) -> URL {
    let relativePath = path.hasPrefix("/") ? String(path.dropFirst()) : path
    return baseURL.appending(path: relativePath)
  }

  private func validateVersionHeader(_ response: HTTPURLResponse) throws {
    let receivedVersion = response.value(forHTTPHeaderField: "X-Voyage-API-Version")
    guard receivedVersion == String(Self.version) else {
      throw APIError.unsupportedAPIVersion(received: receivedVersion)
    }
  }

  private func responseMetadata(_ response: HTTPURLResponse) throws -> APIResponseMetadata {
    let metadata = APIResponseMetadata(
      entityTag: response.value(forHTTPHeaderField: "ETag"),
      requestID: response.value(forHTTPHeaderField: "X-Request-ID")
    )
    guard let requestID = metadata.requestID, !requestID.isEmpty else {
      throw APIError.invalidResponse
    }
    return metadata
  }

  private func serverError(status: Int, data: Data, requestID: String?) -> APIError {
    let payload = try? decoder.decode(APIErrorEnvelopeDTO.self, from: data)
    return .server(
      status: status,
      code: payload?.error.code,
      message: payload?.error.message ?? HTTPURLResponse.localizedString(forStatusCode: status),
      fieldErrors: payload?.error.fieldErrors ?? [:],
      currentRevision: payload?.error.currentRevision ?? payload?.currentRevision,
      requestID: requestID
    )
  }

  private static func validateEnvelope(
    schemaVersion: Int,
    revision: String,
    metadata: APIResponseMetadata
  ) throws {
    guard schemaVersion == version else {
      throw APIError.unsupportedAPIVersion(received: String(schemaVersion))
    }
    guard revision.count == 64,
      revision.allSatisfy({ $0.isHexDigit && !$0.isUppercase })
    else {
      throw APIError.invalidResponse
    }
    guard metadata.entityTag == entityTag(forRevision: revision) else {
      throw APIError.invalidResponse
    }
  }

  private static func validate(
    plan: Plan,
    tripID: UUID,
    planID: UUID?,
    metadata: APIResponseMetadata
  ) throws -> Plan {
    guard plan.revision > 0,
      plan.tripID == tripID,
      planID == nil || plan.id == planID,
      metadata.entityTag == "\"\(plan.revision)\""
    else {
      throw APIError.invalidResponse
    }
    return plan
  }
}

extension APIReadResult {
  fileprivate func mapValidated<Mapped: Sendable>(
    _ transform: (Value, APIResponseMetadata) throws -> Mapped
  ) rethrows -> APIReadResult<Mapped> {
    switch self {
    case .modified(let value, let metadata):
      .modified(try transform(value, metadata), metadata: metadata)
    case .notModified(let metadata):
      .notModified(metadata: metadata)
    }
  }
}
