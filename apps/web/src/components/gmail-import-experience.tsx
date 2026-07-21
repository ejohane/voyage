import type {
  CreateStayInput,
  CreateTravelInput,
  GmailImportCandidate,
  GmailImportResponse,
  GmailScanResponse,
  Stay,
  Travel,
  Trip,
} from "@voyage/contracts";
import { format, parse } from "date-fns";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Pencil,
  Plane,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { StayForm } from "@/components/stay-form";
import { TravelForm } from "@/components/travel-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiRequestError } from "@/lib/api";
import { formatTripDates, formatTripDestinations } from "@/lib/format-trip";
import {
  useConnectGmail,
  useDisconnectGmail,
  useGmailConnection,
  useImportGmail,
  useScanGmail,
} from "@/lib/gmail";
import { cn } from "@/lib/utils";

type CandidateGroup = {
  key: string;
  candidates: GmailImportCandidate[];
  representative: GmailImportCandidate;
};

type ImportStep = "connect" | "search" | "review" | "finish";

const importSteps: { label: string; value: ImportStep }[] = [
  { label: "Connect", value: "connect" },
  { label: "Search", value: "search" },
  { label: "Review", value: "review" },
  { label: "Finish", value: "finish" },
];

function errorMessage(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "Something went wrong. Please try again.";
}

function formatLocalDateTime(value: string) {
  return format(parse(value, "yyyy-MM-dd'T'HH:mm", new Date()), "MMM d, yyyy · h:mm a");
}

function formatDateOnly(value: string) {
  return format(parse(value, "yyyy-MM-dd", new Date()), "MMM d, yyyy");
}

function normalizeGroupValue(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function normalizeRouteLocation(value: string) {
  return normalizeGroupValue(value.split("·").at(-1));
}

function candidateGroupKey(candidate: GmailImportCandidate) {
  const confirmationNumber = normalizeGroupValue(candidate.input.confirmationNumber);
  if (candidate.kind === "travel") {
    if (candidate.input.kind === "rental") {
      if (confirmationNumber) return `travel:rental:confirmation:${confirmationNumber}`;
      return [
        candidate.kind,
        "rental",
        normalizeGroupValue(candidate.input.carrier),
        normalizeRouteLocation(candidate.input.departureLocation),
        candidate.input.departureAt.slice(0, 10),
      ].join(":");
    }
    if (confirmationNumber) {
      return [
        candidate.kind,
        `confirmation:${confirmationNumber}`,
        candidate.input.departureAt.slice(0, 10),
        normalizeRouteLocation(candidate.input.departureLocation),
        normalizeRouteLocation(candidate.input.arrivalLocation),
      ].join(":");
    }
    return [
      candidate.kind,
      normalizeGroupValue(candidate.input.departureLocation),
      normalizeGroupValue(candidate.input.arrivalLocation),
      candidate.input.departureAt.slice(0, 10),
      normalizeGroupValue(candidate.input.referenceNumber),
    ].join(":");
  }

  if (confirmationNumber) return `${candidate.kind}:confirmation:${confirmationNumber}`;

  return [
    candidate.kind,
    normalizeGroupValue(candidate.input.propertyName),
    candidate.input.checkInDate,
    candidate.input.checkOutDate,
  ].join(":");
}

function candidateQuality(candidate: GmailImportCandidate) {
  let score = candidate.confidence === "high" ? 4 : 0;
  if (candidate.input.confirmationNumber) score += 2;
  if (candidate.input.bookingUrl) score += 1;
  if (candidate.kind === "stay") {
    if (candidate.input.address) score += 1;
    if (/[@]|no-?reply/i.test(candidate.input.propertyName)) score -= 4;
  } else {
    if (candidate.input.carrier) score += 1;
    if (candidate.input.arrivalAt) score += 1;
  }
  return score;
}

function groupCandidates(candidates: GmailImportCandidate[]): CandidateGroup[] {
  const grouped = new Map<string, GmailImportCandidate[]>();
  for (const candidate of candidates) {
    const key = candidateGroupKey(candidate);
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }

  return [...grouped.entries()].map(([key, matches]) => ({
    key,
    candidates: matches,
    representative: [...matches].sort(
      (left, right) => candidateQuality(right) - candidateQuality(left),
    )[0],
  }));
}

function candidateSources(candidates: GmailImportCandidate[]) {
  return [
    ...new Map(
      candidates
        .flatMap((candidate) => candidate.sources ?? [candidate.source])
        .map((source) => [source.messageId, source]),
    ).values(),
  ];
}

function candidateTitle(candidate: GmailImportCandidate) {
  if (candidate.kind === "stay") return candidate.input.propertyName;
  if (candidate.input.kind === "rental") {
    return [candidate.input.carrier ?? "Rental car", candidate.input.vehicleDescription]
      .filter(Boolean)
      .join(" · ");
  }
  return `${candidate.input.departureLocation} → ${candidate.input.arrivalLocation}`;
}

function candidateSubtitle(candidate: GmailImportCandidate) {
  if (candidate.kind === "stay") return candidate.input.address;
  if (candidate.input.kind === "rental") return candidate.input.departureLocation;
  return [candidate.input.carrier, candidate.input.referenceNumber].filter(Boolean).join(" · ");
}

function candidateDate(candidate: GmailImportCandidate) {
  return candidate.kind === "stay"
    ? formatDateOnly(candidate.input.checkInDate)
    : formatDateOnly(candidate.input.departureAt.slice(0, 10));
}

function groupNeedsAttention(group: CandidateGroup) {
  return (
    candidateSources(group.candidates).length > 1 ||
    group.representative.confidence !== "high" ||
    group.representative.eventType === "schedule_change" ||
    group.representative.eventType === "modification"
  );
}

function fakeTravel(tripId: string, candidate: GmailImportCandidate): Travel | undefined {
  if (candidate.kind !== "travel") return undefined;
  return {
    id: candidate.source.key,
    tripId,
    ...candidate.input,
    createdAt: candidate.source.receivedAt,
    updatedAt: candidate.source.receivedAt,
  };
}

function fakeStay(tripId: string, candidate: GmailImportCandidate): Stay | undefined {
  if (candidate.kind !== "stay") return undefined;
  return {
    id: candidate.source.key,
    tripId,
    ...candidate.input,
    createdAt: candidate.source.receivedAt,
    updatedAt: candidate.source.receivedAt,
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-5 [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function CandidateSummary({ candidate }: { candidate: GmailImportCandidate }) {
  if (candidate.kind === "travel") {
    if (candidate.input.kind === "rental") {
      return (
        <div className="min-w-0">
          <p className="break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
            {[candidate.input.carrier ?? "Rental car", candidate.input.vehicleDescription]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <Fact
              label="Pick up"
              value={`${candidate.input.departureLocation} · ${formatLocalDateTime(candidate.input.departureAt)}`}
            />
            <Fact
              label="Return"
              value={`${candidate.input.arrivalLocation} · ${formatLocalDateTime(candidate.input.arrivalAt ?? candidate.input.departureAt)}`}
            />
            {candidate.input.confirmationNumber ? (
              <Fact label="Confirmation" value={candidate.input.confirmationNumber} />
            ) : null}
          </dl>
        </div>
      );
    }
    return (
      <div className="min-w-0">
        <p className="break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
          {candidate.input.departureLocation} → {candidate.input.arrivalLocation}
        </p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Departs" value={formatLocalDateTime(candidate.input.departureAt)} />
          {candidate.input.arrivalAt ? (
            <Fact label="Arrives" value={formatLocalDateTime(candidate.input.arrivalAt)} />
          ) : null}
          {candidate.input.carrier || candidate.input.referenceNumber ? (
            <Fact
              label="Carrier and route"
              value={[candidate.input.carrier, candidate.input.referenceNumber]
                .filter(Boolean)
                .join(" · ")}
            />
          ) : null}
          {candidate.input.confirmationNumber ? (
            <Fact label="Confirmation" value={candidate.input.confirmationNumber} />
          ) : null}
        </dl>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <p className="break-words text-base font-semibold leading-6 [overflow-wrap:anywhere]">
        {candidate.input.propertyName}
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Fact
          label="Stay"
          value={`${formatDateOnly(candidate.input.checkInDate)} – ${formatDateOnly(candidate.input.checkOutDate)}`}
        />
        <Fact label="Location" value={candidate.input.address} />
        {candidate.input.confirmationNumber ? (
          <Fact label="Confirmation" value={candidate.input.confirmationNumber} />
        ) : null}
      </dl>
    </div>
  );
}

function CandidateSources({
  candidates,
  expanded,
}: {
  candidates: GmailImportCandidate[];
  expanded: boolean;
}) {
  const sources = candidateSources(candidates);

  return (
    <details className="group mt-5 border-t pt-4" open={expanded}>
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm font-medium marker:content-none">
        <Mail className="size-4 text-muted-foreground" aria-hidden="true" />
        <span>
          {sources.length > 1 ? `${sources.length} related source emails` : "Source email"}
        </span>
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-3 divide-y border-y">
        {sources.map((source) => (
          <div
            className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            key={source.key}
          >
            <div className="min-w-0">
              <p className="break-words text-sm font-medium leading-5 [overflow-wrap:anywhere]">
                {source.subject || "Booking email"}
              </p>
              <p className="mt-0.5 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                From {source.sender}
              </p>
            </div>
            <a
              className="inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md px-2 text-xs font-medium hover:bg-muted"
              href={source.messageUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" /> Open email
            </a>
          </div>
        ))}
      </div>
    </details>
  );
}

function GuidedSteps({ currentStep }: { currentStep: ImportStep }) {
  const currentIndex = importSteps.findIndex((step) => step.value === currentStep);

  return (
    <aside className="border-b bg-muted/25 px-4 py-3 md:border-b-0 md:border-r md:px-6 md:py-8">
      <p className="mb-5 hidden text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground md:block">
        Your progress
      </p>
      <ol className="grid grid-cols-4 gap-2 md:grid-cols-1 md:gap-5">
        {importSteps.map((step, index) => {
          const current = index === currentIndex;
          const complete = index < currentIndex;
          return (
            <li
              className={cn(
                "grid justify-items-center gap-1.5 text-center text-xs text-muted-foreground md:grid-cols-[2rem_1fr] md:items-center md:justify-items-start md:text-left md:text-sm",
                current && "font-medium text-foreground",
              )}
              key={step.value}
            >
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-full border bg-background",
                  (current || complete) && "border-foreground bg-foreground text-background",
                )}
              >
                {complete ? <Check className="size-4" aria-hidden="true" /> : index + 1}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function GmailImportExperience({ trip }: { trip: Trip }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const callbackResult = searchParams.get("gmail");
  const [open, setOpen] = useState(Boolean(callbackResult));
  const [step, setStep] = useState<ImportStep>("connect");
  const [candidates, setCandidates] = useState<GmailImportCandidate[]>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string>();
  const [expandedGroup, setExpandedGroup] = useState<string>();
  const [scanSummary, setScanSummary] = useState<{
    messages: number;
    imported: number;
    search: GmailScanResponse["search"];
  }>();
  const [importResult, setImportResult] = useState<GmailImportResponse>();
  const connection = useGmailConnection();
  const connect = useConnectGmail();
  const disconnect = useDisconnectGmail();
  const scan = useScanGmail(trip.id);
  const importCandidates = useImportGmail(trip.id);
  const connectedAccount = connection.data?.connected ? connection.data : undefined;
  const connected = Boolean(connectedAccount);
  const editingCandidate = candidates?.find((candidate) => candidate.source.key === editing);

  useEffect(() => {
    if (callbackResult) setOpen(true);
  }, [callbackResult]);

  useEffect(() => {
    if (!connection.data) return;
    if (!connection.data.connected) setStep("connect");
  }, [connection.data]);

  const candidateGroups = useMemo(() => groupCandidates(candidates ?? []), [candidates]);
  const selectedGroups = useMemo(
    () =>
      candidateGroups.filter((group) =>
        group.candidates.some((candidate) => selected.has(candidate.source.key)),
      ),
    [candidateGroups, selected],
  );
  const selectedCandidates = useMemo(
    () =>
      selectedGroups.flatMap((group) => {
        const matches = group.candidates.filter((candidate) => selected.has(candidate.source.key));
        return [
          group.representative,
          ...matches.filter(
            (candidate) => candidate.source.key !== group.representative.source.key,
          ),
        ];
      }),
    [selectedGroups, selected],
  );
  const attentionCount = candidateGroups.filter(groupNeedsAttention).length;

  function resetFlow() {
    setCandidates(undefined);
    setSelected(new Set());
    setEditing(undefined);
    setExpandedGroup(undefined);
    setScanSummary(undefined);
    setImportResult(undefined);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setStep("connect");
      return;
    }

    resetFlow();
    setStep("connect");
    if (callbackResult) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("gmail");
      setSearchParams(nextParams, { replace: true });
    }
  }

  async function handleConnect() {
    const response = await connect.mutateAsync({ returnTo: location.pathname });
    window.location.assign(response.authorizationUrl);
  }

  async function handleDisconnect() {
    await disconnect.mutateAsync();
    resetFlow();
    setStep("connect");
  }

  async function handleScan(mode: "standard" | "deep" = "standard") {
    const result = await scan.mutateAsync(mode);
    const groups = groupCandidates(result.candidates);
    setCandidates(result.candidates);
    setSelected(new Set(result.candidates.map((candidate) => candidate.source.key)));
    setExpandedGroup(groups.find(groupNeedsAttention)?.key);
    setScanSummary({
      messages: result.messagesScanned,
      imported: result.alreadyImported,
      search: result.search,
    });
    setImportResult(undefined);
    setStep("review");
  }

  function replaceCandidate(input: CreateTravelInput | CreateStayInput) {
    setCandidates((current) =>
      current?.map((candidate) =>
        candidate.source.key === editing
          ? ({ ...candidate, input } as GmailImportCandidate)
          : candidate,
      ),
    );
    setEditing(undefined);
    return Promise.resolve();
  }

  async function handleImport() {
    const result = await importCandidates.mutateAsync(selectedCandidates);
    setImportResult(result);
  }

  function toggleGroup(group: CandidateGroup, included: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const candidate of group.candidates) {
        if (included) next.delete(candidate.source.key);
        else next.add(candidate.source.key);
      }
      return next;
    });
  }

  const trigger = connected ? (
    <button
      className="group flex w-full items-center justify-between gap-4 rounded-xl border bg-background px-4 py-3 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:ring-2 focus-visible:ring-ring sm:px-5"
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background">
          <RefreshCw className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold">Import updates from Gmail</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            Connected as {connectedAccount?.email}
          </span>
        </span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </button>
  ) : (
    <button
      className="group grid w-full gap-5 rounded-2xl border border-slate-900 bg-[#071a2c] px-5 py-6 text-left text-white shadow-md shadow-slate-950/15 outline-none transition-[background-color,box-shadow,transform] hover:-translate-y-0.5 hover:bg-[#0a2238] hover:shadow-lg hover:shadow-slate-950/20 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7 sm:py-7"
      type="button"
    >
      <span className="min-w-0">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-200/65">
          Recommended next step
        </span>
        <span className="mt-2 block text-xl font-semibold tracking-tight sm:text-2xl">
          Build this trip from your inbox
        </span>
        <span className="mt-2 block max-w-2xl text-sm leading-6 text-slate-300">
          Voyage can find flights, stays, and rental cars already in Gmail, then guide you through
          every booking before anything is added.
        </span>
      </span>
      <span className="grid gap-2 sm:justify-items-end">
        <span className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-slate-950 shadow-sm transition-colors group-hover:bg-sky-50">
          <Sparkles className="size-4" aria-hidden="true" /> Start guided import
        </span>
        <span className="text-xs text-slate-300">About 2 minutes · You stay in control</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="left-0 top-0 grid h-svh w-screen max-w-none translate-x-0 translate-y-0 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none">
        <header className="flex min-h-16 items-center justify-between gap-4 border-b px-4 pr-14 sm:px-6 sm:pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-foreground text-background">
              <Plane className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base">Guided import</DialogTitle>
              <DialogDescription className="sr-only">
                Connect Gmail, search for bookings, review the results, and add approved items to{" "}
                {trip.name}.
              </DialogDescription>
            </div>
          </div>
          <div className="mr-1 flex min-w-0 items-center gap-2">
            <span className="hidden max-w-64 truncate text-sm text-muted-foreground sm:block">
              {trip.name}
            </span>
            <Button variant="ghost" onClick={() => handleOpenChange(false)}>
              Save &amp; exit
            </Button>
          </div>
        </header>

        <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[14rem_minmax(0,1fr)] md:grid-rows-1">
          <GuidedSteps currentStep={step} />
          <main className="min-h-0 overflow-y-auto">
            {connection.isPending ? (
              <div className="grid min-h-full place-items-center p-8">
                <LoaderCircle
                  className="size-6 animate-spin text-muted-foreground"
                  aria-label="Loading Gmail connection"
                />
              </div>
            ) : connection.isError ? (
              <div className="mx-auto grid min-h-full max-w-xl place-content-center p-6 text-center">
                <p className="text-lg font-semibold">We couldn’t load your Gmail connection</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {errorMessage(connection.error)}
                </p>
                <Button
                  className="mt-5"
                  variant="outline"
                  onClick={() => void connection.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : step === "connect" ? (
              <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-12">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Step 1 of 4
                  </p>
                  <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                    Let’s bring your travel plans together
                  </h1>
                  <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
                    Connect the Gmail account where your confirmations arrive. Voyage will only look
                    for travel related to this trip.
                  </p>
                </div>

                {callbackResult === "error" ? (
                  <p className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Gmail could not be connected. Please try the consent flow again.
                  </p>
                ) : null}

                <div
                  className={cn(
                    "mt-8 rounded-xl border bg-background p-4 transition-colors sm:p-5",
                    connected && "border-emerald-200 bg-emerald-50/50",
                  )}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <span
                        className={cn(
                          "grid size-11 shrink-0 place-items-center rounded-xl border bg-background",
                          connected && "border-emerald-200 text-emerald-700",
                        )}
                      >
                        {connected ? (
                          <Check className="size-5" aria-hidden="true" />
                        ) : (
                          <Mail className="size-5" aria-hidden="true" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Gmail</p>
                        <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">
                          {connectedAccount
                            ? `Connected as ${connectedAccount.email}`
                            : "Flights, hotels, vacation rentals, and rental cars"}
                        </p>
                      </div>
                    </div>
                    {connected ? (
                      <span className="inline-flex items-center gap-2 self-start text-sm font-medium text-emerald-700 sm:self-auto">
                        <CheckCircle2 className="size-4" aria-hidden="true" /> Connected
                      </span>
                    ) : (
                      <Button
                        className="w-full sm:w-auto"
                        variant="outline"
                        onClick={() => void handleConnect()}
                        disabled={connect.isPending}
                      >
                        {connect.isPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <Mail className="size-4" />
                        )}
                        {connect.isPending ? "Connecting…" : "Connect Gmail"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex items-start gap-3 text-sm leading-6 text-muted-foreground">
                  <LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    Read-only access. Voyage cannot send, change, or delete email, and complete
                    email bodies are not stored.
                  </p>
                </div>

                {connect.isError ? (
                  <p className="mt-5 text-sm text-red-600">{errorMessage(connect.error)}</p>
                ) : null}

                <div className="mt-auto flex flex-col-reverse gap-3 pt-10 sm:flex-row sm:items-center sm:justify-between">
                  <Button variant="ghost" onClick={() => handleOpenChange(false)}>
                    Maybe later
                  </Button>
                  <Button size="lg" onClick={() => setStep("search")} disabled={!connected}>
                    Next <ArrowRight className="size-4" />
                  </Button>
                </div>
              </section>
            ) : step === "search" ? (
              <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-12">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Step 2 of 4
                  </p>
                  <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                    Here’s what Voyage will look for
                  </h1>
                  <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
                    Confirm the scope before Voyage opens any matching email.
                  </p>
                </div>

                <dl className="mt-8 divide-y border-y">
                  <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-5">
                    <dt className="text-sm text-muted-foreground">Gmail account</dt>
                    <dd className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                      {connectedAccount?.email}
                    </dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-5">
                    <dt className="text-sm text-muted-foreground">Destinations</dt>
                    <dd className="text-sm font-medium">{formatTripDestinations(trip)}</dd>
                  </div>
                  <div className="grid gap-1 py-4 sm:grid-cols-[10rem_1fr] sm:gap-5">
                    <dt className="text-sm text-muted-foreground">Trip dates</dt>
                    <dd className="text-sm font-medium">{formatTripDates(trip)}</dd>
                  </div>
                </dl>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    { icon: Plane, label: "Flights", detail: "Confirmations and changes" },
                    { icon: BedDouble, label: "Stays", detail: "Hotels and rentals" },
                    { icon: CarFront, label: "Rental cars", detail: "Pickups and returns" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div className="border-t-2 pt-3" key={item.label}>
                        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                        <p className="mt-3 text-sm font-semibold">{item.label}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    );
                  })}
                </div>

                {scan.isError ? (
                  <p className="mt-5 text-sm text-red-600">{errorMessage(scan.error)}</p>
                ) : null}

                <div className="mt-auto flex flex-col-reverse gap-3 pt-10 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    variant="ghost"
                    onClick={() => void handleDisconnect()}
                    disabled={disconnect.isPending}
                  >
                    <Unplug className="size-4" /> Disconnect Gmail
                  </Button>
                  <Button
                    size="lg"
                    onClick={() => void handleScan("standard")}
                    disabled={scan.isPending}
                  >
                    {scan.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    {scan.isPending ? "Searching Gmail…" : "Search Gmail"}
                  </Button>
                </div>
              </section>
            ) : step === "review" ? (
              <section className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 py-7 sm:px-8 sm:py-10">
                {editingCandidate ? (
                  <div className="mx-auto w-full max-w-3xl">
                    <Button
                      variant="ghost"
                      className="mb-5 -ml-3"
                      onClick={() => setEditing(undefined)}
                    >
                      <ArrowLeft className="size-4" /> Back to all bookings
                    </Button>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Focused review
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                      Review booking details
                    </h1>
                    <div className="mt-7 border-t pt-7">
                      {editingCandidate.kind === "travel" ? (
                        <TravelForm
                          initialTravel={fakeTravel(trip.id, editingCandidate)}
                          stops={trip.stops}
                          submitLabel="Save review"
                          onCancel={() => setEditing(undefined)}
                          onSubmit={replaceCandidate}
                        />
                      ) : (
                        <StayForm
                          initialStay={fakeStay(trip.id, editingCandidate)}
                          stops={trip.stops}
                          submitLabel="Save review"
                          onCancel={() => setEditing(undefined)}
                          onSubmit={replaceCandidate}
                        />
                      )}
                    </div>
                  </div>
                ) : candidateGroups.length === 0 ? (
                  <div className="mx-auto grid min-h-full max-w-xl place-content-center py-12 text-center">
                    <Search className="mx-auto size-9 text-muted-foreground" aria-hidden="true" />
                    <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                      No new supported bookings found
                    </h1>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      Voyage searched {scanSummary?.messages ?? 0} likely emails for flights, stays,
                      and rental cars related to this trip.
                    </p>
                    <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => setStep("search")}>
                        Change search
                      </Button>
                      <Button onClick={() => void handleScan("deep")} disabled={scan.isPending}>
                        <RefreshCw className={scan.isPending ? "size-4 animate-spin" : "size-4"} />
                        Search deeper
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="max-w-3xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Step 3 of 4
                      </p>
                      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
                        Review what Voyage found
                      </h1>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
                        {scanSummary?.search.messagesFetched ?? 0} matching emails became{" "}
                        {candidateGroups.length}{" "}
                        {candidateGroups.length === 1 ? "booking" : "bookings"}. Related
                        confirmations and updates stay grouped so duplicates are visible.
                      </p>
                    </div>

                    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-y py-3 text-sm">
                      <p>
                        <strong>{attentionCount}</strong>{" "}
                        {attentionCount === 1 ? "item needs" : "items need"} a closer look
                      </p>
                      <p className="text-muted-foreground">
                        {selectedGroups.length} of {candidateGroups.length} selected
                      </p>
                    </div>

                    {scanSummary?.search.limitReached ? (
                      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        Voyage prioritized the strongest matches. You can search deeper if something
                        is missing.
                      </p>
                    ) : null}

                    <div className="mt-2 border-t">
                      {candidateGroups.map((group) => {
                        const candidate = group.representative;
                        const sources = candidateSources(group.candidates);
                        const included = group.candidates.some((match) =>
                          selected.has(match.source.key),
                        );
                        const expanded = expandedGroup === group.key;
                        const rental =
                          candidate.kind === "travel" && candidate.input.kind === "rental";
                        const Icon = rental
                          ? CarFront
                          : candidate.kind === "travel"
                            ? Plane
                            : BedDouble;
                        return (
                          <div
                            className={cn(
                              "border-b transition-colors",
                              expanded && "bg-muted/20",
                              !included && "opacity-55",
                            )}
                            key={group.key}
                          >
                            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-stretch">
                              <button
                                type="button"
                                className="my-5 ml-1 grid size-6 place-items-center self-start rounded-md border bg-background shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:ml-3"
                                aria-label={included ? "Exclude booking" : "Include booking"}
                                aria-pressed={included}
                                onClick={() => toggleGroup(group, included)}
                              >
                                {included ? <Check className="size-4" aria-hidden="true" /> : null}
                              </button>
                              <button
                                type="button"
                                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_8rem_7rem_auto] sm:gap-4 sm:px-5"
                                aria-expanded={expanded}
                                onClick={() => setExpandedGroup(expanded ? undefined : group.key)}
                              >
                                <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background">
                                  <Icon
                                    className="size-4 text-muted-foreground"
                                    aria-hidden="true"
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block break-words text-sm font-semibold leading-5 [overflow-wrap:anywhere]">
                                    {candidateTitle(candidate)}
                                  </span>
                                  <span className="mt-1 block break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
                                    {candidateSubtitle(candidate) ||
                                      (rental
                                        ? "Rental car"
                                        : candidate.kind === "travel"
                                          ? "Flight"
                                          : "Stay")}
                                    {groupNeedsAttention(group)
                                      ? sources.length > 1
                                        ? ` · ${sources.length} related emails`
                                        : " · Review suggested"
                                      : ""}
                                  </span>
                                </span>
                                <span className="hidden text-sm sm:block">
                                  {candidateDate(candidate)}
                                </span>
                                <span className="hidden text-sm text-muted-foreground sm:block">
                                  {sources.length} {sources.length === 1 ? "email" : "emails"}
                                </span>
                                <ChevronDown
                                  className={cn(
                                    "size-4 text-muted-foreground transition-transform",
                                    expanded && "rotate-180",
                                  )}
                                  aria-hidden="true"
                                />
                              </button>
                            </div>

                            {expanded ? (
                              <div className="border-t px-4 py-5 sm:ml-12 sm:px-6">
                                {sources.length > 1 ? (
                                  <div className="mb-5 flex items-start gap-3 bg-muted/45 p-4 text-sm leading-6">
                                    <ShieldCheck
                                      className="mt-1 size-4 shrink-0 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    <p>
                                      Voyage grouped these {sources.length} emails as one booking.
                                      Updates remain attached as source history instead of becoming
                                      duplicate trip items.
                                    </p>
                                  </div>
                                ) : null}
                                <CandidateSummary candidate={candidate} />
                                <div className="mt-5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setEditing(candidate.source.key)}
                                  >
                                    <Pencil className="size-3.5" /> Review details
                                  </Button>
                                </div>
                                <CandidateSources
                                  candidates={group.candidates}
                                  expanded={sources.length > 1}
                                />
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {scan.isError ? (
                      <p className="mt-5 text-sm text-red-600">{errorMessage(scan.error)}</p>
                    ) : null}

                    <div className="mt-auto flex flex-col-reverse gap-3 pt-8 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="ghost" onClick={() => setStep("search")}>
                        <ArrowLeft className="size-4" /> Back
                      </Button>
                      <div className="grid gap-2 sm:flex">
                        <Button
                          variant="outline"
                          onClick={() => void handleScan("standard")}
                          disabled={scan.isPending}
                        >
                          <RefreshCw
                            className={scan.isPending ? "size-4 animate-spin" : "size-4"}
                          />
                          Rescan
                        </Button>
                        {scanSummary?.search.stoppedReason === "ranked_limit" ? (
                          <Button
                            variant="outline"
                            onClick={() => void handleScan("deep")}
                            disabled={scan.isPending}
                          >
                            Search deeper
                          </Button>
                        ) : null}
                        <Button onClick={() => setStep("finish")} disabled={!selectedGroups.length}>
                          Continue with {selectedGroups.length}{" "}
                          {selectedGroups.length === 1 ? "booking" : "bookings"}
                          <ArrowRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </section>
            ) : (
              <section className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-5 py-8 sm:px-8 sm:py-12">
                {importResult ? (
                  <div className="m-auto max-w-xl text-center">
                    <span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                      <CheckCircle2 className="size-8" aria-hidden="true" />
                    </span>
                    <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Import complete
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                      Your trip just came together
                    </h1>
                    <p className="mt-4 text-base leading-7 text-muted-foreground">
                      Added {importResult.imported.length}{" "}
                      {importResult.imported.length === 1 ? "booking" : "bookings"} to {trip.name}.
                      {importResult.skipped.length
                        ? ` ${importResult.skipped.length} duplicate or previously imported ${importResult.skipped.length === 1 ? "item was" : "items were"} skipped.`
                        : ""}
                    </p>
                    <Button className="mt-7" size="lg" onClick={() => handleOpenChange(false)}>
                      View updated trip
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="max-w-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Step 4 of 4
                      </p>
                      <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
                        Your trip is ready to come together
                      </h1>
                      <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
                        Here’s everything you approved. Nothing has been added yet.
                      </p>
                    </div>

                    <div className="mt-8 flex items-center gap-4 border-y py-5">
                      <span className="grid size-14 shrink-0 place-items-center rounded-full bg-foreground text-xl font-semibold text-background">
                        {selectedGroups.length}
                      </span>
                      <div>
                        <p className="font-semibold">
                          {selectedGroups.length === 1 ? "Booking ready" : "Bookings ready"}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Voyage will add these to {trip.name} after your confirmation.
                        </p>
                      </div>
                    </div>

                    <div className="divide-y border-b">
                      {selectedGroups.map((group) => {
                        const candidate = group.representative;
                        const rental =
                          candidate.kind === "travel" && candidate.input.kind === "rental";
                        const Icon = rental
                          ? CarFront
                          : candidate.kind === "travel"
                            ? Plane
                            : BedDouble;
                        return (
                          <div className="flex items-center gap-3 py-4" key={group.key}>
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg border">
                              <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium [overflow-wrap:anywhere]">
                                {candidateTitle(candidate)}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {candidateDate(candidate)} ·{" "}
                                {candidateSources(group.candidates).length}{" "}
                                {candidateSources(group.candidates).length === 1
                                  ? "source email"
                                  : "source emails"}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {importCandidates.isError ? (
                      <p className="mt-5 text-sm text-red-600">
                        {errorMessage(importCandidates.error)}
                      </p>
                    ) : null}

                    <div className="mt-auto flex flex-col-reverse gap-3 pt-10 sm:flex-row sm:items-center sm:justify-between">
                      <Button variant="ghost" onClick={() => setStep("review")}>
                        <ArrowLeft className="size-4" /> Back to review
                      </Button>
                      <Button
                        size="lg"
                        onClick={() => void handleImport()}
                        disabled={importCandidates.isPending}
                      >
                        {importCandidates.isPending ? (
                          <LoaderCircle className="size-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-4" />
                        )}
                        Add {selectedGroups.length}{" "}
                        {selectedGroups.length === 1 ? "booking" : "bookings"} to trip
                      </Button>
                    </div>
                  </>
                )}
              </section>
            )}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { GmailImportExperience };
