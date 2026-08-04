import SwiftUI

@MainActor
struct DestinationSearchView: View {
  let session: VoyageSession
  let onSelect: (String, TripStopLocationInput?) -> Void

  @Environment(\.dismiss) private var dismiss

  @State private var query: String
  @State private var searchState: SearchState = .idle
  @State private var sessionToken = UUID()
  @State private var resolvingPlaceID: String?
  @State private var resolutionError: String?

  init(
    session: VoyageSession,
    initialName: String,
    onSelect: @escaping (String, TripStopLocationInput?) -> Void
  ) {
    self.session = session
    self.onSelect = onSelect
    _query = State(initialValue: initialName)
  }

  private enum SearchState: Equatable {
    case idle
    case loading
    case loaded([LocationSuggestion])
    case failed(String)
  }

  var body: some View {
    NavigationStack {
      Group {
        switch searchState {
        case .idle:
          ContentUnavailableView(
            trimmedQuery.isEmpty ? "Search destinations" : "Keep typing",
            systemImage: "magnifyingglass",
            description: Text(
              trimmedQuery.isEmpty
                ? "Find a country, city, neighborhood, address, or place."
                : "Enter at least two characters."
            )
          )
        case .loading:
          ProgressView("Searching…")
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .loaded(let suggestions):
          resultsList(suggestions)
        case .failed(let message):
          VStack(spacing: 20) {
            ContentUnavailableView(
              "Couldn’t search destinations",
              systemImage: "wifi.exclamationmark",
              description: Text(message)
            )
            customDestinationButton
              .padding(.horizontal)
          }
        }
      }
      .navigationTitle("Destination")
      .navigationBarTitleDisplayMode(.inline)
      .searchable(text: $query, prompt: "Country, city, or address")
      .task(id: trimmedQuery) {
        await search()
      }
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
        }
      }
      .interactiveDismissDisabled(resolvingPlaceID != nil)
      .alert(
        "Couldn’t choose destination",
        isPresented: Binding(
          get: { resolutionError != nil },
          set: { if !$0 { resolutionError = nil } }
        )
      ) {
        Button("OK", role: .cancel) {}
      } message: {
        Text(resolutionError ?? "Please try again.")
      }
      .accessibilityIdentifier("destination.search.screen")
    }
  }

  @ViewBuilder
  private func resultsList(_ suggestions: [LocationSuggestion]) -> some View {
    List {
      if suggestions.isEmpty {
        ContentUnavailableView.search(text: trimmedQuery)
          .listRowBackground(Color.clear)
      } else {
        Section("Suggested destinations") {
          ForEach(suggestions) { suggestion in
            Button {
              Task { await choose(suggestion) }
            } label: {
              HStack(spacing: 12) {
                Image(systemName: suggestion.kind.systemImage)
                  .foregroundStyle(.secondary)
                  .frame(width: 24)
                VStack(alignment: .leading, spacing: 3) {
                  Text(suggestion.primaryText)
                    .foregroundStyle(.primary)
                  if let secondaryText = suggestion.secondaryText, !secondaryText.isEmpty {
                    Text(secondaryText)
                      .font(.subheadline)
                      .foregroundStyle(.secondary)
                      .lineLimit(2)
                  }
                }
                Spacer()
                if resolvingPlaceID == suggestion.placeID {
                  ProgressView()
                }
              }
            }
            .disabled(resolvingPlaceID != nil)
            .accessibilityIdentifier("destination.suggestion.\(suggestion.placeID)")
          }
        }
      }

      if !trimmedQuery.isEmpty {
        Section {
          customDestinationButton
        } footer: {
          Text("Custom destinations won’t include map details.")
        }
      }
    }
  }

  private var customDestinationButton: some View {
    Button {
      onSelect(trimmedQuery, nil)
      dismiss()
    } label: {
      Label("Use “\(trimmedQuery)”", systemImage: "pencil")
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .disabled(trimmedQuery.isEmpty || resolvingPlaceID != nil)
    .accessibilityIdentifier("destination.search.custom")
  }

  private var trimmedQuery: String {
    query.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func search() async {
    let searchQuery = trimmedQuery
    guard searchQuery.count >= 2 else {
      searchState = .idle
      return
    }

    do {
      try await Task.sleep(for: .milliseconds(300))
      guard !Task.isCancelled, searchQuery == trimmedQuery else { return }
      searchState = .loading
      let suggestions = try await session.locationSuggestions(
        query: searchQuery,
        sessionToken: sessionToken
      )
      guard !Task.isCancelled, searchQuery == trimmedQuery else { return }
      searchState = .loaded(suggestions)
    } catch is CancellationError {
      return
    } catch let error as APIError {
      guard searchQuery == trimmedQuery else { return }
      searchState = .failed(error.localizedDescription)
    } catch {
      guard searchQuery == trimmedQuery else { return }
      searchState = .failed("Please try again.")
    }
  }

  private func choose(_ suggestion: LocationSuggestion) async {
    resolvingPlaceID = suggestion.placeID
    resolutionError = nil
    defer { resolvingPlaceID = nil }

    do {
      let location = try await session.resolveLocation(
        placeID: suggestion.placeID,
        sessionToken: sessionToken
      )
      onSelect(suggestion.label, location)
      dismiss()
    } catch is CancellationError {
      return
    } catch let error as APIError {
      resolutionError = error.localizedDescription
    } catch {
      resolutionError = "Please try again."
    }
  }
}

extension LocationKind {
  fileprivate var systemImage: String {
    switch self {
    case .country:
      "globe"
    case .region:
      "map"
    case .city:
      "building.2"
    case .neighborhood:
      "house.and.flag"
    case .address:
      "mappin"
    default:
      "mappin.and.ellipse"
    }
  }
}
