import ClerkKit
import SwiftUI

@main
struct VoyageApp: App {
  private let configuration = AppConfiguration.current
  private let launchMode = AppLaunchMode.current

  init() {
    if launchMode == .live, configuration.isConfigured {
      Clerk.configure(publishableKey: configuration.clerkPublishableKey)
    }
  }

  var body: some Scene {
    WindowGroup {
      PrivacyShield {
        rootView
      }
    }
  }

  @ViewBuilder
  private var rootView: some View {
    switch launchMode {
    case .fixture:
      FixtureAppRootView()
    case .cachedFixture:
      PersistentFixtureAppRootView(isOffline: false)
    case .offlineFixture:
      PersistentFixtureAppRootView(isOffline: true)
    case .live:
      if configuration.isConfigured {
        AppRootView(configuration: configuration)
          .environment(Clerk.shared)
          .onOpenURL { url in
            Task { try? await Clerk.shared.handle(url) }
          }
      } else {
        ConfigurationRequiredView()
      }
    }
  }
}

private struct PrivacyShield<Content: View>: View {
  @Environment(\.scenePhase) private var scenePhase

  @ViewBuilder let content: Content

  var body: some View {
    content
      .overlay {
        if scenePhase != .active {
          Color(.systemBackground)
            .ignoresSafeArea()
        }
      }
  }
}
