import Foundation

enum VoyageEnvironment: String, Sendable {
  case debug
  case staging
  case production
}

struct AppConfiguration: Sendable {
  let apiBaseURL: URL
  let clerkPublishableKey: String
  let environment: VoyageEnvironment

  var isConfigured: Bool {
    guard apiBaseURL.scheme == "https", apiBaseURL.host != nil else { return false }
    return clerkPublishableKey.hasPrefix("pk_")
      && !clerkPublishableKey.contains("replace_")
  }

  static let current: AppConfiguration = {
    let values = Bundle.main.infoDictionary ?? [:]
    let apiURLString = values["VoyageAPIBaseURL"] as? String ?? ""
    let key = values["VoyageClerkPublishableKey"] as? String ?? ""
    let environmentValue = values["VoyageEnvironment"] as? String ?? "production"
    return AppConfiguration(
      apiBaseURL: URL(string: apiURLString) ?? URL(string: "https://voyageplan.app")!,
      clerkPublishableKey: key.trimmingCharacters(in: .whitespacesAndNewlines),
      environment: VoyageEnvironment(rawValue: environmentValue) ?? .production
    )
  }()
}

enum AppLaunchMode {
  case live
  case fixture
  case cachedFixture
  case offlineFixture

  static var current: AppLaunchMode {
    #if DEBUG || STAGING
      let process = ProcessInfo.processInfo
      if process.arguments.contains("-voyage-fixture-mode")
        || process.environment["VOYAGE_FIXTURE_MODE"] == "1"
      {
        return .fixture
      }
      if process.arguments.contains("-voyage-cache-fixture-mode") {
        return .cachedFixture
      }
      if process.arguments.contains("-voyage-offline-fixture-mode") {
        return .offlineFixture
      }
    #endif
    return .live
  }
}
