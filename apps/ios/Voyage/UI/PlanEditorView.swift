import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum PlanEditorMode: Identifiable {
  case create(idempotencyKey: UUID)
  case edit(Plan)

  var id: String {
    switch self {
    case .create(let key): "create-\(key.uuidString.lowercased())"
    case .edit(let plan): "edit-\(plan.id.uuidString.lowercased())"
    }
  }

  var plan: Plan? {
    guard case .edit(let plan) = self else { return nil }
    return plan
  }
}

@MainActor
struct PlanEditorView: View {
  let session: VoyageSession
  let workspace: TripWorkspace
  let mode: PlanEditorMode

  @Environment(\.dismiss) private var dismiss

  @State private var selectedStopID: UUID
  @State private var title: String
  @State private var category: PlanCategory
  @State private var status: PlanStatus
  @State private var scheduledDate: Date
  @State private var hasStartTime: Bool
  @State private var startTime: Date
  @State private var hasEndTime: Bool
  @State private var endTime: Date
  @State private var location: String
  @State private var confirmationNumber: String
  @State private var bookingURL: String
  @State private var notes: String
  @State private var fieldErrors: [String: [String]] = [:]
  @State private var presentedAlert: PlanEditorAlert?
  @State private var showDeleteConfirmation = false
  @State private var ambiguousCreateInput: ScheduledPlanInput?

  @FocusState private var titleIsFocused: Bool

  private let categories: [PlanCategory] = [.activity, .food, .event, .sightseeing, .other]
  private let statuses: [PlanStatus] = [.planned, .booked]

  init(session: VoyageSession, workspace: TripWorkspace, mode: PlanEditorMode) {
    self.session = session
    self.workspace = workspace
    self.mode = mode

    let plan = mode.plan
    let stopID =
      plan?.tripStopID ?? workspace.trip.stops.sorted(by: { $0.position < $1.position }).first?.id
      ?? UUID()
    _selectedStopID = State(initialValue: stopID)
    _title = State(initialValue: plan?.title ?? "")
    _category = State(initialValue: plan?.category ?? .activity)
    _status = State(initialValue: plan?.status ?? .planned)
    _scheduledDate = State(
      initialValue: plan?.scheduledDate.localDateValue ?? workspace.trip.startDate?.localDateValue ?? Date())

    let startDate = plan?.startTime?.clockDateValue ?? Self.defaultClockDate(hour: 9)
    let endDate = plan?.endTime?.clockDateValue ?? Self.defaultClockDate(hour: 10)
    _hasStartTime = State(initialValue: plan?.startTime != nil)
    _startTime = State(initialValue: startDate)
    _hasEndTime = State(initialValue: plan?.endTime != nil)
    _endTime = State(initialValue: endDate)
    _location = State(initialValue: plan?.location ?? "")
    _confirmationNumber = State(initialValue: plan?.confirmationNumber ?? "")
    _bookingURL = State(initialValue: plan?.bookingURL?.absoluteString ?? "")
    _notes = State(initialValue: plan?.notes ?? "")
  }

  private var isWorking: Bool {
    switch session.planMutationState {
    case .saving, .deleting: true
    case .idle, .failed: false
    }
  }

  private var isAmbiguousCreateRetry: Bool {
    ambiguousCreateInput != nil
  }

  var body: some View {
    NavigationStack {
      Form {
        if isAmbiguousCreateRetry {
          Section {
            Label(
              "Voyage couldn’t confirm whether the plan was saved. Retry with the same details to safely resolve it.",
              systemImage: "arrow.clockwise.circle"
            )
            .foregroundStyle(.orange)
          }
        }

        Section("Plan") {
          TextField("Title", text: $title)
            .focused($titleIsFocused)
            .disabled(isAmbiguousCreateRetry)
            .accessibilityIdentifier("plan.editor.title")
          FieldErrorText(messages: errors(for: "title"))

          Picker("Destination", selection: $selectedStopID) {
            ForEach(workspace.trip.stops.sorted(by: { $0.position < $1.position })) { stop in
              Text(stop.name).tag(stop.id)
            }
          }
          .disabled(isAmbiguousCreateRetry)
          .accessibilityIdentifier("plan.editor.destination")
          FieldErrorText(messages: errors(for: "tripStopId"))

          Picker("Category", selection: $category) {
            ForEach(categories, id: \.rawValue) { value in
              Label(value.displayName, systemImage: value.systemImage).tag(value)
            }
          }
          .disabled(isAmbiguousCreateRetry)

          Picker("Status", selection: $status) {
            ForEach(statuses, id: \.rawValue) { value in
              Text(value.displayName).tag(value)
            }
          }
          .disabled(isAmbiguousCreateRetry)
        }

        Section("Schedule") {
          DatePicker("Date", selection: $scheduledDate, displayedComponents: .date)
            .disabled(isAmbiguousCreateRetry)
            .accessibilityIdentifier("plan.editor.date")
          FieldErrorText(messages: errors(for: "scheduledDate"))

          Toggle("Start time", isOn: $hasStartTime)
            .disabled(isAmbiguousCreateRetry)
          if hasStartTime {
            DatePicker("Starts", selection: $startTime, displayedComponents: .hourAndMinute)
              .disabled(isAmbiguousCreateRetry)
          }

          Toggle("End time", isOn: $hasEndTime)
            .disabled(!hasStartTime || isAmbiguousCreateRetry)
            .onChange(of: hasStartTime) { _, enabled in
              if !enabled { hasEndTime = false }
            }
          if hasStartTime && hasEndTime {
            DatePicker("Ends", selection: $endTime, displayedComponents: .hourAndMinute)
              .disabled(isAmbiguousCreateRetry)
            FieldErrorText(messages: errors(for: "endTime"))
          }
        }

        Section("Optional Details") {
          TextField("Location", text: $location)
            .disabled(isAmbiguousCreateRetry)
          FieldErrorText(messages: errors(for: "location"))

          TextField("Confirmation number", text: $confirmationNumber)
            .textInputAutocapitalization(.characters)
            .disabled(isAmbiguousCreateRetry)
          FieldErrorText(messages: errors(for: "confirmationNumber"))

          TextField("Booking URL", text: $bookingURL)
            .keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .disabled(isAmbiguousCreateRetry)
          FieldErrorText(messages: errors(for: "bookingUrl"))

          TextField("Notes", text: $notes, axis: .vertical)
            .lineLimit(3...8)
            .disabled(isAmbiguousCreateRetry)
          FieldErrorText(messages: errors(for: "notes"))
        }

        if case .edit = mode {
          Section {
            Button("Delete Plan", role: .destructive) {
              showDeleteConfirmation = true
            }
            .disabled(isWorking)
            .accessibilityIdentifier("plan.editor.delete")
          }
        }
      }
      .voyageListSurface()
      .navigationTitle(mode.plan == nil ? "New Plan" : "Edit Plan")
      .navigationBarTitleDisplayMode(.inline)
      .interactiveDismissDisabled(isWorking || isAmbiguousCreateRetry)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { dismiss() }
            .disabled(isWorking)
        }
        ToolbarItem(placement: .confirmationAction) {
          Button(isAmbiguousCreateRetry ? "Retry" : "Save") {
            Task { await save() }
          }
          .fontWeight(.semibold)
          .disabled(isWorking)
          .accessibilityIdentifier("plan.editor.save")
        }
      }
      .overlay {
        if isWorking {
          ProgressView(
            session.planMutationState == .deleting ? "Deleting…" : "Saving…"
          )
          .padding()
          .background(VoyagePalette.surface, in: RoundedRectangle(cornerRadius: 16))
          .shadow(color: .black.opacity(0.12), radius: 18, y: 8)
        }
      }
      .alert(item: $presentedAlert) { alert in
        switch alert {
        case .message(let title, let message):
          Alert(
            title: Text(title),
            message: Text(message),
            dismissButton: .default(Text("OK"))
          )
        case .conflict(let message):
          Alert(
            title: Text("Plan Changed"),
            message: Text(message),
            dismissButton: .default(Text("Close")) { dismiss() }
          )
        }
      }
      .confirmationDialog(
        "Delete this plan?",
        isPresented: $showDeleteConfirmation,
        titleVisibility: .visible
      ) {
        Button("Delete Plan", role: .destructive) {
          Task { await delete() }
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("This removes the plan for everyone on the trip.")
      }
      .onAppear {
        if mode.plan == nil { titleIsFocused = true }
      }
    }
    .accessibilityIdentifier("plan.editor")
  }

  private func errors(for field: String) -> [String] {
    fieldErrors[field] ?? []
  }

  private func validate() -> [String: [String]] {
    var errors: [String: [String]] = [:]
    let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
    if cleanTitle.isEmpty {
      errors["title"] = ["Enter a title."]
    } else if cleanTitle.count > 160 {
      errors["title"] = ["Keep the title under 160 characters."]
    }
    if !workspace.trip.stops.contains(where: { $0.id == selectedStopID }) {
      errors["tripStopId"] = ["Choose a destination from this trip."]
    }
    if location.trimmingCharacters(in: .whitespacesAndNewlines).count > 300 {
      errors["location"] = ["Keep the location under 300 characters."]
    }
    if confirmationNumber.trimmingCharacters(in: .whitespacesAndNewlines).count > 120 {
      errors["confirmationNumber"] = ["Keep the confirmation number under 120 characters."]
    }
    if notes.trimmingCharacters(in: .whitespacesAndNewlines).count > 2_000 {
      errors["notes"] = ["Keep notes under 2,000 characters."]
    }
    if let urlText = bookingURL.nilIfBlank {
      let url = URL(string: urlText)
      if url?.scheme?.lowercased() != "https" && url?.scheme?.lowercased() != "http" {
        errors["bookingUrl"] = ["Enter a valid http or https URL."]
      }
    }
    if hasStartTime && hasEndTime,
      LocalTime(clockDate: endTime) < LocalTime(clockDate: startTime)
    {
      errors["endTime"] = ["End time must be on or after the start time."]
    }
    return errors
  }

  private func makeInput() -> ScheduledPlanInput {
    ScheduledPlanInput(
      tripStopID: selectedStopID,
      title: title.trimmingCharacters(in: .whitespacesAndNewlines),
      category: category,
      status: status,
      scheduledDate: LocalDate(calendarDate: scheduledDate),
      startTime: hasStartTime ? LocalTime(clockDate: startTime) : nil,
      endTime: hasStartTime && hasEndTime ? LocalTime(clockDate: endTime) : nil,
      location: location.nilIfBlank,
      confirmationNumber: confirmationNumber.nilIfBlank,
      bookingURL: bookingURL.nilIfBlank.flatMap(URL.init(string:)),
      notes: notes.nilIfBlank
    )
  }

  private func save() async {
    let validationErrors = validate()
    guard validationErrors.isEmpty else {
      fieldErrors = validationErrors
      return
    }

    fieldErrors = [:]
    let input = makeInput()
    do {
      switch mode {
      case .create(let idempotencyKey):
        if let ambiguousCreateInput, ambiguousCreateInput != input {
          presentedAlert = .message(
            title: "Details Locked for Retry",
            message: "Retry the original request unchanged so Voyage can safely prevent a duplicate."
          )
          return
        }
        try await session.createPlan(
          tripID: workspace.trip.id,
          input: input,
          idempotencyKey: idempotencyKey
        )
      case .edit(let plan):
        try await session.updatePlan(
          tripID: workspace.trip.id,
          planID: plan.id,
          expectedRevision: plan.revision,
          input: input
        )
      }
      dismiss()
    } catch let error as APIError {
      await handle(error, submittedInput: input)
    } catch is CancellationError {
      return
    } catch {
      presentedAlert = .message(title: "Couldn’t Save Plan", message: error.localizedDescription)
    }
  }

  private func delete() async {
    guard let plan = mode.plan else { return }
    do {
      try await session.deletePlan(
        tripID: workspace.trip.id,
        planID: plan.id,
        expectedRevision: plan.revision
      )
      dismiss()
    } catch let error as APIError {
      await handle(error, submittedInput: nil)
    } catch is CancellationError {
      return
    } catch {
      presentedAlert = .message(title: "Couldn’t Delete Plan", message: error.localizedDescription)
    }
  }

  private func handle(_ error: APIError, submittedInput: ScheduledPlanInput?) async {
    switch error {
    case .server(let status, let code, let message, _, _, _)
    where status == 409 || code == "conflict":
      await session.loadWorkspace(tripID: workspace.trip.id, forceRefresh: true)
      presentedAlert = .conflict(
        message.isEmpty
          ? "Voyage refreshed the latest version. Close this editor and review it before trying again."
          : "\(message) Voyage refreshed the latest version; close this editor and review it before trying again."
      )
    case .server(_, _, let message, let serverFieldErrors, _, _)
    where !serverFieldErrors.isEmpty:
      fieldErrors = serverFieldErrors
      if fieldErrors.values.allSatisfy(\.isEmpty) {
        presentedAlert = .message(title: "Couldn’t Save Plan", message: message)
      }
    case .transport where mode.plan == nil:
      ambiguousCreateInput = submittedInput
    default:
      presentedAlert = .message(
        title: mode.plan == nil ? "Couldn’t Save Plan" : "Couldn’t Update Plan",
        message: error.localizedDescription
      )
    }
  }

  private static func defaultClockDate(hour: Int) -> Date {
    Calendar.current.date(from: DateComponents(year: 2001, month: 1, day: 1, hour: hour))
      ?? Date()
  }
}

@MainActor
struct PlanDetailView: View {
  let session: VoyageSession
  let workspace: TripWorkspace
  let plan: Plan

  @State private var editorMode: PlanEditorMode?

  private var latestWorkspace: TripWorkspace {
    guard case .loaded(let value, _, _) = session.workspaceState(for: workspace.trip.id) else {
      return workspace
    }
    return value
  }

  private var latestPlan: Plan? {
    latestWorkspace.plans.first(where: { $0.id == plan.id })
  }

  private var isOnline: Bool {
    guard case .loaded(_, _, let freshness) = session.workspaceState(for: workspace.trip.id) else {
      return false
    }
    return freshness == .fresh
  }

  var body: some View {
    Group {
      if let latestPlan {
        List {
          Section {
            LabeledContent("Status", value: latestPlan.status.displayName)
            LabeledContent("Category", value: latestPlan.category.displayName)
            LabeledContent("Date", value: latestPlan.scheduledDate.displayText)
            if let start = latestPlan.startTime {
              LabeledContent(
                "Time",
                value: latestPlan.endTime.map {
                  "\(start.displayText) – \($0.displayText)"
                } ?? start.displayText
              )
            }
            if let stop = latestWorkspace.trip.stops.first(where: { $0.id == latestPlan.tripStopID }) {
              LabeledContent("Destination", value: stop.name)
            }
          }

          if latestPlan.location != nil || latestPlan.confirmationNumber != nil || latestPlan.bookingURL != nil {
            Section("Details") {
              if let location = latestPlan.location?.nilIfBlank {
                LabeledContent("Location", value: location)
              }
              if let confirmation = latestPlan.confirmationNumber?.nilIfBlank {
                PlanCopyValueRow(label: "Confirmation", value: confirmation)
              }
              if let bookingURL = latestPlan.bookingURL {
                Link(destination: bookingURL) {
                  Label("Open Booking", systemImage: "arrow.up.right.square")
                }
              }
            }
          }

          if let notes = latestPlan.notes?.nilIfBlank {
            Section("Notes") {
              Text(notes)
                .textSelection(.enabled)
            }
          }

          if !isOnline {
            Section {
              Label("Reconnect to edit this plan.", systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
            }
          }
        }
        .toolbar {
          if isOnline && latestWorkspace.trip.accessLevel.canEditPlans {
            ToolbarItem(placement: .primaryAction) {
              Button("Edit") {
                editorMode = .edit(latestPlan)
              }
              .accessibilityIdentifier("plan.detail.edit")
            }
          }
        }
        .sheet(item: $editorMode) { mode in
          PlanEditorView(session: session, workspace: latestWorkspace, mode: mode)
        }
      } else {
        ContentUnavailableView(
          "Plan removed",
          systemImage: "trash",
          description: Text("This plan is no longer part of the trip.")
        )
      }
    }
    .navigationTitle(latestPlan?.title ?? plan.title)
    .navigationBarTitleDisplayMode(.inline)
    .accessibilityIdentifier("plan.detail")
  }
}

private struct FieldErrorText: View {
  let messages: [String]

  var body: some View {
    ForEach(messages, id: \.self) { message in
      Text(message)
        .font(.caption)
        .foregroundStyle(.red)
    }
  }
}

private struct PlanCopyValueRow: View {
  let label: String
  let value: String

  @State private var copied = false

  var body: some View {
    Button {
      UIPasteboard.general.setItems(
        [[UTType.plainText.identifier: value]],
        options: [
          .localOnly: true,
          .expirationDate: Date().addingTimeInterval(5 * 60),
        ]
      )
      copied = true
    } label: {
      HStack {
        LabeledContent(label, value: value)
        Image(systemName: copied ? "checkmark" : "doc.on.doc")
          .foregroundStyle(.secondary)
      }
    }
    .buttonStyle(.plain)
    .accessibilityLabel("Copy \(label), \(value)")
  }
}

private enum PlanEditorAlert: Identifiable {
  case message(title: String, message: String)
  case conflict(String)

  var id: String {
    switch self {
    case .message(let title, let message): "message-\(title)-\(message)"
    case .conflict(let message): "conflict-\(message)"
    }
  }
}

extension LocalDate {
  fileprivate init(calendarDate date: Date) {
    let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
    self = LocalDate(
      rawValue: String(
        format: "%04d-%02d-%02d",
        components.year ?? 1970,
        components.month ?? 1,
        components.day ?? 1
      )
    )!
  }

  fileprivate var localDateValue: Date {
    let parts = rawValue.split(separator: "-").compactMap { Int($0) }
    return Calendar.current.date(
      from: DateComponents(year: parts[0], month: parts[1], day: parts[2])
    ) ?? Date()
  }
}

extension LocalTime {
  fileprivate init(clockDate date: Date) {
    let components = Calendar.current.dateComponents([.hour, .minute], from: date)
    self = LocalTime(
      rawValue: String(
        format: "%02d:%02d",
        components.hour ?? 0,
        components.minute ?? 0
      )
    )!
  }

  fileprivate var clockDateValue: Date {
    let parts = rawValue.split(separator: ":").compactMap { Int($0) }
    return Calendar.current.date(
      from: DateComponents(year: 2001, month: 1, day: 1, hour: parts[0], minute: parts[1])
    ) ?? Date()
  }
}
