import AuthenticationServices
import UIKit

@MainActor
protocol GmailAuthorizing: AnyObject {
  func authorize(at authorizationURL: URL) async throws -> URL
}

enum GmailAuthorizationError: LocalizedError {
  case couldNotStart
  case invalidCallback

  var errorDescription: String? {
    switch self {
    case .couldNotStart: "Voyage could not open Google sign-in."
    case .invalidCallback: "Google sign-in did not return to Voyage correctly."
    }
  }
}

@MainActor
final class GmailAuthorizationSession: NSObject, GmailAuthorizing,
  ASWebAuthenticationPresentationContextProviding
{
  private var session: ASWebAuthenticationSession?

  func authorize(at authorizationURL: URL) async throws -> URL {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        let session = ASWebAuthenticationSession(
          url: authorizationURL,
          callback: .customScheme("app.voyage.native")
        ) { [weak self] callbackURL, error in
          Task { @MainActor in
            self?.session = nil
            if let error {
              continuation.resume(throwing: error)
            } else if let callbackURL {
              continuation.resume(returning: callbackURL)
            } else {
              continuation.resume(throwing: GmailAuthorizationError.invalidCallback)
            }
          }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        guard session.start() else {
          self.session = nil
          continuation.resume(throwing: GmailAuthorizationError.couldNotStart)
          return
        }
      }
    } onCancel: {
      Task { @MainActor [weak self] in self?.session?.cancel() }
    }
  }

  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap(\.windows)
      .first(where: \.isKeyWindow)
      ?? ASPresentationAnchor()
  }
}
