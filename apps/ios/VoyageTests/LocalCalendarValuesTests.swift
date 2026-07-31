import Foundation
import Testing

@testable import Voyage

struct LocalCalendarValuesTests {
  @Test("LocalDate accepts only real Gregorian YYYY-MM-DD dates")
  func localDateStrictParsing() {
    #expect(LocalDate(rawValue: "2024-02-29")?.rawValue == "2024-02-29")
    #expect(LocalDate(rawValue: "2026-12-31")?.rawValue == "2026-12-31")

    for invalid in [
      "2023-02-29", "2026-02-30", "2026-13-01", "2026-00-10",
      "2026-1-01", "26-01-01", "2026/01/01", "2026-01-01Z", "",
    ] {
      #expect(LocalDate(rawValue: invalid) == nil, "Unexpectedly accepted \(invalid)")
    }
  }

  @Test("LocalTime accepts only 24-hour HH:mm values")
  func localTimeStrictParsing() {
    #expect(LocalTime(rawValue: "00:00")?.rawValue == "00:00")
    #expect(LocalTime(rawValue: "23:59")?.rawValue == "23:59")

    for invalid in ["24:00", "23:60", "7:30", "07:3", "07:30:00", "07.30", ""] {
      #expect(LocalTime(rawValue: invalid) == nil, "Unexpectedly accepted \(invalid)")
    }
  }

  @Test("LocalDateTime requires a strict date, T separator, and strict time")
  func localDateTimeStrictParsing() {
    let value = LocalDateTime(rawValue: "2026-10-04T18:30")
    #expect(value?.date.rawValue == "2026-10-04")
    #expect(value?.time.rawValue == "18:30")
    #expect(value?.rawValue == "2026-10-04T18:30")

    for invalid in [
      "2026-10-04 18:30", "2026-10-04T24:00", "2026-02-30T18:30",
      "2026-10-04T18:30Z", "2026-10-04T18:30:00", "",
    ] {
      #expect(LocalDateTime(rawValue: invalid) == nil, "Unexpectedly accepted \(invalid)")
    }
  }

  @Test("Invalid local calendar JSON fails decoding")
  func invalidJSONFailsDecoding() {
    #expect(throws: DecodingError.self) {
      try JSONDecoder().decode(LocalDate.self, from: Data(#""2026-02-30""#.utf8))
    }
    #expect(throws: DecodingError.self) {
      try JSONDecoder().decode(LocalTime.self, from: Data(#""24:00""#.utf8))
    }
    #expect(throws: DecodingError.self) {
      try JSONDecoder().decode(LocalDateTime.self, from: Data(#""2026-10-04T18:30Z""#.utf8))
    }
  }
}
