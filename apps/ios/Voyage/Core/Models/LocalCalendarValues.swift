import Foundation

struct LocalDate: RawRepresentable, Codable, Hashable, Comparable, Sendable {
  let rawValue: String

  init?(rawValue: String) {
    let parts = rawValue.split(separator: "-", omittingEmptySubsequences: false)
    guard rawValue.count == 10,
      parts.count == 3,
      parts[0].count == 4,
      parts[1].count == 2,
      parts[2].count == 2,
      let year = Int(parts[0]),
      let month = Int(parts[1]),
      let day = Int(parts[2])
    else { return nil }

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    guard let date = calendar.date(from: DateComponents(year: year, month: month, day: day)) else {
      return nil
    }
    let validated = calendar.dateComponents([.year, .month, .day], from: date)
    guard validated.year == year, validated.month == month, validated.day == day else { return nil }
    self.rawValue = rawValue
  }

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    guard let parsed = LocalDate(rawValue: value) else {
      throw DecodingError.dataCorruptedError(
        in: try decoder.singleValueContainer(),
        debugDescription: "Expected a valid local date in YYYY-MM-DD format."
      )
    }
    self = parsed
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
    lhs.rawValue < rhs.rawValue
  }
}

struct LocalTime: RawRepresentable, Codable, Hashable, Comparable, Sendable {
  let rawValue: String

  init?(rawValue: String) {
    let parts = rawValue.split(separator: ":", omittingEmptySubsequences: false)
    guard rawValue.count == 5,
      parts.count == 2,
      parts[0].count == 2,
      parts[1].count == 2,
      let hour = Int(parts[0]),
      let minute = Int(parts[1]),
      (0...23).contains(hour),
      (0...59).contains(minute)
    else { return nil }
    self.rawValue = rawValue
  }

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    guard let parsed = LocalTime(rawValue: value) else {
      throw DecodingError.dataCorruptedError(
        in: try decoder.singleValueContainer(),
        debugDescription: "Expected a valid local time in HH:mm format."
      )
    }
    self = parsed
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  static func < (lhs: LocalTime, rhs: LocalTime) -> Bool {
    lhs.rawValue < rhs.rawValue
  }
}

struct LocalDateTime: RawRepresentable, Codable, Hashable, Comparable, Sendable {
  let date: LocalDate
  let time: LocalTime

  var rawValue: String { "\(date.rawValue)T\(time.rawValue)" }

  init(date: LocalDate, time: LocalTime) {
    self.date = date
    self.time = time
  }

  init?(rawValue: String) {
    let parts = rawValue.split(separator: "T", omittingEmptySubsequences: false)
    guard parts.count == 2,
      let date = LocalDate(rawValue: String(parts[0])),
      let time = LocalTime(rawValue: String(parts[1]))
    else { return nil }
    self.init(date: date, time: time)
  }

  init(from decoder: Decoder) throws {
    let value = try decoder.singleValueContainer().decode(String.self)
    guard let parsed = LocalDateTime(rawValue: value) else {
      throw DecodingError.dataCorruptedError(
        in: try decoder.singleValueContainer(),
        debugDescription: "Expected a valid local date and time in YYYY-MM-DDTHH:mm format."
      )
    }
    self = parsed
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    try container.encode(rawValue)
  }

  static func < (lhs: LocalDateTime, rhs: LocalDateTime) -> Bool {
    lhs.rawValue < rhs.rawValue
  }
}
