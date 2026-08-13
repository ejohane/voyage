import CoreLocation
import Foundation
import MapKit

struct ArrivalRouteRequest: Identifiable, Equatable, Hashable, Sendable {
  let id: String
  let originLatitude: Double
  let originLongitude: Double
  let originLabel: String
  let destinationLabel: String
  let destinationAddress: String

  init?(section: ArrivalBriefingSection) {
    let flight = section.items.compactMap { item -> BriefingFlightArrivalItem? in
      guard case .flightArrival(let flight) = item else { return nil }
      return flight
    }.first
    let rental = section.items.compactMap { item -> BriefingRentalPickupItem? in
      guard case .rentalPickup(let rental) = item else { return nil }
      return rental
    }.first
    let stay = section.items.compactMap { item -> BriefingStayArrivalItem? in
      guard case .stayArrival(let stay) = item else { return nil }
      return stay
    }.first

    guard let flight, let stay,
      let latitude = flight.airport.latitude,
      let longitude = flight.airport.longitude,
      (-90...90).contains(latitude),
      (-180...180).contains(longitude),
      let destinationAddress = stay.address.nilIfBlank,
      !Self.placeholderAddresses.contains(destinationAddress.lowercased())
    else {
      return nil
    }

    id = "apple-route:\(flight.sourceTravelID.uuidString.lowercased()):\(stay.sourceStayID.uuidString.lowercased())"
    originLatitude = latitude
    originLongitude = longitude
    originLabel = rental?.pickupLocation.nilIfBlank ?? "\(flight.airport.iataCode) · \(flight.airport.name)"
    destinationLabel = stay.propertyName
    self.destinationAddress = destinationAddress
  }

  var originCoordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: originLatitude, longitude: originLongitude)
  }

  private static let placeholderAddresses = ["tbd", "unknown", "not set", "n/a", "na"]
}

struct ArrivalRouteEstimate: Equatable, Sendable {
  let durationMinutes: Int
  let distanceMeters: Int
  let destinationLatitude: Double
  let destinationLongitude: Double

  var destinationCoordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: destinationLatitude, longitude: destinationLongitude)
  }
}

enum ArrivalRouteState: Equatable, Sendable {
  case idle
  case loading
  case loaded(ArrivalRouteEstimate)
  case failed
}

@MainActor
protocol ArrivalRouteProviding {
  func estimate(_ request: ArrivalRouteRequest) async throws -> ArrivalRouteEstimate
}

enum ArrivalRouteError: Error {
  case destinationUnavailable
  case routeUnavailable
}

@MainActor
final class AppleMapsArrivalRouteProvider: ArrivalRouteProviding {
  func estimate(_ request: ArrivalRouteRequest) async throws -> ArrivalRouteEstimate {
    let geocoder = CLGeocoder()
    let placemarks = try await geocoder.geocodeAddressString(request.destinationAddress)
    try Task.checkCancellation()
    guard let destination = placemarks.first?.location?.coordinate else {
      throw ArrivalRouteError.destinationUnavailable
    }

    let directionsRequest = MKDirections.Request()
    directionsRequest.source = MKMapItem(
      placemark: MKPlacemark(coordinate: request.originCoordinate)
    )
    directionsRequest.destination = MKMapItem(placemark: MKPlacemark(coordinate: destination))
    directionsRequest.transportType = .automobile
    directionsRequest.requestsAlternateRoutes = false

    let response = try await MKDirections(request: directionsRequest).calculate()
    try Task.checkCancellation()
    guard let route = response.routes.first else {
      throw ArrivalRouteError.routeUnavailable
    }

    return ArrivalRouteEstimate(
      durationMinutes: max(1, Int((route.expectedTravelTime / 60).rounded())),
      distanceMeters: max(0, Int(route.distance.rounded())),
      destinationLatitude: destination.latitude,
      destinationLongitude: destination.longitude
    )
  }
}

@MainActor
enum AppleMapsRouteLauncher {
  static func open(_ request: ArrivalRouteRequest, estimate: ArrivalRouteEstimate) {
    let source = MKMapItem(placemark: MKPlacemark(coordinate: request.originCoordinate))
    source.name = request.originLabel
    let destination = MKMapItem(
      placemark: MKPlacemark(coordinate: estimate.destinationCoordinate)
    )
    destination.name = request.destinationLabel
    MKMapItem.openMaps(
      with: [source, destination],
      launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving]
    )
  }
}
