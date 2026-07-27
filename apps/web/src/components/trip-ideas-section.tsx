import type {
  CreatePlanInput,
  PlanCategory,
  Trip,
  TripPlan,
  UpdatePlanInput,
} from "@voyage/contracts";
import { ExternalLink, Lightbulb, LoaderCircle, Plus, Search, Trash2, Undo2 } from "lucide-react";
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { PlanForm } from "@/components/plan-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceInspector } from "@/components/workspace-inspector";
import { useCreatePlan, useDeletePlan, usePlans, useUpdatePlan } from "@/lib/planning";
import { cn } from "@/lib/utils";

const categories: { label: string; value: PlanCategory }[] = [
  { label: "Activity", value: "activity" },
  { label: "Food", value: "food" },
  { label: "Event", value: "event" },
  { label: "Sightseeing", value: "sightseeing" },
  { label: "Other", value: "other" },
];

type InspectorState = { mode: "new" } | { mode: "edit"; ideaId: string };
type Notice = { kind: "error" | "saved"; message: string };

function TripIdeasSection({ trip }: { trip: Trip }) {
  const plans = usePlans(trip.id);
  const createPlan = useCreatePlan(trip.id);
  const canEdit = trip.accessLevel !== "viewer";
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stopFilter, setStopFilter] = useState("all");
  const [inspector, setInspector] = useState<InspectorState>();
  const [pendingDelete, setPendingDelete] = useState<TripPlan>();
  const [notice, setNotice] = useState<Notice>();

  const ideas = useMemo(
    () => (plans.data ?? []).filter((plan) => !plan.scheduledDate && plan.id !== pendingDelete?.id),
    [pendingDelete?.id, plans.data],
  );
  const selectedIdea =
    inspector?.mode === "edit"
      ? (plans.data ?? []).find((plan) => plan.id === inspector.ideaId)
      : undefined;
  const filteredIdeas = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    return ideas.filter((idea) => {
      if (categoryFilter !== "all" && idea.category !== categoryFilter) return false;
      if (stopFilter !== "all" && idea.tripStopId !== stopFilter) return false;
      if (!query) return true;

      return [idea.title, idea.location, idea.notes]
        .filter(Boolean)
        .some((value) => value?.toLocaleLowerCase().includes(query));
    });
  }, [categoryFilter, ideas, search, stopFilter]);

  useEffect(() => {
    function handleShortcut(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (event.key === "Escape" && inspector) {
        setInspector(undefined);
        return;
      }
      if (isTyping || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (canEdit && event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        setInspector({ mode: "new" });
      }
    }

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [canEdit, inspector]);

  async function handleCreateDetailedIdea(input: CreatePlanInput) {
    const idea = await createPlan.mutateAsync(input);
    if (idea.scheduledDate) {
      setInspector(undefined);
      setNotice({ kind: "saved", message: "Plan added to the itinerary." });
    } else {
      setInspector({ mode: "edit", ideaId: idea.id });
      setNotice({ kind: "saved", message: "Idea added." });
    }
    window.setTimeout(() => setNotice(undefined), 3_000);
  }

  function requestDelete(idea: TripPlan) {
    setPendingDelete(idea);
    if (inspector?.mode === "edit" && inspector.ideaId === idea.id) setInspector(undefined);
  }

  return (
    <section aria-labelledby="ideas-heading">
      <div
        className={cn("min-w-0 transition-[padding] duration-200", inspector && "lg:pr-[28rem]")}
      >
        <div className="min-w-0">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 id="ideas-heading" className="text-xl font-semibold tracking-tight">
                Idea board
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Capture possibilities now. Schedule the keepers when the trip takes shape.
              </p>
            </div>
            {canEdit && !inspector ? (
              <Button size="lg" onClick={() => setInspector({ mode: "new" })}>
                <Plus className="size-4.5" aria-hidden="true" />
                New idea
              </Button>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 pb-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                ref={searchRef}
                aria-label="Search ideas"
                className="pl-9"
                placeholder="Search ideas, notes, or locations"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger aria-label="Filter by category" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((item) => (
                  <SelectItem value={item.value} key={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stopFilter} onValueChange={setStopFilter}>
              <SelectTrigger aria-label="Filter by destination" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All destinations</SelectItem>
                {trip.stops.map((stop) => (
                  <SelectItem value={stop.id} key={stop.id}>
                    {stop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {filteredIdeas.length} of {ideas.length}
            </span>
          </div>

          <div className="border-t">
            <IdeasTable
              canEdit={canEdit}
              ideas={filteredIdeas}
              isError={plans.isError}
              isPending={plans.isPending}
              onDelete={requestDelete}
              onRetry={() => void plans.refetch()}
              onSelect={(idea) => setInspector({ mode: "edit", ideaId: idea.id })}
              selectedId={selectedIdea?.id}
              trip={trip}
              unfilteredCount={ideas.length}
            />
          </div>
        </div>
      </div>

      {inspector ? (
        <IdeaInspector
          inspector={inspector}
          idea={selectedIdea}
          onClose={() => setInspector(undefined)}
          onCreate={handleCreateDetailedIdea}
          onScheduled={() => {
            setInspector(undefined);
            setNotice({ kind: "saved", message: "Idea moved to the itinerary." });
            window.setTimeout(() => setNotice(undefined), 3_000);
          }}
          trip={trip}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteUndoToast
          idea={pendingDelete}
          onError={() => {
            setPendingDelete(undefined);
            setNotice({ kind: "error", message: "We couldn’t remove that idea. Try again." });
          }}
          onFinished={() => setPendingDelete(undefined)}
          onUndo={() => setPendingDelete(undefined)}
          tripId={trip.id}
        />
      ) : null}

      {notice ? (
        <div
          className={cn(
            "fixed bottom-5 right-5 z-50 rounded-md border bg-background px-4 py-3 text-sm shadow-lg",
            notice.kind === "error" && "border-red-200 text-red-700",
          )}
          role="status"
        >
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}

function IdeasTable({
  canEdit,
  ideas,
  isError,
  isPending,
  onDelete,
  onRetry,
  onSelect,
  selectedId,
  trip,
  unfilteredCount,
}: {
  canEdit: boolean;
  ideas: TripPlan[];
  isError: boolean;
  isPending: boolean;
  onDelete: (idea: TripPlan) => void;
  onRetry: () => void;
  onSelect: (idea: TripPlan) => void;
  selectedId?: string;
  trip: Trip;
  unfilteredCount: number;
}) {
  if (isPending) {
    return (
      <div className="space-y-1 p-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="grid min-h-48 place-items-center p-6 text-center">
        <div>
          <p className="font-medium">We couldn’t load your ideas.</p>
          <Button className="mt-3" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!ideas.length) {
    return (
      <div className="grid min-h-48 place-items-center p-6 text-center">
        <div>
          <Lightbulb className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">
            {unfilteredCount ? "No ideas match these filters" : "Your idea board is open"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {unfilteredCount
              ? "Adjust the search or filters to see more."
              : "Jot down restaurants, sights, reminders, and maybes as they come up."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[47rem] table-fixed text-sm">
        <thead className="border-b bg-muted/35 text-left text-xs font-medium text-muted-foreground">
          <tr>
            <th className="w-[29%] px-4 py-2.5">Idea</th>
            <th className="w-[16%] px-3 py-2.5">Category</th>
            <th className="w-[18%] px-3 py-2.5">Destination</th>
            <th className="w-[22%] px-3 py-2.5">Location</th>
            <th className="w-16 px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ideas.map((idea) => (
            <IdeaRow
              canEdit={canEdit}
              idea={idea}
              isSelected={idea.id === selectedId}
              key={idea.id}
              onDelete={() => onDelete(idea)}
              onSelect={() => onSelect(idea)}
              trip={trip}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IdeaRow({
  canEdit,
  idea,
  isSelected,
  onDelete,
  onSelect,
  trip,
}: {
  canEdit: boolean;
  idea: TripPlan;
  isSelected: boolean;
  onDelete: () => void;
  onSelect: () => void;
  trip: Trip;
}) {
  const update = useUpdatePlan(trip.id, idea.id);
  const [rowError, setRowError] = useState<string>();

  async function updateField(input: UpdatePlanInput) {
    setRowError(undefined);
    try {
      await update.mutateAsync(input);
    } catch {
      setRowError("Couldn’t save");
    }
  }

  return (
    <tr
      className={cn(
        "group cursor-pointer transition-colors hover:bg-muted/25",
        isSelected && "bg-blue-50/70 hover:bg-blue-50/70",
      )}
      onClick={onSelect}
    >
      <td className="px-4 py-2 align-middle">
        {canEdit ? (
          <EditableText
            ariaLabel={`Edit ${idea.title}`}
            className="font-medium"
            value={idea.title}
            onSave={(value) => updateField({ title: value })}
          />
        ) : (
          <p className="truncate font-medium">{idea.title}</p>
        )}
        {rowError ? <p className="mt-0.5 text-[0.68rem] text-red-600">{rowError}</p> : null}
        {idea.bookingUrl ? (
          <a
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            href={idea.bookingUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            Open link <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </td>
      <td className="px-3 py-2 align-middle">
        {canEdit ? (
          <Select
            value={idea.category}
            onValueChange={(value) => void updateField({ category: value as PlanCategory })}
          >
            <SelectTrigger
              aria-label={`Category for ${idea.title}`}
              className="h-7 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border hover:bg-background"
              onClick={(event) => event.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {categories.map((item) => (
                <SelectItem value={item.value} key={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          idea.category
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        {canEdit ? (
          <Select
            value={idea.tripStopId}
            onValueChange={(value) => void updateField({ tripStopId: value })}
          >
            <SelectTrigger
              aria-label={`Destination for ${idea.title}`}
              className="h-7 border-transparent bg-transparent px-2 text-xs shadow-none hover:border-border hover:bg-background"
              onClick={(event) => event.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {trip.stops.map((stop) => (
                <SelectItem value={stop.id} key={stop.id}>
                  {stop.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          (trip.stops.find((stop) => stop.id === idea.tripStopId)?.name ?? "—")
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        {canEdit ? (
          <EditableText
            allowEmpty
            ariaLabel={`Location for ${idea.title}`}
            placeholder="Add location"
            value={idea.location ?? ""}
            onSave={(value) => updateField({ location: value || null })}
          />
        ) : (
          <span className="text-muted-foreground">{idea.location || "—"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right align-middle">
        {canEdit ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-8 opacity-60 hover:opacity-100"
            aria-label={`Remove ${idea.title}`}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        ) : null}
      </td>
    </tr>
  );
}

function EditableText({
  allowEmpty = false,
  ariaLabel,
  className,
  onSave,
  placeholder = "Add value",
  value,
}: {
  allowEmpty?: boolean;
  ariaLabel: string;
  className?: string;
  onSave: (value: string) => Promise<void>;
  placeholder?: string;
  value: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  async function save() {
    const nextValue = draft.trim();
    if (!nextValue && !allowEmpty) {
      setDraft(value);
      setEditing(false);
      return;
    }
    if (nextValue !== value) await onSave(nextValue);
    setEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(value);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <Input
        aria-label={ariaLabel}
        autoFocus
        className="h-7 px-2"
        value={draft}
        onBlur={() => void save()}
        onChange={(event) => setDraft(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "block w-full truncate rounded-sm px-2 py-1 text-left text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        value && "text-foreground",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
    >
      {value || placeholder}
    </button>
  );
}

function IdeaInspector({
  idea,
  inspector,
  onClose,
  onCreate,
  onScheduled,
  trip,
}: {
  idea?: TripPlan;
  inspector: InspectorState;
  onClose: () => void;
  onCreate: (input: CreatePlanInput) => Promise<void>;
  onScheduled: () => void;
  trip: Trip;
}) {
  const update = useUpdatePlan(trip.id, idea?.id ?? "");
  const isNew = inspector.mode === "new";

  async function handleUpdate(input: CreatePlanInput) {
    if (!idea) return;
    await update.mutateAsync(input);
    if (input.scheduledDate) onScheduled();
  }

  return (
    <WorkspaceInspector
      className="animate-in border-l-2 border-l-blue-600 fade-in slide-in-from-right-4 duration-200"
      eyebrow={isNew ? "New idea" : "Idea details"}
      title={isNew ? "Capture a possibility" : (idea?.title ?? "Loading idea…")}
      description={
        isNew
          ? "Add as much or as little context as you have."
          : "Edit details here without leaving the board."
      }
      onClose={onClose}
    >
      {isNew ? (
        <PlanForm
          key="new-idea"
          presentation="inspector"
          stops={trip.stops}
          onCancel={onClose}
          onSubmit={onCreate}
          submitLabel="Add idea"
        />
      ) : idea ? (
        <PlanForm
          key={`${idea.id}:${idea.updatedAt}`}
          initialPlan={idea}
          presentation="inspector"
          stops={trip.stops}
          onCancel={onClose}
          onSubmit={handleUpdate}
        />
      ) : (
        <div className="grid min-h-40 place-items-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-label="Loading idea" />
        </div>
      )}
    </WorkspaceInspector>
  );
}

function DeleteUndoToast({
  idea,
  onError,
  onFinished,
  onUndo,
  tripId,
}: {
  idea: TripPlan;
  onError: () => void;
  onFinished: () => void;
  onUndo: () => void;
  tripId: string;
}) {
  const remove = useDeletePlan(tripId, idea.id);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void remove.mutateAsync().then(onFinished).catch(onError);
    }, 5_000);
    return () => window.clearTimeout(timeout);
  }, [onError, onFinished, remove.mutateAsync]);

  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex items-center gap-4 rounded-md border bg-foreground px-4 py-3 text-sm text-background shadow-xl"
      role="status"
    >
      <span className="max-w-64 truncate">Removed “{idea.title}”</span>
      <Button size="sm" variant="secondary" onClick={onUndo}>
        <Undo2 className="size-3.5" aria-hidden="true" />
        Undo
      </Button>
    </div>
  );
}

export { TripIdeasSection };
