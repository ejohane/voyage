import Foundation

enum APIError: LocalizedError, Equatable, Sendable {
  case missingSession
  case invalidResponse
  case transport(message: String)
  case unsupportedAPIVersion(received: String?)
  case decoding(message: String, requestID: String?)
  case server(
    status: Int,
    code: String?,
    message: String,
    fieldErrors: [String: [String]],
    currentRevision: Int?,
    requestID: String?
  )

  var errorDescription: String? {
    switch self {
    case .missingSession:
      "Your session is unavailable. Please sign in again."
    case .invalidResponse:
      "Voyage returned an invalid response."
    case .transport:
      "Voyage could not connect. Check your connection and try again."
    case .unsupportedAPIVersion:
      "This version of Voyage is no longer compatible with the server."
    case .decoding:
      "Voyage returned data this app could not read."
    case .server(_, _, let message, _, _, _):
      message
    }
  }
}

extension APIError {
  var requiresGmailReauthorization: Bool {
    guard case .server(_, let code, _, _, _, _) = self else { return false }
    return code == "gmail_reauthorization_required"
  }
}

struct APIErrorEnvelopeDTO: Decodable, Sendable {
  struct Detail: Decodable, Sendable {
    let code: String?
    let message: String?
    let fieldErrors: [String: [String]]?
    let currentRevision: Int?
  }

  let error: Detail
  let currentRevision: Int?
}
