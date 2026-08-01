import Foundation

struct V1TripListDTO: Decodable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let revision: String
  let trips: [TripDTO]

  var domain: TripIndex {
    TripIndex(
      schemaVersion: schemaVersion,
      generatedAt: generatedAt,
      revision: revision,
      trips: trips.map(\.domain)
    )
  }
}

struct V1TripWorkspaceDTO: Decodable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let revision: String
  let trip: TripDTO
  let travel: [TravelDTO]
  let stays: [StayDTO]
  let plans: [PlanDTO]

  var domain: TripWorkspace {
    TripWorkspace(
      schemaVersion: schemaVersion,
      generatedAt: generatedAt,
      revision: revision,
      trip: trip.domain,
      travel: travel.map(\.domain),
      stays: stays.map(\.domain),
      plans: plans.map(\.domain)
    )
  }
}

struct V1TripPeopleDTO: Decodable, Sendable {
  let schemaVersion: Int
  let generatedAt: String
  let members: [TripMemberDTO]

  var domain: TripPeople {
    TripPeople(
      schemaVersion: schemaVersion,
      generatedAt: generatedAt,
      members: members.map(\.domain)
    )
  }
}

struct V1PlanResponseDTO: Decodable, Sendable {
  let plan: PlanDTO
}

struct TripDTO: Decodable, Sendable {
  let id: UUID
  let name: String
  let startDate: LocalDate?
  let endDate: LocalDate?
  let stops: [TripStopDTO]
  let accessLevel: String
  let createdAt: String
  let updatedAt: String

  var domain: Trip {
    Trip(
      id: id,
      name: name,
      startDate: startDate,
      endDate: endDate,
      stops: stops.map(\.domain),
      accessLevel: TripAccessLevel(rawValue: accessLevel),
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }
}

struct TripStopDTO: Decodable, Sendable {
  let id: UUID
  let position: Int
  let name: String
  let arrivalDate: LocalDate?
  let departureDate: LocalDate?
  let location: TripStopLocationDTO?

  var domain: TripStop {
    TripStop(
      id: id,
      position: position,
      name: name,
      arrivalDate: arrivalDate,
      departureDate: departureDate,
      location: location?.domain
    )
  }
}

struct TripStopLocationDTO: Decodable, Sendable {
  let provider: String
  let placeId: String
  let latitude: Double?
  let longitude: Double?

  var domain: TripStopLocation {
    TripStopLocation(
      provider: provider,
      placeID: placeId,
      latitude: latitude,
      longitude: longitude
    )
  }
}

struct AirportDTO: Decodable, Sendable {
  let id: Int
  let ident: String
  let iataCode: String
  let icaoCode: String?
  let type: String
  let name: String
  let municipality: String?
  let isoCountry: String
  let isoRegion: String?
  let latitude: Double
  let longitude: Double

  var domain: Airport {
    Airport(
      id: id,
      ident: ident,
      iataCode: iataCode,
      icaoCode: icaoCode,
      type: type,
      name: name,
      municipality: municipality,
      isoCountry: isoCountry,
      isoRegion: isoRegion,
      latitude: latitude,
      longitude: longitude
    )
  }
}

struct TravelDTO: Decodable, Sendable {
  let id: UUID
  let tripId: UUID
  let kind: String
  let type: String
  let status: String
  let departureStopId: UUID?
  let arrivalStopId: UUID?
  let departureAirportId: Int?
  let arrivalAirportId: Int?
  let departureAirport: AirportDTO?
  let arrivalAirport: AirportDTO?
  let departureLocation: String
  let arrivalLocation: String
  let departureAt: LocalDateTime
  let arrivalAt: LocalDateTime?
  let carrier: String?
  let referenceNumber: String?
  let vehicleDescription: String?
  let confirmationNumber: String?
  let bookingUrl: URL?
  let notes: String?
  let createdAt: String
  let updatedAt: String

  var domain: Travel {
    Travel(
      id: id,
      tripID: tripId,
      kind: TransportationKind(rawValue: kind),
      type: TravelType(rawValue: type),
      status: ReservationStatus(rawValue: status),
      departureStopID: departureStopId,
      arrivalStopID: arrivalStopId,
      departureAirportID: departureAirportId,
      arrivalAirportID: arrivalAirportId,
      departureAirport: departureAirport?.domain,
      arrivalAirport: arrivalAirport?.domain,
      departureLocation: departureLocation,
      arrivalLocation: arrivalLocation,
      departureAt: departureAt,
      arrivalAt: arrivalAt,
      carrier: carrier,
      referenceNumber: referenceNumber,
      vehicleDescription: vehicleDescription,
      confirmationNumber: confirmationNumber,
      bookingURL: bookingUrl,
      notes: notes,
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }
}

struct StayDTO: Decodable, Sendable {
  let id: UUID
  let tripId: UUID
  let status: String
  let tripStopId: UUID?
  let propertyName: String
  let address: String
  let checkInDate: LocalDate
  let checkOutDate: LocalDate
  let confirmationNumber: String?
  let bookingUrl: URL?
  let notes: String?
  let propertyRef: StayPropertyReferenceDTO?
  let bookingDetails: StayBookingDetailsDTO?
  let createdAt: String
  let updatedAt: String

  var domain: Stay {
    Stay(
      id: id,
      tripID: tripId,
      status: ReservationStatus(rawValue: status),
      tripStopID: tripStopId,
      propertyName: propertyName,
      address: address,
      checkInDate: checkInDate,
      checkOutDate: checkOutDate,
      confirmationNumber: confirmationNumber,
      bookingURL: bookingUrl,
      notes: notes,
      propertyReference: propertyRef?.domain,
      bookingDetails: bookingDetails?.domain,
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }
}

struct StayPropertyReferenceDTO: Decodable, Sendable {
  let provider: String
  let placeId: String

  var domain: StayPropertyReference {
    StayPropertyReference(provider: provider, placeID: placeId)
  }
}

struct StayBookingDetailsDTO: Decodable, Sendable {
  let checkInWindow: String?
  let checkOutWindow: String?
  let roomType: String?
  let guestSummary: String?
  let mealPlan: String?
  let cancellationSummary: String?
  let cancellationDeadline: LocalDate?
  let totalPriceText: String?
  let amenities: [String]

  var domain: StayBookingDetails {
    StayBookingDetails(
      checkInWindow: checkInWindow,
      checkOutWindow: checkOutWindow,
      roomType: roomType,
      guestSummary: guestSummary,
      mealPlan: mealPlan,
      cancellationSummary: cancellationSummary,
      cancellationDeadline: cancellationDeadline,
      totalPriceText: totalPriceText,
      amenities: amenities.map(StayAmenity.init(rawValue:))
    )
  }
}

struct PlanDTO: Decodable, Sendable {
  let id: UUID
  let tripId: UUID
  let tripStopId: UUID
  let title: String
  let category: String
  let status: String
  let scheduledDate: LocalDate
  let startTime: LocalTime?
  let endTime: LocalTime?
  let location: String?
  let confirmationNumber: String?
  let bookingUrl: URL?
  let notes: String?
  let revision: Int
  let createdAt: String
  let updatedAt: String

  var domain: Plan {
    Plan(
      id: id,
      tripID: tripId,
      tripStopID: tripStopId,
      title: title,
      category: PlanCategory(rawValue: category),
      status: PlanStatus(rawValue: status),
      scheduledDate: scheduledDate,
      startTime: startTime,
      endTime: endTime,
      location: location,
      confirmationNumber: confirmationNumber,
      bookingURL: bookingUrl,
      notes: notes,
      revision: revision,
      createdAt: createdAt,
      updatedAt: updatedAt
    )
  }
}

struct TripMemberDTO: Decodable, Sendable {
  let userId: String
  let email: String?
  let displayName: String?
  let imageUrl: URL?
  let role: String
  let accessLevel: String
  let joinedAt: String

  var domain: TripMember {
    TripMember(
      userID: userId,
      email: email,
      displayName: displayName,
      imageURL: imageUrl,
      role: MemberRole(rawValue: role),
      accessLevel: TripAccessLevel(rawValue: accessLevel),
      joinedAt: joinedAt
    )
  }
}
