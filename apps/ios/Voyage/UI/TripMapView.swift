import MapKit
import SwiftUI
import UIKit

struct TripMapStop: Identifiable, Equatable, Sendable {
  let id: UUID
  let position: Int
  let name: String
  let latitude: Double
  let longitude: Double

  var coordinate: CLLocationCoordinate2D {
    CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
  }
}

@MainActor
enum TripMapStopResolver {
  static func resolve(trip: Trip, travel: [Travel]) async -> [TripMapStop] {
    let airportsByStopID = airportCoordinatesByStopID(from: travel)

    var resolved: [TripMapStop] = []
    for stop in trip.stops.sorted(by: { $0.position < $1.position }) {
      if let coordinate = stop.location?.coordinate {
        resolved.append(
          TripMapStop(
            id: stop.id,
            position: stop.position,
            name: stop.name,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
          )
        )
        continue
      }

      if let coordinate = airportsByStopID[stop.id] {
        resolved.append(
          TripMapStop(
            id: stop.id,
            position: stop.position,
            name: stop.name,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
          )
        )
        continue
      }

      if let coordinate = await coordinateForSearch(query: stop.name) {
        resolved.append(
          TripMapStop(
            id: stop.id,
            position: stop.position,
            name: stop.name,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude
          )
        )
      }
    }

    return resolved
  }

  private static func airportCoordinatesByStopID(from travel: [Travel]) -> [UUID: CLLocationCoordinate2D] {
    var result: [UUID: CLLocationCoordinate2D] = [:]

    for item in travel {
      if let stopID = item.departureStopID, let airport = item.departureAirport {
        result[stopID] = CLLocationCoordinate2D(
          latitude: airport.latitude,
          longitude: airport.longitude
        )
      }
      if let stopID = item.arrivalStopID, let airport = item.arrivalAirport {
        result[stopID] = CLLocationCoordinate2D(
          latitude: airport.latitude,
          longitude: airport.longitude
        )
      }
    }

    return result
  }

  private static func coordinateForSearch(query: String) async -> CLLocationCoordinate2D? {
    let request = MKLocalSearch.Request()
    request.naturalLanguageQuery = query
    request.resultTypes = [.address, .pointOfInterest]

    do {
      let response = try await MKLocalSearch(request: request).start()
      return response.mapItems.first?.placemark.coordinate
    } catch {
      return nil
    }
  }
}

@MainActor
private final class TripMapSnapshotRenderer {
  static let shared = TripMapSnapshotRenderer()

  private let cache = NSCache<NSString, UIImage>()

  func image(for key: String, stops: [TripMapStop], size: CGSize) async -> UIImage? {
    guard !stops.isEmpty else { return nil }
    if let cached = cache.object(forKey: key as NSString) {
      return cached
    }

    let options = MKMapSnapshotter.Options()
    options.mapRect = TripMapCamera.mapRect(for: stops)
    options.size = size
    options.scale = UIScreen.main.scale
    options.showsBuildings = true
    options.traitCollection = UITraitCollection(userInterfaceStyle: .light)

    do {
      let snapshot = try await MKMapSnapshotter(options: options).start()
      let image = render(snapshot: snapshot, stops: stops)
      cache.setObject(image, forKey: key as NSString)
      return image
    } catch {
      return nil
    }
  }

  private func render(snapshot: MKMapSnapshotter.Snapshot, stops: [TripMapStop]) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = snapshot.image.scale
    format.opaque = true

    return UIGraphicsImageRenderer(size: snapshot.image.size, format: format).image { context in
      snapshot.image.draw(at: .zero)

      guard !stops.isEmpty else { return }

      if stops.count > 1 {
        let path = UIBezierPath()
        for (index, stop) in stops.enumerated() {
          let point = snapshot.point(for: stop.coordinate)
          if index == 0 {
            path.move(to: point)
          } else {
            path.addLine(to: point)
          }
        }
        UIColor(red: 0.18, green: 0.43, blue: 0.45, alpha: 0.84).setStroke()
        path.lineWidth = 3
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.stroke()
      }

      for (index, stop) in stops.enumerated() {
        let point = snapshot.point(for: stop.coordinate)
        let radius: CGFloat = 13
        let markerRect = CGRect(
          x: point.x - radius,
          y: point.y - radius,
          width: radius * 2,
          height: radius * 2
        )

        UIColor.white.setFill()
        UIBezierPath(ovalIn: markerRect.insetBy(dx: -2, dy: -2)).fill()
        UIColor(red: 0.18, green: 0.43, blue: 0.45, alpha: 1).setFill()
        UIBezierPath(ovalIn: markerRect).fill()

        let label = "\(index + 1)"
        let attributes: [NSAttributedString.Key: Any] = [
          .font: UIFont.systemFont(ofSize: 12, weight: .bold),
          .foregroundColor: UIColor.white,
        ]
        let labelSize = label.size(withAttributes: attributes)
        label.draw(
          at: CGPoint(
            x: point.x - labelSize.width / 2,
            y: point.y - labelSize.height / 2
          ),
          withAttributes: attributes
        )
      }
    }
  }
}

enum TripMapCamera {
  static func mapRect(for stops: [TripMapStop]) -> MKMapRect {
    var rect = MKMapRect.null
    for stop in stops {
      rect = rect.union(
        MKMapRect(
          origin: MKMapPoint(stop.coordinate),
          size: MKMapSize(width: 0, height: 0)
        )
      )
    }

    guard !rect.isNull else { return MKMapRect.world }

    let padding = max(max(rect.size.width, rect.size.height) * 0.24, 2_500)
    return rect.insetBy(dx: -padding, dy: -padding)
  }
}

@MainActor
struct TripMapCardView: View {
  let trip: Trip
  let travel: [Travel]

  @State private var stops: [TripMapStop] = []
  @State private var isShowingMap = false

  private var cacheKey: String {
    let coordinates = stops.map { "\($0.id.uuidString):\($0.latitude):\($0.longitude)" }.joined(separator: "|")
    return "trip-map:\(trip.id.uuidString):\(trip.updatedAt):\(coordinates)"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Button {
        guard !stops.isEmpty else { return }
        isShowingMap = true
      } label: {
        TripMapPreview(
          cacheKey: cacheKey,
          stops: stops
        )
      }
      .buttonStyle(.plain)
      .disabled(stops.isEmpty)
      .accessibilityIdentifier("trip.map.preview")

      VStack(alignment: .leading, spacing: 8) {
        if !trip.stops.isEmpty {
          Text(trip.stops.sorted(by: { $0.position < $1.position }).map(\.name).joined(separator: " → "))
            .font(.title3.weight(.semibold))
        }

        HStack(spacing: 8) {
          if let dateRange = trip.dateRangeText {
            Label(dateRange, systemImage: "calendar")
          }
          Spacer(minLength: 8)
          Text(trip.accessLevel.displayName)
            .font(.caption.weight(.medium))
            .foregroundStyle(.secondary)
        }
        .font(.subheadline)
        .foregroundStyle(.secondary)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
    }
    .task(id: trip.updatedAt) {
      stops = await TripMapStopResolver.resolve(trip: trip, travel: travel)
    }
    .fullScreenCover(isPresented: $isShowingMap) {
      TripMapDetailView(trip: trip, stops: stops)
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("trip.summary.card")
  }
}

@MainActor
private struct TripMapPreview: View {
  let cacheKey: String
  let stops: [TripMapStop]

  @State private var image: UIImage?

  var body: some View {
    ZStack {
      if let image {
        Image(uiImage: image)
          .resizable()
          .scaledToFill()
      } else if stops.isEmpty {
        mapPlaceholder
      } else {
        mapPlaceholder
          .overlay {
            ProgressView()
          }
      }
    }
    .frame(height: 152)
    .clipped()
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    .contentShape(Rectangle())
    .accessibilityLabel(
      stops.isEmpty
        ? "Map preview unavailable"
        : "Map showing \(stops.count) trip \(stops.count == 1 ? "destination" : "destinations")"
    )
    .task(id: cacheKey) {
      image = await TripMapSnapshotRenderer.shared.image(
        for: cacheKey,
        stops: stops,
        size: CGSize(width: 900, height: 456)
      )
    }
  }

  private var mapPlaceholder: some View {
    ZStack {
      LinearGradient(
        colors: [Color(red: 0.88, green: 0.86, blue: 0.82), Color(red: 0.80, green: 0.84, blue: 0.82)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
      )
      Image(systemName: "map")
        .font(.title2)
        .foregroundStyle(.secondary)
    }
  }
}

@MainActor
struct TripMapDetailView: View {
  let trip: Trip
  let stops: [TripMapStop]

  @Environment(\.dismiss) private var dismiss
  @State private var camera: MapCameraPosition

  init(trip: Trip, stops: [TripMapStop]) {
    self.trip = trip
    self.stops = stops
    _camera = State(initialValue: .rect(TripMapCamera.mapRect(for: stops)))
  }

  var body: some View {
    NavigationStack {
      Map(position: $camera, interactionModes: [.pan, .zoom, .rotate, .pitch]) {
        ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
          Marker("\(index + 1). \(stop.name)", coordinate: stop.coordinate)
            .tint(.blue)
        }

        if stops.count > 1 {
          MapPolyline(coordinates: stops.map(\.coordinate))
            .stroke(.blue.opacity(0.78), lineWidth: 4)
        }
      }
      .mapStyle(.standard)
      .mapControls {
        MapCompass()
        MapScaleView()
      }
      .accessibilityLabel("Interactive map for \(trip.name)")
      .navigationTitle("Trip map")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Done") { dismiss() }
        }
      }
      .safeAreaInset(edge: .bottom) {
        if !stops.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
                Label("\(index + 1)  \(stop.name)", systemImage: "mappin")
                  .font(.caption.weight(.medium))
                  .lineLimit(1)
                  .padding(.horizontal, 10)
                  .padding(.vertical, 8)
                  .background(.regularMaterial, in: Capsule())
              }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
          }
        }
      }
    }
  }
}
