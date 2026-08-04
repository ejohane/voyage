import AuthenticationServices
import SwiftUI

@MainActor
struct GmailImportView: View {
  @Environment(\.dismiss) private var dismiss

  let session: VoyageSession
  let workspace: TripWorkspace

  @State private var authorization = GmailAuthorizationSession()
  @State private var step = GmailImportStep.connect
  @State private var connection: GmailConnection?
  @State private var scanResult: GmailScanResult?
  @State private var candidates: [GmailImportCandidate] = []
  @State private var selectedCandidateIDs: Set<String> = []
  @State private var importResult: GmailImportResult?
  @State private var editingCandidate: GmailImportCandidate?
  @State private var isWorking = false
  @State private var errorMessage: String?

  private var connected: Bool { connection?.connected == true }

  var body: some View {
    Group {
      switch step {
      case .connect: connectStep
      case .search: searchStep
      case .review: reviewStep
      case .finish: finishStep
      }
    }
    .navigationTitle("Find Bookings")
    .navigationBarTitleDisplayMode(.inline)
    .task { await loadConnection() }
    .sheet(item: $editingCandidate) { candidate in
      GmailCandidateEditor(candidate: candidate) { updated in
        if let index = candidates.firstIndex(where: { $0.id == updated.id }) {
          candidates[index] = updated
        }
      }
    }
    .alert("Couldn’t continue", isPresented: errorAlert) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(errorMessage ?? "Something went wrong.")
    }
    .accessibilityIdentifier("gmail.import.screen")
  }

  private var errorAlert: Binding<Bool> {
    Binding(
      get: { errorMessage != nil },
      set: { if !$0 { errorMessage = nil } }
    )
  }

  private var connectStep: some View {
    VStack(alignment: .leading, spacing: 24) {
      GmailStepHeader(step: .connect)

      Spacer()

      Image(systemName: connected ? "checkmark.circle.fill" : "envelope.badge.shield.half.filled")
        .font(.system(size: 52))
        .foregroundStyle(connected ? .green : .blue)
        .frame(maxWidth: .infinity)

      VStack(spacing: 10) {
        Text(connected ? "Gmail is connected" : "Bring your bookings together")
          .font(.title2.bold())
          .multilineTextAlignment(.center)
        Text(
          connected
            ? (connection?.email ?? "Your account is ready to search.")
            : "Voyage can search trip-related email for flights, stays, and rental cars."
        )
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      }
      .frame(maxWidth: .infinity)

      Label(
        "Read-only access. Voyage cannot send, change, or delete email.",
        systemImage: "lock.shield"
      )
      .font(.subheadline)
      .foregroundStyle(.secondary)

      Spacer()

      if connected {
        Button("Next", systemImage: "arrow.right") { step = .search }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .frame(maxWidth: .infinity, alignment: .trailing)
          .accessibilityIdentifier("gmail.connect.next")
      } else {
        Button {
          Task { await connectGmail() }
        } label: {
          workingLabel(title: "Connect Gmail", systemImage: "envelope")
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isWorking)
        .frame(maxWidth: .infinity)
        .accessibilityIdentifier("gmail.connect")
      }
    }
    .padding()
  }

  private var searchStep: some View {
    List {
      Section {
        GmailStepHeader(step: .search)
          .listRowInsets(.init(top: 16, leading: 0, bottom: 8, trailing: 0))
      }

      Section("Search scope") {
        LabeledContent("Gmail account", value: connection?.email ?? "Connected")
        LabeledContent("Destinations", value: destinationText)
        LabeledContent("Trip dates", value: workspace.trip.dateRangeText ?? "Not set")
      }

      Section("Voyage will look for") {
        Label("Flights and schedule changes", systemImage: "airplane")
        Label("Hotels and vacation rentals", systemImage: "bed.double")
        Label("Rental car pickups and returns", systemImage: "car")
      }

      Section {
        Button {
          Task { await scan(mode: .standard) }
        } label: {
          workingLabel(title: "Search Gmail", systemImage: "magnifyingglass")
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(isWorking)
        .accessibilityIdentifier("gmail.scan")

        Button("Disconnect Gmail", role: .destructive) {
          Task { await disconnect() }
        }
        .disabled(isWorking)
      }
    }
    .listStyle(.insetGrouped)
  }

  private var reviewStep: some View {
    List {
      Section {
        GmailStepHeader(step: .review)
          .listRowInsets(.init(top: 16, leading: 0, bottom: 8, trailing: 0))
      }

      if candidates.isEmpty {
        Section {
          ContentUnavailableView {
            Label("No new bookings found", systemImage: "envelope.open")
          } description: {
            Text(reviewSummary)
          } actions: {
            Button("Search Deeper") { Task { await scan(mode: .deep) } }
              .disabled(isWorking)
          }
        }
      } else {
        Section {
          Text(reviewSummary)
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }

        Section("Bookings") {
          ForEach(candidates) { candidate in
            GmailCandidateRow(
              candidate: candidate,
              isSelected: selectedCandidateIDs.contains(candidate.id),
              canSelect: selectedCandidateIDs.count < 20
                || selectedCandidateIDs.contains(candidate.id)
            ) {
              toggle(candidate)
            } edit: {
              editingCandidate = candidate
            }
          }
        }

        Section {
          Button {
            Task { await importSelected() }
          } label: {
            workingLabel(
              title: "Import \(selectedCandidateIDs.count) Booking\(selectedCandidateIDs.count == 1 ? "" : "s")",
              systemImage: "square.and.arrow.down"
            )
            .frame(maxWidth: .infinity)
          }
          .buttonStyle(.borderedProminent)
          .controlSize(.large)
          .disabled(isWorking || selectedCandidateIDs.isEmpty)
          .accessibilityIdentifier("gmail.import")

          Button("Search Again") { Task { await scan(mode: .standard) } }
            .disabled(isWorking)

          if scanResult?.search.limitReached == true {
            Button("Search Deeper") { Task { await scan(mode: .deep) } }
              .disabled(isWorking)
          }
        }
      }
    }
    .listStyle(.insetGrouped)
  }

  private var finishStep: some View {
    VStack(spacing: 24) {
      GmailStepHeader(step: .finish)

      Spacer()

      Image(systemName: "checkmark.circle.fill")
        .font(.system(size: 58))
        .foregroundStyle(.green)

      VStack(spacing: 8) {
        Text("Bookings added")
          .font(.title2.bold())
        Text(finishSummary)
          .foregroundStyle(.secondary)
          .multilineTextAlignment(.center)
      }

      Spacer()

      Button("Done") { dismiss() }
        .buttonStyle(.borderedProminent)
    }
    .padding()
  }

  @ViewBuilder
  private func workingLabel(title: String, systemImage: String) -> some View {
    if isWorking {
      HStack {
        ProgressView()
        Text("Please wait…")
      }
    } else {
      Label(title, systemImage: systemImage)
    }
  }

  private var destinationText: String {
    workspace.trip.stops.sorted(by: { $0.position < $1.position }).map(\.name).joined(separator: " · ")
  }

  private var reviewSummary: String {
    guard let scanResult else { return "Review what Voyage found before adding anything." }
    var parts = ["\(scanResult.messagesScanned) messages checked"]
    if scanResult.alreadyImported > 0 {
      parts.append("\(scanResult.alreadyImported) already imported")
    }
    return parts.joined(separator: " · ")
  }

  private var finishSummary: String {
    guard let importResult else { return "Your trip has been refreshed." }
    let imported = importResult.imported.count
    let skipped = importResult.skipped.count
    return skipped == 0
      ? "\(imported) booking\(imported == 1 ? " was" : "s were") added to this trip."
      : "\(imported) added and \(skipped) skipped because they were already present."
  }

  private func loadConnection() async {
    do {
      connection = try await session.gmailConnection()
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func connectGmail() async {
    isWorking = true
    defer { isWorking = false }
    do {
      let authorizationURL = try await session.beginGmailConnection(tripID: workspace.trip.id)
      let callbackURL = try await authorization.authorize(at: authorizationURL)
      guard callbackURL.scheme == "app.voyage.native",
        callbackURL.host == "oauth",
        callbackURL.path == "/gmail",
        callbackURL.queryValue(named: "tripId").flatMap(UUID.init(uuidString:))
          == workspace.trip.id,
        callbackURL.queryValue(named: "result") == "connected"
      else {
        throw GmailAuthorizationError.invalidCallback
      }
      connection = try await session.gmailConnection()
      guard connected else { throw GmailAuthorizationError.invalidCallback }
      step = .search
    } catch let error as ASWebAuthenticationSessionError where error.code == .canceledLogin {
      return
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func disconnect() async {
    isWorking = true
    defer { isWorking = false }
    do {
      try await session.disconnectGmail()
      connection = GmailConnection(connected: false, email: nil, connectedAt: nil)
      scanResult = nil
      candidates = []
      selectedCandidateIDs = []
      step = .connect
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func scan(mode: GmailScanMode) async {
    isWorking = true
    defer { isWorking = false }
    do {
      let result = try await session.scanGmail(tripID: workspace.trip.id, mode: mode)
      scanResult = result
      candidates = result.candidates
      selectedCandidateIDs = Set(result.candidates.prefix(20).map(\.id))
      importResult = nil
      step = .review
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
    }
  }

  private func toggle(_ candidate: GmailImportCandidate) {
    if selectedCandidateIDs.contains(candidate.id) {
      selectedCandidateIDs.remove(candidate.id)
    } else if selectedCandidateIDs.count < 20 {
      selectedCandidateIDs.insert(candidate.id)
    }
  }

  private func importSelected() async {
    let selected = candidates.filter { selectedCandidateIDs.contains($0.id) }
    guard !selected.isEmpty else { return }
    isWorking = true
    defer { isWorking = false }
    do {
      importResult = try await session.importGmail(
        tripID: workspace.trip.id,
        candidates: selected
      )
      step = .finish
    } catch is CancellationError {
      return
    } catch {
      errorMessage = error.localizedDescription
    }
  }
}

private enum GmailImportStep: Int, CaseIterable {
  case connect
  case search
  case review
  case finish

  var title: String {
    switch self {
    case .connect: "Connect"
    case .search: "Search"
    case .review: "Review"
    case .finish: "Finish"
    }
  }
}

private struct GmailStepHeader: View {
  let step: GmailImportStep

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Step \(step.rawValue + 1) of \(GmailImportStep.allCases.count)")
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .textCase(.uppercase)

      HStack(spacing: 6) {
        ForEach(GmailImportStep.allCases, id: \.rawValue) { item in
          Capsule()
            .fill(item.rawValue <= step.rawValue ? Color.accentColor : Color.secondary.opacity(0.18))
            .frame(height: 4)
        }
      }
      .accessibilityLabel("\(step.title), step \(step.rawValue + 1) of 4")
    }
  }
}

private struct GmailCandidateRow: View {
  let candidate: GmailImportCandidate
  let isSelected: Bool
  let canSelect: Bool
  let toggle: () -> Void
  let edit: () -> Void

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Button(action: toggle) {
        Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
          .font(.title3)
          .foregroundStyle(isSelected ? Color.accentColor : .secondary)
      }
      .buttonStyle(.plain)
      .disabled(!canSelect)
      .accessibilityLabel(isSelected ? "Exclude booking" : "Include booking")

      VStack(alignment: .leading, spacing: 5) {
        Text(candidate.title)
          .font(.headline)
        Text(candidate.subtitle)
          .font(.subheadline)
          .foregroundStyle(.secondary)
        HStack(spacing: 8) {
          Text(candidate.dateText)
          if candidate.sources.count > 1 {
            Text("\(candidate.sources.count) emails")
          }
          if candidate.confidence != "high" {
            Text("Review")
              .foregroundStyle(.orange)
          }
        }
        .font(.caption)
        .foregroundStyle(.secondary)
      }

      Spacer(minLength: 4)

      Button("Edit", systemImage: "pencil", action: edit)
        .labelStyle(.iconOnly)
        .buttonStyle(.borderless)
    }
    .padding(.vertical, 4)
    .accessibilityElement(children: .contain)
  }
}

private struct GmailCandidateEditor: View {
  @Environment(\.dismiss) private var dismiss
  let candidate: GmailImportCandidate
  let save: (GmailImportCandidate) -> Void

  var body: some View {
    NavigationStack {
      switch candidate {
      case .travel(let travel):
        GmailTravelCandidateEditor(candidate: travel) { updated in
          save(.travel(updated))
          dismiss()
        }
      case .stay(let stay):
        GmailStayCandidateEditor(candidate: stay) { updated in
          save(.stay(updated))
          dismiss()
        }
      }
    }
  }
}

private struct GmailTravelCandidateEditor: View {
  @Environment(\.dismiss) private var dismiss
  let candidate: GmailTravelCandidate
  let save: (GmailTravelCandidate) -> Void

  @State private var input: GmailTravelInput
  @State private var bookingURLText: String

  init(candidate: GmailTravelCandidate, save: @escaping (GmailTravelCandidate) -> Void) {
    self.candidate = candidate
    self.save = save
    _input = State(initialValue: candidate.input)
    _bookingURLText = State(initialValue: candidate.input.bookingURL?.absoluteString ?? "")
  }

  var body: some View {
    Form {
      Section("Booking") {
        LabeledContent("Type", value: input.type.displayName)
        Picker("Status", selection: $input.status) {
          Text("Planning").tag(ReservationStatus.planning)
          Text("Booked").tag(ReservationStatus.booked)
        }
      }

      Section(input.kind == .rental ? "Pickup and return" : "Route") {
        TextField("Departure", text: $input.departureLocation)
        TextField("Arrival", text: $input.arrivalLocation)
        DatePicker("Departs", selection: departureBinding)
        if input.arrivalAt != nil || input.kind == .rental {
          DatePicker("Arrives", selection: arrivalBinding)
          if input.kind != .rental {
            Button("Remove Arrival", role: .destructive) { input.arrivalAt = nil }
          }
        } else {
          Button("Add Arrival", systemImage: "plus") {
            input.arrivalAt = input.departureAt
          }
        }
      }

      Section("Details") {
        TextField("Carrier", text: optionalText(\.carrier))
        TextField("Flight or route number", text: optionalText(\.referenceNumber))
        TextField("Vehicle", text: optionalText(\.vehicleDescription))
        TextField("Confirmation", text: optionalText(\.confirmationNumber))
        TextField("Booking URL", text: $bookingURLText)
          .textInputAutocapitalization(.never)
          .keyboardType(.URL)
        TextField("Notes", text: optionalText(\.notes), axis: .vertical)
          .lineLimit(2...6)
      }
    }
    .navigationTitle("Edit Booking")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          input.departureLocation = input.departureLocation.trimmingCharacters(in: .whitespacesAndNewlines)
          input.arrivalLocation = input.arrivalLocation.trimmingCharacters(in: .whitespacesAndNewlines)
          input.bookingURL = validatedWebURL(from: bookingURLText)
          var updated = candidate
          updated.input = input
          save(updated)
        }
        .disabled(!valid)
      }
    }
  }

  private var valid: Bool {
    !input.departureLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !input.arrivalLocation.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && (input.kind != .rental || input.arrivalAt != nil)
      && (bookingURLText.nilIfBlank == nil || validatedWebURL(from: bookingURLText) != nil)
  }

  private var departureBinding: Binding<Date> {
    Binding(
      get: { input.departureAt.dateValue },
      set: { input.departureAt = LocalDateTime(dateValue: $0) }
    )
  }

  private var arrivalBinding: Binding<Date> {
    Binding(
      get: { (input.arrivalAt ?? input.departureAt).dateValue },
      set: { input.arrivalAt = LocalDateTime(dateValue: $0) }
    )
  }

  private func optionalText(_ keyPath: WritableKeyPath<GmailTravelInput, String?>) -> Binding<String> {
    Binding(
      get: { input[keyPath: keyPath] ?? "" },
      set: { input[keyPath: keyPath] = $0.nilIfBlank }
    )
  }
}

private struct GmailStayCandidateEditor: View {
  @Environment(\.dismiss) private var dismiss
  let candidate: GmailStayCandidate
  let save: (GmailStayCandidate) -> Void

  @State private var input: GmailStayInput
  @State private var bookingURLText: String

  init(candidate: GmailStayCandidate, save: @escaping (GmailStayCandidate) -> Void) {
    self.candidate = candidate
    self.save = save
    _input = State(initialValue: candidate.input)
    _bookingURLText = State(initialValue: candidate.input.bookingURL?.absoluteString ?? "")
  }

  var body: some View {
    Form {
      Section("Stay") {
        TextField("Property", text: $input.propertyName)
        TextField("Address", text: $input.address, axis: .vertical)
        DatePicker("Check-in", selection: checkInBinding, displayedComponents: .date)
        DatePicker("Check-out", selection: checkOutBinding, displayedComponents: .date)
        Picker("Status", selection: $input.status) {
          Text("Planning").tag(ReservationStatus.planning)
          Text("Booked").tag(ReservationStatus.booked)
        }
      }

      Section("Details") {
        TextField("Confirmation", text: optionalText(\.confirmationNumber))
        TextField("Booking URL", text: $bookingURLText)
          .textInputAutocapitalization(.never)
          .keyboardType(.URL)
        TextField("Notes", text: optionalText(\.notes), axis: .vertical)
          .lineLimit(2...6)
      }
    }
    .navigationTitle("Edit Stay")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Save") {
          input.propertyName = input.propertyName.trimmingCharacters(in: .whitespacesAndNewlines)
          input.address = input.address.trimmingCharacters(in: .whitespacesAndNewlines)
          input.bookingURL = validatedWebURL(from: bookingURLText)
          var updated = candidate
          updated.input = input
          save(updated)
        }
        .disabled(!valid)
      }
    }
  }

  private var valid: Bool {
    !input.propertyName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && !input.address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && input.checkOutDate >= input.checkInDate
      && (bookingURLText.nilIfBlank == nil || validatedWebURL(from: bookingURLText) != nil)
  }

  private var checkInBinding: Binding<Date> {
    Binding(
      get: { input.checkInDate.dateValue },
      set: { input.checkInDate = LocalDate(dateValue: $0) }
    )
  }

  private var checkOutBinding: Binding<Date> {
    Binding(
      get: { input.checkOutDate.dateValue },
      set: { input.checkOutDate = LocalDate(dateValue: $0) }
    )
  }

  private func optionalText(_ keyPath: WritableKeyPath<GmailStayInput, String?>) -> Binding<String> {
    Binding(
      get: { input[keyPath: keyPath] ?? "" },
      set: { input[keyPath: keyPath] = $0.nilIfBlank }
    )
  }
}

extension GmailImportCandidate {
  fileprivate var title: String {
    switch self {
    case .travel(let candidate):
      if candidate.input.kind == .rental {
        return candidate.input.carrier ?? "Rental car"
      }
      return "\(candidate.input.departureLocation) → \(candidate.input.arrivalLocation)"
    case .stay(let candidate): return candidate.input.propertyName
    }
  }

  fileprivate var subtitle: String {
    switch self {
    case .travel(let candidate):
      return [candidate.input.carrier, candidate.input.referenceNumber]
        .compactMap { $0?.nilIfBlank }
        .joined(separator: " · ")
    case .stay(let candidate): return candidate.input.address
    }
  }

  fileprivate var dateText: String {
    switch self {
    case .travel(let candidate): return candidate.input.departureAt.date.displayText
    case .stay(let candidate):
      return "\(candidate.input.checkInDate.displayText) – \(candidate.input.checkOutDate.displayText)"
    }
  }
}

extension URL {
  fileprivate func queryValue(named name: String) -> String? {
    URLComponents(url: self, resolvingAgainstBaseURL: false)?.queryItems?
      .first(where: { $0.name == name })?.value
  }
}

private func validatedWebURL(from value: String) -> URL? {
  guard let text = value.nilIfBlank,
    let url = URL(string: text),
    let scheme = url.scheme?.lowercased(),
    ["http", "https"].contains(scheme),
    url.host != nil
  else { return nil }
  return url
}

extension LocalDate {
  fileprivate init(dateValue: Date) {
    let components = Calendar.autoupdatingCurrent.dateComponents([.year, .month, .day], from: dateValue)
    self.init(
      rawValue: String(
        format: "%04d-%02d-%02d",
        components.year ?? 2001,
        components.month ?? 1,
        components.day ?? 1
      )
    )!
  }

  fileprivate var dateValue: Date {
    var components = DateComponents()
    let values = rawValue.split(separator: "-").compactMap { Int($0) }
    components.year = values[0]
    components.month = values[1]
    components.day = values[2]
    return Calendar.autoupdatingCurrent.date(from: components) ?? Date()
  }
}

extension LocalDateTime {
  fileprivate init(dateValue: Date) {
    let components = Calendar.autoupdatingCurrent.dateComponents(
      [.year, .month, .day, .hour, .minute],
      from: dateValue
    )
    self.init(
      rawValue: String(
        format: "%04d-%02d-%02dT%02d:%02d",
        components.year ?? 2001,
        components.month ?? 1,
        components.day ?? 1,
        components.hour ?? 0,
        components.minute ?? 0
      )
    )!
  }

  fileprivate var dateValue: Date {
    var components = DateComponents()
    let dateValues = date.rawValue.split(separator: "-").compactMap { Int($0) }
    let timeValues = time.rawValue.split(separator: ":").compactMap { Int($0) }
    components.year = dateValues[0]
    components.month = dateValues[1]
    components.day = dateValues[2]
    components.hour = timeValues[0]
    components.minute = timeValues[1]
    return Calendar.autoupdatingCurrent.date(from: components) ?? Date()
  }
}
