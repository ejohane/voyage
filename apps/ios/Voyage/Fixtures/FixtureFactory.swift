import Foundation

enum FixtureFactory {
  static let userID = "fixture-user"
  static let tripID = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
  static let stopID = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
  static let florenceStopID = UUID(uuidString: "22222222-3333-4333-8333-333333333333")!
  static let planID = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

  static let trip = Trip(
    id: tripID,
    name: "Italy in Late Summer",
    startDate: LocalDate(rawValue: "2026-07-28"),
    endDate: LocalDate(rawValue: "2026-08-05"),
    stops: [
      TripStop(
        id: stopID,
        position: 0,
        name: "Rome, Italy",
        arrivalDate: LocalDate(rawValue: "2026-07-28"),
        departureDate: LocalDate(rawValue: "2026-08-01"),
        location: TripStopLocation(
          provider: "google_places",
          placeID: "fixture-rome",
          latitude: 41.9028,
          longitude: 12.4964
        )
      ),
      TripStop(
        id: florenceStopID,
        position: 1,
        name: "Florence, Italy",
        arrivalDate: LocalDate(rawValue: "2026-08-01"),
        departureDate: LocalDate(rawValue: "2026-08-05"),
        location: TripStopLocation(
          provider: "google_places",
          placeID: "fixture-florence",
          latitude: 43.7696,
          longitude: 11.2558
        )
      ),
    ],
    accessLevel: .owner,
    createdAt: "2026-07-28T12:00:00.000Z",
    updatedAt: "2026-07-28T12:00:00.000Z"
  )

  static let tripIndex = TripIndex(
    schemaVersion: 1,
    generatedAt: "2026-07-28T12:00:00.000Z",
    revision: String(repeating: "a", count: 64),
    trips: [trip]
  )

  static let workspace = TripWorkspace(
    schemaVersion: 1,
    generatedAt: "2026-07-28T12:00:00.000Z",
    revision: String(repeating: "b", count: 64),
    trip: trip,
    travel: [
      Travel(
        id: UUID(uuidString: "44444444-4444-4444-8444-444444444444")!,
        tripID: tripID,
        kind: .journey,
        type: .flight,
        status: .booked,
        departureStopID: nil,
        arrivalStopID: stopID,
        departureAirportID: 1,
        arrivalAirportID: 2,
        departureAirport: Airport(
          id: 1,
          ident: "KJFK",
          iataCode: "JFK",
          icaoCode: "KJFK",
          type: "large_airport",
          name: "John F. Kennedy International Airport",
          municipality: "New York",
          isoCountry: "US",
          isoRegion: "US-NY",
          latitude: 40.6413,
          longitude: -73.7781
        ),
        arrivalAirport: Airport(
          id: 2,
          ident: "LIRF",
          iataCode: "FCO",
          icaoCode: "LIRF",
          type: "large_airport",
          name: "Leonardo da Vinci–Fiumicino Airport",
          municipality: "Rome",
          isoCountry: "IT",
          isoRegion: "IT-62",
          latitude: 41.8003,
          longitude: 12.2389
        ),
        departureLocation: "New York (JFK)",
        arrivalLocation: "Rome (FCO)",
        departureAt: LocalDateTime(rawValue: "2026-07-28T08:00")!,
        arrivalAt: LocalDateTime(rawValue: "2026-07-28T20:30"),
        carrier: "Delta",
        referenceNumber: "DL 444",
        vehicleDescription: "Airbus A330-900neo",
        confirmationNumber: "VYG7Q2",
        bookingURL: URL(string: "https://www.delta.com/my-trips"),
        notes: "Dinner is served after departure.",
        createdAt: "2026-07-01T12:00:00.000Z",
        updatedAt: "2026-07-24T14:00:00.000Z"
      ),
      Travel(
        id: UUID(uuidString: "55555555-5555-4555-8555-555555555555")!,
        tripID: tripID,
        kind: .journey,
        type: .train,
        status: .booked,
        departureStopID: stopID,
        arrivalStopID: florenceStopID,
        departureAirportID: nil,
        arrivalAirportID: nil,
        departureAirport: nil,
        arrivalAirport: nil,
        departureLocation: "Roma Termini",
        arrivalLocation: "Firenze S. M. Novella",
        departureAt: LocalDateTime(rawValue: "2026-08-01T09:15")!,
        arrivalAt: LocalDateTime(rawValue: "2026-08-01T10:51"),
        carrier: "Trenitalia",
        referenceNumber: "FR 9512",
        vehicleDescription: "Frecciarossa",
        confirmationNumber: "RMFLR81",
        bookingURL: URL(string: "https://www.trenitalia.com"),
        notes: nil,
        createdAt: "2026-07-02T12:00:00.000Z",
        updatedAt: "2026-07-02T12:00:00.000Z"
      ),
      Travel(
        id: UUID(uuidString: "66666666-6666-4666-8666-666666666666")!,
        tripID: tripID,
        kind: .rental,
        type: .car,
        status: .booked,
        departureStopID: florenceStopID,
        arrivalStopID: florenceStopID,
        departureAirportID: nil,
        arrivalAirportID: nil,
        departureAirport: nil,
        arrivalAirport: nil,
        departureLocation: "Florence Santa Maria Novella",
        arrivalLocation: "Florence Santa Maria Novella",
        departureAt: LocalDateTime(rawValue: "2026-08-02T08:30")!,
        arrivalAt: LocalDateTime(rawValue: "2026-08-04T18:00"),
        carrier: "Sicily by Car",
        referenceNumber: nil,
        vehicleDescription: "Compact automatic",
        confirmationNumber: "CAR-8421",
        bookingURL: URL(string: "https://www.sicilybycar.it"),
        notes: "Bring driver licenses for both travelers.",
        createdAt: "2026-07-03T12:00:00.000Z",
        updatedAt: "2026-07-03T12:00:00.000Z"
      ),
    ],
    stays: [
      Stay(
        id: UUID(uuidString: "77777777-7777-4777-8777-777777777777")!,
        tripID: tripID,
        status: .booked,
        tripStopID: stopID,
        propertyName: "Hotel de’ Ricci",
        address: "Via della Barchetta 14, Rome",
        checkInDate: LocalDate(rawValue: "2026-07-28")!,
        checkOutDate: LocalDate(rawValue: "2026-08-01")!,
        confirmationNumber: "ROME-2026",
        bookingURL: URL(string: "https://example.com/bookings/rome"),
        notes: "Front desk can hold luggage after checkout.",
        propertyReference: StayPropertyReference(provider: "google_places", placeID: "fixture-ricci"),
        bookingDetails: StayBookingDetails(
          checkInWindow: "3:00 PM – 11:00 PM",
          checkOutWindow: "By 11:00 AM",
          roomType: "Junior suite",
          guestSummary: "2 adults",
          mealPlan: "Breakfast included",
          cancellationSummary: "Free cancellation until the deadline.",
          cancellationDeadline: LocalDate(rawValue: "2026-07-25"),
          totalPriceText: "$1,480",
          amenities: [StayAmenity(rawValue: "wifi"), StayAmenity(rawValue: "breakfast")]
        ),
        createdAt: "2026-07-04T12:00:00.000Z",
        updatedAt: "2026-07-04T12:00:00.000Z"
      ),
      Stay(
        id: UUID(uuidString: "88888888-8888-4888-8888-888888888888")!,
        tripID: tripID,
        status: .booked,
        tripStopID: florenceStopID,
        propertyName: "Casa G.",
        address: "Via dei Rondinelli 7, Florence",
        checkInDate: LocalDate(rawValue: "2026-08-01")!,
        checkOutDate: LocalDate(rawValue: "2026-08-05")!,
        confirmationNumber: "FLR-5519",
        bookingURL: URL(string: "https://example.com/bookings/florence"),
        notes: nil,
        propertyReference: StayPropertyReference(provider: "google_places", placeID: "fixture-casa-g"),
        bookingDetails: StayBookingDetails(
          checkInWindow: "From 2:00 PM",
          checkOutWindow: "By 10:30 AM",
          roomType: "Deluxe king",
          guestSummary: "2 adults",
          mealPlan: nil,
          cancellationSummary: nil,
          cancellationDeadline: nil,
          totalPriceText: "€1,120",
          amenities: [StayAmenity(rawValue: "wifi"), StayAmenity(rawValue: "air_conditioning")]
        ),
        createdAt: "2026-07-05T12:00:00.000Z",
        updatedAt: "2026-07-05T12:00:00.000Z"
      ),
    ],
    plans: [
      Plan(
        id: planID,
        tripID: tripID,
        tripStopID: stopID,
        title: "Dinner in Trastevere",
        category: .food,
        status: .booked,
        scheduledDate: LocalDate(rawValue: "2026-07-28")!,
        startTime: LocalTime(rawValue: "21:00"),
        endTime: LocalTime(rawValue: "22:30"),
        location: "Da Enzo al 29",
        confirmationNumber: "ENZO-8PM",
        bookingURL: URL(string: "https://example.com/reservations/enzo"),
        notes: "Walk from the hotel along the river.",
        revision: 1,
        createdAt: "2026-07-28T12:00:00.000Z",
        updatedAt: "2026-07-28T12:00:00.000Z"
      ),
      Plan(
        id: UUID(uuidString: "33333333-4444-4444-8444-444444444444")!,
        tripID: tripID,
        tripStopID: stopID,
        title: "Colosseum and Roman Forum",
        category: .sightseeing,
        status: .booked,
        scheduledDate: LocalDate(rawValue: "2026-07-29")!,
        startTime: LocalTime(rawValue: "09:30"),
        endTime: LocalTime(rawValue: "12:30"),
        location: "Piazza del Colosseo",
        confirmationNumber: "COLOSSEO42",
        bookingURL: URL(string: "https://example.com/tickets/colosseum"),
        notes: "Arrive 20 minutes early for security.",
        revision: 3,
        createdAt: "2026-07-10T12:00:00.000Z",
        updatedAt: "2026-07-24T12:00:00.000Z"
      ),
      Plan(
        id: UUID(uuidString: "33333333-5555-4555-8555-555555555555")!,
        tripID: tripID,
        tripStopID: stopID,
        title: "Find the best gelato near the Pantheon",
        category: .food,
        status: .planned,
        scheduledDate: LocalDate(rawValue: "2026-07-29")!,
        startTime: nil,
        endTime: nil,
        location: "Pantheon",
        confirmationNumber: nil,
        bookingURL: nil,
        notes: nil,
        revision: 1,
        createdAt: "2026-07-11T12:00:00.000Z",
        updatedAt: "2026-07-11T12:00:00.000Z"
      ),
      Plan(
        id: UUID(uuidString: "33333333-6666-4666-8666-666666666666")!,
        tripID: tripID,
        tripStopID: florenceStopID,
        title: "Uffizi Gallery",
        category: .sightseeing,
        status: .booked,
        scheduledDate: LocalDate(rawValue: "2026-08-02")!,
        startTime: LocalTime(rawValue: "14:00"),
        endTime: LocalTime(rawValue: "16:30"),
        location: "Piazzale degli Uffizi 6",
        confirmationNumber: "UFFIZI-882",
        bookingURL: URL(string: "https://example.com/tickets/uffizi"),
        notes: nil,
        revision: 2,
        createdAt: "2026-07-12T12:00:00.000Z",
        updatedAt: "2026-07-20T12:00:00.000Z"
      ),
    ]
  )

  static let people = TripPeople(
    schemaVersion: 1,
    generatedAt: "2026-07-28T12:00:00.000Z",
    members: [
      TripMember(
        userID: userID,
        email: "erik@example.com",
        displayName: "Erik Johansson",
        imageURL: nil,
        role: .organizer,
        accessLevel: .owner,
        joinedAt: "2026-07-28T12:00:00.000Z"
      ),
      TripMember(
        userID: "fixture-planner",
        email: "mia@example.com",
        displayName: "Mia",
        imageURL: nil,
        role: .planner,
        accessLevel: .editor,
        joinedAt: "2026-07-18T12:00:00.000Z"
      ),
      TripMember(
        userID: "fixture-traveler",
        email: nil,
        displayName: "Jonas",
        imageURL: nil,
        role: .traveler,
        accessLevel: .viewer,
        joinedAt: "2026-07-20T12:00:00.000Z"
      ),
    ]
  )
}

actor FixtureAPI: VoyageAPI {
  private var fixtureWorkspace = FixtureFactory.workspace

  func listTrips(ifNoneMatch: String?) async throws -> APIReadResult<TripIndex> {
    .modified(
      FixtureFactory.tripIndex,
      metadata: APIResponseMetadata(
        entityTag: APIClient.entityTag(forRevision: FixtureFactory.tripIndex.revision),
        requestID: "fixture-trip-index"
      )
    )
  }

  func workspace(
    tripID: UUID,
    ifNoneMatch: String?
  ) async throws -> APIReadResult<TripWorkspace> {
    guard tripID == FixtureFactory.tripID else {
      throw APIError.server(
        status: 404,
        code: "not_found",
        message: "Trip not found.",
        fieldErrors: [:],
        currentRevision: nil,
        requestID: "fixture-workspace"
      )
    }
    return .modified(
      fixtureWorkspace,
      metadata: APIResponseMetadata(
        entityTag: APIClient.entityTag(forRevision: fixtureWorkspace.revision),
        requestID: "fixture-workspace"
      )
    )
  }

  func people(tripID: UUID) async throws -> TripPeople {
    guard tripID == FixtureFactory.tripID else {
      throw APIError.server(
        status: 404,
        code: "not_found",
        message: "Trip not found.",
        fieldErrors: [:],
        currentRevision: nil,
        requestID: "fixture-people"
      )
    }
    return FixtureFactory.people
  }

  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    try validate(tripID: tripID)
    if let existing = fixtureWorkspace.plans.first(where: { $0.id == idempotencyKey }) {
      return existing
    }
    let plan = makePlan(
      id: idempotencyKey,
      tripID: tripID,
      input: input,
      revision: 1,
      createdAt: "2026-07-28T12:00:00.000Z"
    )
    replacePlans(fixtureWorkspace.plans + [plan])
    return plan
  }

  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan {
    try validate(tripID: tripID)
    guard let index = fixtureWorkspace.plans.firstIndex(where: { $0.id == planID }) else {
      throw fixtureError(status: 404, code: "not_found", message: "Plan not found.")
    }
    let existing = fixtureWorkspace.plans[index]
    guard existing.revision == expectedRevision else {
      throw APIError.server(
        status: 409,
        code: "conflict",
        message: "This plan changed. Refresh it before saving.",
        fieldErrors: [:],
        currentRevision: existing.revision,
        requestID: "fixture-update-plan"
      )
    }
    let plan = makePlan(
      id: planID,
      tripID: tripID,
      input: input,
      revision: existing.revision + 1,
      createdAt: existing.createdAt
    )
    var plans = fixtureWorkspace.plans
    plans[index] = plan
    replacePlans(plans)
    return plan
  }

  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws {
    try validate(tripID: tripID)
    guard let plan = fixtureWorkspace.plans.first(where: { $0.id == planID }) else {
      throw fixtureError(status: 404, code: "not_found", message: "Plan not found.")
    }
    guard plan.revision == expectedRevision else {
      throw APIError.server(
        status: 409,
        code: "conflict",
        message: "This plan changed. Refresh it before removing it.",
        fieldErrors: [:],
        currentRevision: plan.revision,
        requestID: "fixture-delete-plan"
      )
    }
    replacePlans(fixtureWorkspace.plans.filter { $0.id != planID })
  }

  private func validate(tripID: UUID) throws {
    guard tripID == FixtureFactory.tripID else {
      throw fixtureError(status: 404, code: "not_found", message: "Trip not found.")
    }
  }

  private func makePlan(
    id: UUID,
    tripID: UUID,
    input: ScheduledPlanInput,
    revision: Int,
    createdAt: String
  ) -> Plan {
    Plan(
      id: id,
      tripID: tripID,
      tripStopID: input.tripStopID,
      title: input.title,
      category: input.category,
      status: input.status,
      scheduledDate: input.scheduledDate,
      startTime: input.startTime,
      endTime: input.endTime,
      location: input.location,
      confirmationNumber: input.confirmationNumber,
      bookingURL: input.bookingURL,
      notes: input.notes,
      revision: revision,
      createdAt: createdAt,
      updatedAt: "2026-07-28T12:05:00.000Z"
    )
  }

  private func replacePlans(_ plans: [Plan]) {
    fixtureWorkspace = TripWorkspace(
      schemaVersion: fixtureWorkspace.schemaVersion,
      generatedAt: "2026-07-28T12:05:00.000Z",
      revision: String(repeating: "c", count: 64),
      trip: fixtureWorkspace.trip,
      travel: fixtureWorkspace.travel,
      stays: fixtureWorkspace.stays,
      plans: plans
    )
  }

  private func fixtureError(status: Int, code: String, message: String) -> APIError {
    APIError.server(
      status: status,
      code: code,
      message: message,
      fieldErrors: [:],
      currentRevision: nil,
      requestID: "fixture-plan"
    )
  }
}

struct OfflineFixtureAPI: VoyageAPI {
  func listTrips(ifNoneMatch: String?) async throws -> APIReadResult<TripIndex> {
    throw offlineError
  }

  func workspace(
    tripID: UUID,
    ifNoneMatch: String?
  ) async throws -> APIReadResult<TripWorkspace> {
    throw offlineError
  }

  func people(tripID: UUID) async throws -> TripPeople {
    throw offlineError
  }

  func createPlan(
    tripID: UUID,
    input: ScheduledPlanInput,
    idempotencyKey: UUID
  ) async throws -> Plan {
    throw offlineError
  }

  func updatePlan(
    tripID: UUID,
    planID: UUID,
    expectedRevision: Int,
    input: ScheduledPlanInput
  ) async throws -> Plan {
    throw offlineError
  }

  func deletePlan(tripID: UUID, planID: UUID, expectedRevision: Int) async throws {
    throw offlineError
  }

  private var offlineError: APIError {
    .transport(message: "Fixture network unavailable")
  }
}
