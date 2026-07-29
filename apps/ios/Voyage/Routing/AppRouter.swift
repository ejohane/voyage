import Foundation
import Observation

enum AppTab: Hashable, CaseIterable, Identifiable {
  case trips
  case settings

  var id: Self { self }
}

enum AppRoute: Hashable {
  case workspace(tripID: UUID)
}

@MainActor
@Observable
final class AppRouter {
  var path: [AppRoute] = []

  func navigate(to route: AppRoute) {
    path.append(route)
  }

  func reset() {
    path = []
  }
}
