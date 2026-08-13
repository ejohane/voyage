import Foundation
import Testing

@testable import Voyage

struct V1ContractDecodingTests {
  @Test("Canonical trip list fixture decodes into DTO and domain models")
  func tripListFixture() throws {
    let dto = try JSONDecoder().decode(
      V1TripListDTO.self,
      from: TestFixtures.data(named: "trip-list")
    )
    let domain = dto.domain

    #expect(dto.schemaVersion == 1)
    #expect(dto.revision == String(repeating: "b", count: 64))
    #expect(domain.trips.count == 1)
    #expect(domain.trips[0].name == "Autumn in Lisbon")
    #expect(domain.trips[0].startDate?.rawValue == "2026-10-04")
    #expect(domain.trips[0].stops[0].location?.placeID == "ChIJO_PkYRozGQ0R0DaQ5L3rAAQ")
    #expect(domain.trips[0].accessLevel == .owner)
  }

  @Test("Canonical workspace fixture decodes every v1 workspace collection")
  func tripWorkspaceFixture() throws {
    let dto = try JSONDecoder().decode(
      V1TripWorkspaceDTO.self,
      from: TestFixtures.data(named: "trip-workspace")
    )
    let domain = dto.domain

    #expect(dto.schemaVersion == 1)
    #expect(dto.revision == String(repeating: "a", count: 64))
    #expect(domain.trip.name == "Autumn in Lisbon")
    #expect(domain.travel.count == 2)
    #expect(domain.travel[0].type == .flight)
    #expect(domain.travel[0].departureAt.rawValue == "2026-10-04T18:30")
    #expect(domain.travel[1].kind == .rental)
    #expect(domain.stays.count == 1)
    #expect(domain.stays[0].propertyReference?.placeID == "place-memmo")
    #expect(domain.stays[0].bookingDetails?.amenities.map(\.rawValue) == ["wifi", "breakfast"])
    #expect(domain.plans.count == 1)
    #expect(domain.plans[0].category == .sightseeing)
    #expect(domain.plans[0].revision == 3)
  }

  @Test("Canonical briefing fixture decodes typed arrival items and provenance")
  func tripBriefingFixture() throws {
    let dto = try JSONDecoder().decode(
      V1TripBriefingDTO.self,
      from: TestFixtures.data(named: "trip-briefing")
    )
    let domain = dto.domain

    #expect(dto.schemaVersion == 1)
    #expect(domain.revision == String(repeating: "c", count: 64))
    #expect(domain.generatorVersion == "arrival-v1")
    #expect(domain.inputFingerprint == String(repeating: "d", count: 64))
    #expect(domain.sections.count == 1)
    #expect(domain.sections[0].items.count == 3)
    guard case .flightArrival(let flight) = domain.sections[0].items[0] else {
      Issue.record("Expected a flight arrival")
      return
    }
    #expect(flight.airport.iataCode == "LIS")
    #expect(flight.airport.latitude == 38.7742)
    #expect(flight.airport.longitude == -9.1342)
    #expect(flight.provenance == .booked)
    guard case .stayArrival(let stay) = domain.sections[0].items[2] else {
      Issue.record("Expected a stay arrival")
      return
    }
    #expect(stay.propertyName == "Memmo Alfama")
  }

  @Test("Canonical people fixture decodes into v1 membership domain models")
  func tripPeopleFixture() throws {
    let dto = try JSONDecoder().decode(
      V1TripPeopleDTO.self,
      from: TestFixtures.data(named: "trip-people")
    )
    let domain = dto.domain

    #expect(dto.schemaVersion == 1)
    #expect(domain.members.count == 2)
    #expect(domain.members[0].id == "user_owner")
    #expect(domain.members[0].role == .organizer)
    #expect(domain.members[0].accessLevel == .owner)
    #expect(domain.members[1].role == .traveler)
    #expect(domain.members[1].imageURL?.host == "images.example.com")
  }
}
