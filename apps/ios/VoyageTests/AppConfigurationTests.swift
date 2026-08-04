import Foundation
import Testing

@testable import Voyage

struct AppConfigurationTests {
  @Test
  func debugAllowsLocalHTTPAPI() {
    let configuration = AppConfiguration(
      apiBaseURL: URL(string: "http://127.0.0.1:5173")!,
      clerkPublishableKey: "pk_test_local",
      environment: .debug
    )

    #expect(configuration.isConfigured)
  }

  @Test
  func hostedEnvironmentsRequireHTTPS() {
    for environment in [VoyageEnvironment.staging, .production] {
      let configuration = AppConfiguration(
        apiBaseURL: URL(string: "http://127.0.0.1:5173")!,
        clerkPublishableKey: "pk_live_hosted",
        environment: environment
      )

      #expect(!configuration.isConfigured)
    }
  }

  @Test
  func debugRejectsNonLocalHTTPAPI() {
    let configuration = AppConfiguration(
      apiBaseURL: URL(string: "http://example.com")!,
      clerkPublishableKey: "pk_test_local",
      environment: .debug
    )

    #expect(!configuration.isConfigured)
  }

  @Test
  func hostedHTTPSAPIIsConfigured() {
    let configuration = AppConfiguration(
      apiBaseURL: URL(string: "https://voyageplan.app")!,
      clerkPublishableKey: "pk_live_hosted",
      environment: .production
    )

    #expect(configuration.isConfigured)
  }
}
