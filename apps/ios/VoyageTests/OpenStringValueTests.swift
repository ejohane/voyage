import Foundation
import Testing

@testable import Voyage

struct OpenStringValueTests {
  @Test("Unknown server enum values decode without losing their raw representation")
  func unknownValuesRemainForwardCompatible() throws {
    let decoder = JSONDecoder()

    let travel = try decoder.decode(TravelType.self, from: Data(#""hovercraft""#.utf8))
    let category = try decoder.decode(PlanCategory.self, from: Data(#""museum_after_dark""#.utf8))
    let role = try decoder.decode(MemberRole.self, from: Data(#""Coordinator""#.utf8))

    #expect(travel.rawValue == "hovercraft")
    #expect(travel.displayName == "Hovercraft")
    #expect(category.rawValue == "museum_after_dark")
    #expect(role.rawValue == "Coordinator")
  }
}
