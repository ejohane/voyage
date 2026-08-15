import type {
  CreatePlanInput,
  ResearchCategory,
  ResearchItem,
  ResearchState,
  Trip,
  UpdateResearchItemInput,
} from "@voyage/contracts";
import {
  ArrowUpRight,
  ExternalLink,
  FileText,
  Lightbulb,
  LoaderCircle,
  Plus,
  Trash2,
} from "lucide-react";
import { type FormEvent, useMemo, useState } from "react";
import { FormField } from "@/components/form-field";
import { PlanForm } from "@/components/plan-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceInspector } from "@/components/workspace-inspector";
import { ApiRequestError } from "@/lib/api";
import {
  useCreateResearch,
  useDeleteResearch,
  usePromoteResearchToPlan,
  useResearch,
  useUpdateResearch,
} from "@/lib/research";
import { researchCaptureUrl } from "@/lib/research-feature";
import { cn } from "@/lib/utils";

const stateLabels: Record<ResearchState, string> = {
  inbox: "Inbox",
  considering: "Considering",
  shortlisted: "Shortlisted",
  dismissed: "Dismissed",
};

const categoryLabels: Record<ResearchCategory, string> = {
  place: "Place",
  activity: "Activity",
  food: "Food",
  stay: "Stay",
  transportation: "Transportation",
  logistics: "Logistics",
  other: "Other",
};

function planCategory(category: ResearchCategory | null): CreatePlanInput["category"] {
  if (category === "food") return "food";
  if (category === "place") return "sightseeing";
  if (category === "activity") return "activity";
  return "other";
}

function planDraft(item: ResearchItem, trip: Trip): Partial<CreatePlanInput> {
  const sourceUrl = item.sources.find((source) => source.originalUrl)?.originalUrl;
  return {
    tripStopId: item.tripStopId ?? (trip.stops.length === 1 ? trip.stops[0].id : undefined),
    title: item.title,
    category: planCategory(item.category),
    status: "planned",
    scheduledDate: null,
    startTime: null,
    endTime: null,
    location: item.attribution,
    confirmationNumber: null,
    bookingUrl: null,
    notes:
      [item.body, sourceUrl ? `Source: ${sourceUrl}` : null].filter(Boolean).join("\n\n") || null,
  };
}

function TripResearchSection({ trip }: { trip: Trip }) {
  const research = useResearch(trip.id);
  const createResearch = useCreateResearch(trip.id);
  const canEdit = trip.accessLevel !== "viewer";
  const [capture, setCapture] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const items = research.data ?? [];
  const selected = items.find((item) => item.id === selectedId);
  const visibleItems = useMemo(() => items.filter((item) => item.state !== "dismissed"), [items]);

  async function handleCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = capture.trim();
    if (!value) return;
    const url = researchCaptureUrl(value);
    try {
      const item = await createResearch.mutateAsync(
        url ? { source: { originalUrl: url } } : { body: value },
      );
      setCapture("");
      setSelectedId(item.id);
      setNotice(
        url
          ? "Link saved. Add details only if they help."
          : "Note saved. Add details only if they help.",
      );
    } catch (error) {
      setNotice(error instanceof ApiRequestError ? error.message : "We couldn’t save that yet.");
    }
  }

  return (
    <section aria-labelledby="research-heading">
      <div className={cn("min-w-0 transition-[padding] duration-200", selected && "lg:pr-[28rem]")}>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="research-heading" className="text-xl font-semibold tracking-tight">
              Research
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Drop in a link or note now. Organize it only when that becomes useful.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {visibleItems.length} {visibleItems.length === 1 ? "item" : "items"}
          </p>
        </div>

        {canEdit ? (
          <form
            className="mt-5 rounded-xl border bg-background p-3 shadow-sm"
            onSubmit={handleCapture}
          >
            <label className="sr-only" htmlFor="research-capture">
              Paste a link or add a note
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Textarea
                id="research-capture"
                className="min-h-20 flex-1 resize-none border-0 bg-muted/45 shadow-none focus-visible:ring-1"
                placeholder="Paste a link or add a note…"
                value={capture}
                onChange={(event) => setCapture(event.target.value)}
              />
              <Button
                className="sm:h-20 sm:w-24"
                type="submit"
                disabled={!capture.trim() || createResearch.isPending}
              >
                {createResearch.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Save
              </Button>
            </div>
            {notice ? (
              <p className="mt-2 px-1 text-xs text-muted-foreground" role="status">
                {notice}
              </p>
            ) : null}
          </form>
        ) : (
          <div className="mt-5 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
            You can read this trip’s Research. A planner can add, organize, or schedule items.
          </div>
        )}

        <div className="mt-5 grid gap-2">
          {research.isPending ? <ResearchSkeleton /> : null}
          {research.isError ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="flex items-center justify-between gap-4 py-6">
                <p className="text-sm text-muted-foreground">We couldn’t load Research.</p>
                <Button variant="outline" onClick={() => void research.refetch()}>
                  Try again
                </Button>
              </CardContent>
            </Card>
          ) : null}
          {!research.isPending && !research.isError && visibleItems.length === 0 ? (
            <Card className="border-dashed shadow-none">
              <CardContent className="grid min-h-44 place-items-center py-8 text-center">
                <div>
                  <Lightbulb className="mx-auto size-5 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">Nothing to sort yet</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A rough note or a pasted link is enough.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {visibleItems.map((item) => {
            const source = item.sources[0];
            return (
              <button
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border bg-background px-4 py-3 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/35",
                  selectedId === item.id && "border-blue-400 bg-blue-50/50",
                )}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                  {source?.originalUrl ? (
                    <ExternalLink className="size-4" />
                  ) : (
                    <FileText className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {item.body ?? source?.originalUrl ?? "Saved source"}
                  </span>
                </span>
                <span className="rounded-full bg-muted px-2 py-1 text-[0.68rem] font-medium text-muted-foreground">
                  {stateLabels[item.state]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <ResearchInspector
          key={`${selected.id}:${selected.revision}`}
          canEdit={canEdit}
          item={selected}
          trip={trip}
          onClose={() => setSelectedId(undefined)}
        />
      ) : null}
    </section>
  );
}

function ResearchInspector({
  canEdit,
  item,
  onClose,
  trip,
}: {
  canEdit: boolean;
  item: ResearchItem;
  onClose: () => void;
  trip: Trip;
}) {
  const updateResearch = useUpdateResearch(trip.id);
  const deleteResearch = useDeleteResearch(trip.id);
  const promote = usePromoteResearchToPlan(trip.id);
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body ?? "");
  const [category, setCategory] = useState<ResearchCategory | "none">(item.category ?? "none");
  const [tripStopId, setTripStopId] = useState(item.tripStopId ?? "none");
  const [mode, setMode] = useState<"details" | "schedule">("details");
  const [message, setMessage] = useState<string>();
  const source = item.sources[0];
  const planPromotion = item.promotions.find((link) => link.targetKind === "plan");

  async function save(input: UpdateResearchItemInput) {
    try {
      await updateResearch.mutateAsync({ item, input });
      setMessage("Saved.");
    } catch (error) {
      setMessage(
        error instanceof ApiRequestError ? error.message : "We couldn’t save those changes.",
      );
    }
  }

  async function handleDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save({
      title,
      body: body.trim() || null,
      category: category === "none" ? null : category,
      tripStopId: tripStopId === "none" ? null : tripStopId,
    });
  }

  async function handlePromotion(input: CreatePlanInput) {
    await promote.mutateAsync({ item, input });
    setMode("details");
    setMessage("Added to the itinerary. The Research item is still here as the source.");
  }

  return (
    <WorkspaceInspector
      eyebrow={mode === "schedule" ? "Schedule" : stateLabels[item.state]}
      title={item.title}
      description={
        mode === "schedule"
          ? "Review the details and choose a date before creating the plan."
          : "Source material stays separate from the itinerary until you schedule it."
      }
      onClose={onClose}
    >
      {mode === "schedule" ? (
        <PlanForm
          initialDraft={planDraft(item, trip)}
          onCancel={() => setMode("details")}
          onSubmit={handlePromotion}
          presentation="inspector"
          requireScheduledDate
          stops={trip.stops}
          submitLabel="Add to itinerary"
        />
      ) : (
        <div className="grid gap-5">
          {source?.originalUrl ? (
            <a
              className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
              href={source.originalUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{source.originalUrl}</span>
              <ArrowUpRight className="size-3.5 shrink-0" />
            </a>
          ) : null}

          {canEdit ? (
            <form className="grid gap-4" onSubmit={handleDetailsSubmit}>
              <FormField id="research-title" label="Title">
                <Input
                  id="research-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </FormField>
              <FormField id="research-note" label="Note">
                <Textarea
                  id="research-note"
                  className="min-h-28"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="research-category" label="Category">
                  <Select
                    value={category}
                    onValueChange={(value) => setCategory(value as ResearchCategory | "none")}
                  >
                    <SelectTrigger id="research-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {Object.entries(categoryLabels).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField id="research-destination" label="Destination">
                  <Select value={tripStopId} onValueChange={setTripStopId}>
                    <SelectTrigger id="research-destination">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Any destination</SelectItem>
                      {trip.stops.map((stop) => (
                        <SelectItem key={stop.id} value={stop.id}>
                          {stop.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!title.trim() || updateResearch.isPending}>
                  Save details
                </Button>
              </div>
            </form>
          ) : (
            <div className="grid gap-3 text-sm">
              {item.body ? <p className="whitespace-pre-wrap leading-6">{item.body}</p> : null}
              <p className="text-muted-foreground">
                {item.category ? categoryLabels[item.category] : "Uncategorized"}
              </p>
            </div>
          )}

          {canEdit ? (
            <div className="grid gap-3 border-t pt-4">
              <FormField id="research-state" label="Keep this in">
                <Select
                  value={item.state}
                  onValueChange={(value) => void save({ state: value as ResearchState })}
                >
                  <SelectTrigger id="research-state">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(stateLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <Button
                disabled={
                  item.state === "dismissed" ||
                  (planPromotion !== undefined && planPromotion.targetState !== "unscheduled")
                }
                onClick={() => setMode("schedule")}
              >
                Add to itinerary
              </Button>
              {planPromotion?.targetState === "scheduled" ? (
                <p className="text-xs text-muted-foreground">Already linked to a scheduled plan.</p>
              ) : null}
              {planPromotion?.targetState === "missing" ? (
                <p className="text-xs text-muted-foreground">Its linked plan was removed.</p>
              ) : null}
              <Button
                className="text-red-700 hover:text-red-800"
                variant="ghost"
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Delete this Research item? Any promoted plan will stay in the itinerary.",
                    )
                  )
                    return;
                  await deleteResearch.mutateAsync(item);
                  onClose();
                }}
              >
                <Trash2 className="size-4" /> Delete Research item
              </Button>
            </div>
          ) : null}
          {message ? (
            <p className="text-xs text-muted-foreground" role="status">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </WorkspaceInspector>
  );
}

function ResearchSkeleton() {
  return (
    <div className="grid gap-2" aria-label="Loading Research" role="status">
      {[0, 1, 2].map((item) => (
        <div className="h-20 animate-pulse rounded-lg border bg-muted/45" key={item} />
      ))}
    </div>
  );
}

export { TripResearchSection };
