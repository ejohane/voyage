import MapKit
import Testing
@testable import Voyage

struct TripMapTests {
  @Test
  @MainActor
  func fixtureStopsResolveFromStoredCoordinates() async {
    let stops = await TripMapStopResolver.resolve(
      trip: FixtureFactory.trip,
      travel: FixtureFactory.workspace.travel
    )

    #expect(stops.map(\.name) == ["Rome, Italy", "Florence, Italy"])
    #expect(stops.first?.latitude == 41.9028)
    #expect(stops.last?.longitude == 11.2558)
  }

  @Test
  func cameraRectFramesAllStopsWithPadding() {
    let stops = [
      TripMapStop(
        id: FixtureFactory.stopID,
        position: 0,
        name: "Rome, Italy",
        latitude: 41.9028,
        longitude: 12.4964
      ),
      TripMapStop(
        id: FixtureFactory.florenceStopID,
        position: 1,
        name: "Florence, Italy",
        latitude: 43.7696,
        longitude: 11.2558
      ),
    ]

    let rect = TripMapCamera.mapRect(for: stops)

    #expect(rect.contains(MKMapPoint(stops[0].coordinate)))
    #expect(rect.contains(MKMapPoint(stops[1].coordinate)))
    #expect(rect.size.width > 0)
    #expect(rect.size.height > 0)
  }
}
