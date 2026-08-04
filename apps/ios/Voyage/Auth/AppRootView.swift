import ClerkKit
import ClerkKitUI
import SwiftUI

struct AppRootView: View {
  let configuration: AppConfiguration

  @Environment(Clerk.self) private var clerk

  var body: some View {
    Group {
      if !clerk.isLoaded {
        ProgressView("Restoring your session…")
      } else if let user = clerk.user {
        AuthenticatedAppRoot(
          configuration: configuration,
          userID: user.id
        )
        .id(user.id)
      } else {
        AuthView(
          mode: configuration.environment == .debug ? .signInOrUp : .signIn,
          isDismissible: false
        )
        .persistsIdentifiers(false)
      }
    }
  }
}

@MainActor
private struct AuthenticatedAppRoot: View {
  @Environment(Clerk.self) private var clerk
  @State private var session: VoyageSession

  init(configuration: AppConfiguration, userID: String) {
    let api = APIClient(
      baseURL: configuration.apiBaseURL,
      tokenProvider: AuthTokenProvider { forceRefresh in
        try await ClerkSessionTokenSource.token(forceRefresh: forceRefresh)
      }
    )
    _session = State(
      initialValue: VoyageSession(
        api: api,
        cache: SnapshotCache(userID: userID)
      )
    )
  }

  var body: some View {
    VoyageShellView(session: session) {
      try await session.purge()
      try await clerk.auth.signOut()
    }
    .task {
      await session.start()
    }
  }
}

private enum ClerkSessionTokenSource {
  @MainActor
  static func token(forceRefresh: Bool) async throws -> String {
    let options = Session.GetTokenOptions(skipCache: forceRefresh)
    guard let token = try await Clerk.shared.auth.getToken(options), !token.isEmpty else {
      throw APIError.missingSession
    }
    return token
  }
}

@MainActor
struct FixtureAppRootView: View {
  @State private var session = VoyageSession(
    api: FixtureAPI(),
    cache: InMemorySnapshotCache()
  )

  var body: some View {
    VoyageShellView(session: session, onSignOut: {})
      .task {
        await session.start()
      }
  }
}

@MainActor
struct PersistentFixtureAppRootView: View {
  @State private var session: VoyageSession

  init(isOffline: Bool) {
    let api: any VoyageAPI = isOffline ? OfflineFixtureAPI() : FixtureAPI()
    _session = State(
      initialValue: VoyageSession(
        api: api,
        cache: SnapshotCache(userID: "fixture-offline")
      )
    )
  }

  var body: some View {
    VoyageShellView(session: session) {
      try await session.purge()
    }
    .task {
      await session.start()
    }
  }
}

struct ConfigurationRequiredView: View {
  var body: some View {
    ContentUnavailableView {
      Label("Clerk configuration required", systemImage: "key")
    } description: {
      Text("Copy Configuration/Local.xcconfig.example to Local.xcconfig and add Voyage’s Clerk publishable key.")
    }
    .padding()
  }
}
