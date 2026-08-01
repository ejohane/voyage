import SwiftUI

@MainActor
struct TripCreateView: View {
  let session: VoyageSession

  @Environment(\.dismiss) private var dismiss

  @State private var name = ""
  @State private var destination = ""
  @State private var destinationLocation: TripStopLocationInput?
  @State private var arrivalDate: Date?
  @State private var departureDate: Date?
  @State private var fieldErrors: [String: [String]] = [:]
  @State private var errorMessage: String?
  @State private var isSaving = false
  @State private var presentedSheet: PresentedSheet?

  @FocusState private var focusedField: Field?

  private enum Field: Hashable {
    case name
  }

  private enum PresentedSheet: String, Identifiable {
    case destination

    var id: String { rawValue }
  }

  var body: some View {
    NavigationStack {
      Form {
        Section("Trip") {
          TextField("Trip name", text: $name)
            .focused($focusedField, equals: .name)
            .textInputAutocapitalization(.words)
            .accessibilityIdentifier("trip.create.name")
          TripFieldErrorText(messages: errors(for: "name"))
        }

        Section {
          Button {
            presentedSheet = .destination
          } label: {
            HStack(spacing: 12) {
              Image(systemName: destinationLocation == nil ? "mappin" : "mappin.and.ellipse")
                .foregroundStyle(.secondary)
                .frame(width: 20)
              Text(destination.isEmpty ? "Search destinations" : destination)
                .foregroundStyle(destination.isEmpty ? .secondary : .primary)
              Spacer()
              Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.tertiary)
            }
          }
          .accessibilityIdentifier("trip.create.destination")
          TripFieldErrorText(messages: destinationErrors)

          OptionalTripDateField(
            "Arrival",
            selection: $arrivalDate,
            defaultDate: Date(),
            accessibilityIdentifier: "trip.create.arrival"
          )
          OptionalTripDateField(
            "Departure",
            selection: $departureDate,
            defaultDate: defaultDepartureDate,
            earliestDate: arrivalDate,
            accessibilityIdentifier: "trip.create.departure"
          )
          TripFieldErrorText(messages: errors(for: "stops.0.departureDate"))
        } header: {
          Text("Destination")
        } footer: {
          Text("You can add more destinations and details after creating the trip.")
        }
      }
      .navigationTitle("New Trip")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
            .disabled(isSaving)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("Create") {
            Task { await save() }
          }
          .disabled(isSaving || !hasTripName)
          .accessibilityIdentifier("trip.create.save")
        }
      }
      .overlay {
        if isSaving {
          ProgressView("Creating trip…")
            .padding()
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
      }
      .interactiveDismissDisabled(isSaving)
      .sheet(item: $presentedSheet) { sheet in
        switch sheet {
        case .destination:
          DestinationSearchView(session: session, initialName: destination) { name, location in
            destination = name
            destinationLocation = location
            fieldErrors.removeValue(forKey: "stops")
            fieldErrors.removeValue(forKey: "stops.0.name")
          }
        }
      }
      .alert(
        "Couldn’t create trip",
        isPresented: Binding(
          get: { errorMessage != nil },
          set: { if !$0 { errorMessage = nil } }
        )
      ) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(errorMessage ?? "Please try again.")
      }
      .onAppear {
        focusedField = .name
      }
      .onChange(of: arrivalDate) { _, newValue in
        if let newValue, let existingDeparture = departureDate, existingDeparture < newValue {
          departureDate = newValue
        }
      }
      .accessibilityIdentifier("trip.create.sheet")
    }
  }

  private var destinationErrors: [String] {
    errors(for: "stops") + errors(for: "stops.0.name")
  }

  private var hasTripName: Bool {
    !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var defaultDepartureDate: Date {
    Calendar.current.date(byAdding: .day, value: 3, to: arrivalDate ?? Date()) ?? Date()
  }

  private func errors(for field: String) -> [String] {
    fieldErrors[field] ?? []
  }

  private func validatedInput() -> CreateTripInput? {
    let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let trimmedDestination = destination.trimmingCharacters(in: .whitespacesAndNewlines)
    var validationErrors: [String: [String]] = [:]

    if trimmedName.isEmpty {
      validationErrors["name"] = ["Enter a trip name."]
    } else if trimmedName.count > 80 {
      validationErrors["name"] = ["Keep the trip name to 80 characters or fewer."]
    }

    if trimmedDestination.isEmpty {
      validationErrors["stops.0.name"] = ["Enter a destination."]
    } else if trimmedDestination.count > 160 {
      validationErrors["stops.0.name"] = ["Keep the destination to 160 characters or fewer."]
    }

    if arrivalDate == nil, departureDate != nil {
      validationErrors["stops.0.departureDate"] = [
        "Choose an arrival date before the departure date."
      ]
    }

    fieldErrors = validationErrors
    guard validationErrors.isEmpty else { return nil }

    return CreateTripInput(
      name: trimmedName,
      stops: [
        TripStopInput(
          name: trimmedDestination,
          arrivalDate: arrivalDate.map { localDate(from: $0) },
          departureDate: departureDate.map { localDate(from: $0) },
          location: destinationLocation
        )
      ]
    )
  }

  private func localDate(from date: Date) -> LocalDate {
    let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return LocalDate(
      rawValue: String(
        format: "%04d-%02d-%02d",
        components.year ?? 1970,
        components.month ?? 1,
        components.day ?? 1
      )
    )!
  }

  private func save() async {
    guard let input = validatedInput() else { return }
    focusedField = nil
    fieldErrors = [:]
    errorMessage = nil
    isSaving = true
    defer { isSaving = false }

    do {
      try await session.createTrip(input: input)
      dismiss()
    } catch is CancellationError {
      return
    } catch let APIError.server(_, _, message, serverFieldErrors, _, _) {
      fieldErrors = serverFieldErrors
      if serverFieldErrors.isEmpty {
        errorMessage = message
      }
    } catch let error as APIError {
      errorMessage = error.localizedDescription
    } catch {
      errorMessage = "Please try again."
    }
  }
}

private struct OptionalTripDateField: View {
  let title: String
  @Binding var selection: Date?
  let defaultDate: Date
  let earliestDate: Date?
  let accessibilityIdentifier: String

  init(
    _ title: String,
    selection: Binding<Date?>,
    defaultDate: Date,
    earliestDate: Date? = nil,
    accessibilityIdentifier: String
  ) {
    self.title = title
    _selection = selection
    self.defaultDate = defaultDate
    self.earliestDate = earliestDate
    self.accessibilityIdentifier = accessibilityIdentifier
  }

  var body: some View {
    HStack {
      Text(title)

      Spacer()

      if selection != nil {
        if let earliestDate {
          DatePicker(
            title,
            selection: dateBinding,
            in: earliestDate...,
            displayedComponents: .date
          )
          .labelsHidden()
        } else {
          DatePicker(title, selection: dateBinding, displayedComponents: .date)
            .labelsHidden()
        }

        Button {
          selection = nil
        } label: {
          Image(systemName: "xmark.circle.fill")
            .foregroundStyle(.tertiary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Clear \(title.lowercased()) date")
      } else {
        Button("Add Date") {
          selection = defaultDate
        }
      }
    }
    .accessibilityIdentifier(accessibilityIdentifier)
  }

  private var dateBinding: Binding<Date> {
    Binding(
      get: { selection ?? defaultDate },
      set: { selection = $0 }
    )
  }
}

private struct TripFieldErrorText: View {
  let messages: [String]

  var body: some View {
    ForEach(messages, id: \.self) { message in
      Text(message)
        .font(.caption)
        .foregroundStyle(.red)
    }
  }
}
