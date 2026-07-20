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
  BedDouble,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleCheck,
  ExternalLink,
  History,
  LoaderCircle,
  Mail,
  MapPin,
  Pencil,
  Plane,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { StayForm } from "@/components/stay-form";
import { TravelForm } from "@/components/travel-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ApiRequestError } from "@/lib/api";
import {
  useConnectGmail,
  useDisconnectGmail,
  useGmailConnection,
  useImportGmail,
  useScanGmail,
} from "@/lib/gmail";

function errorMessage(error: unknown) {
  return error instanceof ApiRequestError
    ? error.message
    : "Something went wrong. Please try again.";
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

type CandidateGroup = {
  key: string;
  candidates: GmailImportCandidate[];
  representative: GmailImportCandidate;
};

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

function CandidateSources({ candidates }: { candidates: GmailImportCandidate[] }) {
  const sources = [
    ...new Map(
      candidates
        .flatMap((candidate) => candidate.sources ?? [candidate.source])
        .map((source) => [source.messageId, source]),
    ).values(),
  ];
  const multiple = sources.length > 1;

  return (
    <details className="group border-t bg-muted/15 px-4 py-3 sm:px-5">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-sm font-medium marker:content-none">
        <Mail className="size-4 text-muted-foreground" />
        <span className="min-w-0">
          <span>{multiple ? `${sources.length} matching emails` : "Source email"}</span>
          <span className="block text-xs font-normal text-muted-foreground sm:ml-2 sm:inline">
            {multiple ? "Grouped as one booking" : "Used to find this booking"}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 grid gap-2">
        {sources.map((source) => (
          <div
            className="grid min-w-0 gap-2 rounded-md border bg-background p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
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
              <ExternalLink className="size-3.5" /> Open email
            </a>
          </div>
        ))}
      </div>
    </details>
  );
}

function GmailImportDialog({ trip }: { trip: Trip }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const callbackResult = searchParams.get("gmail");
  const [open, setOpen] = useState(Boolean(callbackResult));
  const [candidates, setCandidates] = useState<GmailImportCandidate[]>();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string>();
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
  const editingCandidate = candidates?.find((candidate) => candidate.source.key === editing);

  useEffect(() => {
    if (callbackResult) setOpen(true);
  }, [callbackResult]);

  const candidateGroups = useMemo(() => groupCandidates(candidates ?? []), [candidates]);
  const selectedCandidates = useMemo(
    () =>
      candidateGroups.flatMap((group) => {
        const matches = group.candidates.filter((candidate) => selected.has(candidate.source.key));
        if (!matches.length) return [];
        return [
          group.representative,
          ...matches.filter(
            (candidate) => candidate.source.key !== group.representative.source.key,
          ),
        ];
      }),
    [candidateGroups, selected],
  );
  const selectedGroupCount = useMemo(
    () =>
      candidateGroups.filter((group) =>
        group.candidates.some((candidate) => selected.has(candidate.source.key)),
      ).length,
    [candidateGroups, selected],
  );

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setCandidates(undefined);
      setSelected(new Set());
      setEditing(undefined);
      setScanSummary(undefined);
      setImportResult(undefined);
      if (callbackResult) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("gmail");
        setSearchParams(nextParams, { replace: true });
      }
    }
  }

  async function handleConnect() {
    const response = await connect.mutateAsync({ returnTo: location.pathname });
    window.location.assign(response.authorizationUrl);
  }

  async function handleScan(mode: "standard" | "deep" = "standard") {
    const result = await scan.mutateAsync(mode);
    setCandidates(result.candidates);
    setSelected(new Set(result.candidates.map((candidate) => candidate.source.key)));
    setScanSummary({
      messages: result.messagesScanned,
      imported: result.alreadyImported,
      search: result.search,
    });
    setImportResult(undefined);
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
    setCandidates([]);
    setSelected(new Set());
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Mail className="size-4" />
          Import from Gmail
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[calc(100svh-1rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[calc(100svh-2rem)]">
        <DialogHeader className="shrink-0 border-b px-5 py-5 pr-12 sm:px-6">
          <DialogTitle>Import bookings from Gmail</DialogTitle>
          <DialogDescription>
            Review what Voyage found. Nothing is added to {trip.name} until you choose Import.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
          {editingCandidate?.kind === "travel" ? (
            <TravelForm
              initialTravel={fakeTravel(trip.id, editingCandidate)}
              stops={trip.stops}
              submitLabel="Save review"
              onCancel={() => setEditing(undefined)}
              onSubmit={replaceCandidate}
            />
          ) : editingCandidate?.kind === "stay" ? (
            <StayForm
              initialStay={fakeStay(trip.id, editingCandidate)}
              stops={trip.stops}
              submitLabel="Save review"
              onCancel={() => setEditing(undefined)}
              onSubmit={replaceCandidate}
            />
          ) : connection.isPending ? (
            <div className="grid min-h-48 place-items-center">
              <LoaderCircle
                className="size-5 animate-spin text-muted-foreground"
                aria-label="Loading Gmail connection"
              />
            </div>
          ) : connection.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage(connection.error)}
            </div>
          ) : !connection.data.connected ? (
            <div className="grid gap-5">
              {callbackResult === "error" ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  Gmail could not be connected. Please try the consent flow again.
                </p>
              ) : null}
              <Card className="border-dashed shadow-none">
                <CardContent className="grid gap-4 text-sm leading-6 text-muted-foreground">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
                      <Mail className="size-4" />
                    </span>
                    <div>
                      <p className="font-medium text-foreground">Connect your personal Gmail</p>
                      <p className="mt-1">
                        Voyage requests read-only access. It cannot send, change, or delete email.
                        Complete email bodies are not stored.
                      </p>
                    </div>
                  </div>
                  <p>
                    Only booking details you approve will become visible to members of {trip.name}.
                  </p>
                </CardContent>
              </Card>
              {connect.isError ? (
                <p className="text-sm text-red-600">{errorMessage(connect.error)}</p>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => void handleConnect()} disabled={connect.isPending}>
                  {connect.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Mail className="size-4" />
                  )}
                  Connect Gmail
                </Button>
              </DialogFooter>
            </div>
          ) : importResult ? (
            <div className="grid gap-5 py-4 text-center">
              <CheckCircle2 className="mx-auto size-10 text-emerald-600" />
              <div>
                <p className="font-medium">
                  Imported {importResult.imported.length}{" "}
                  {importResult.imported.length === 1 ? "booking" : "bookings"}
                </p>
                {importResult.skipped.length ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {importResult.skipped.length} duplicate or previously imported item was skipped.
                  </p>
                ) : null}
              </div>
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Done</Button>
              </DialogFooter>
            </div>
          ) : candidates ? (
            <div className="grid gap-4">
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {candidateGroups.length === 0
                      ? "Scan complete"
                      : `${candidateGroups.length} ${candidateGroups.length === 1 ? "booking" : "bookings"} found`}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">
                    Each card is a booking. Related emails are grouped underneath it so you can
                    inspect the source without reviewing duplicates.
                  </p>
                </div>
                <div className="grid gap-1 text-left text-xs text-muted-foreground sm:text-right">
                  <span className="break-words [overflow-wrap:anywhere]">
                    Connected as{" "}
                    <strong className="font-medium text-foreground">{connection.data.email}</strong>
                  </span>
                  <span>
                    {scanSummary?.search.messagesFetched ?? 0} likely emails read
                    {scanSummary?.search.messagesReused
                      ? ` · ${scanSummary.search.messagesReused} reused from an earlier scan`
                      : ""}
                    {scanSummary?.imported ? ` · ${scanSummary.imported} previously imported` : ""}
                  </span>
                  {scanSummary ? (
                    <span>
                      {scanSummary.search.messagesDiscovered} possible emails ranked ·{" "}
                      {scanSummary.search.gapsSearched
                        ? `${scanSummary.search.gapsSearched} itinerary gap ${scanSummary.search.gapsSearched === 1 ? "searched" : "searches"} · `
                        : ""}
                      {formatDateOnly(scanSummary.search.rangeStart)} –{" "}
                      {formatDateOnly(scanSummary.search.rangeEnd)}
                    </span>
                  ) : null}
                </div>
              </div>
              {scanSummary?.search.limitReached ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Voyage prioritized the strongest confirmation and itinerary matches instead of
                  opening every possible email. Search deeper if something is still missing.
                </p>
              ) : null}
              {candidates.length === 0 ? (
                <Card className="border-dashed shadow-none">
                  <CardContent className="py-10 text-center">
                    <p className="font-medium">No new supported bookings found</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Voyage currently recognizes flights, rental cars, and lodging that match this
                      trip.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                candidateGroups.map((group) => {
                  const candidate = group.representative;
                  const included = group.candidates.some((match) => selected.has(match.source.key));
                  const rental = candidate.kind === "travel" && candidate.input.kind === "rental";
                  const Icon = rental ? CarFront : candidate.kind === "travel" ? Plane : BedDouble;
                  const KindIcon = rental ? CarFront : candidate.kind === "travel" ? Plane : MapPin;
                  return (
                    <Card
                      key={group.key}
                      className={
                        included
                          ? "gap-0 overflow-hidden border-foreground/30 py-0"
                          : "gap-0 overflow-hidden py-0 opacity-60"
                      }
                    >
                      <CardContent className="p-4 sm:p-5">
                        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                          <button
                            type="button"
                            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border bg-background shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={included ? "Exclude booking" : "Include booking"}
                            aria-pressed={included}
                            onClick={() =>
                              setSelected((current) => {
                                const next = new Set(current);
                                for (const match of group.candidates) {
                                  if (included) next.delete(match.source.key);
                                  else next.add(match.source.key);
                                }
                                return next;
                              })
                            }
                          >
                            {included ? <Check className="size-4" /> : null}
                          </button>
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/30">
                            <Icon className="size-4 text-muted-foreground" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                                <KindIcon className="size-3" />
                                {rental
                                  ? "Rental car"
                                  : candidate.kind === "travel"
                                    ? "Flight"
                                    : "Stay"}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                <CircleCheck className="size-3.5" />
                                {candidate.confidence === "high"
                                  ? "High confidence"
                                  : "Review suggested"}
                              </span>
                              {candidate.eventType === "schedule_change" ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  <History className="size-3" /> Schedule updated{" "}
                                  {formatDateOnly(candidate.source.receivedAt.slice(0, 10))}
                                </span>
                              ) : null}
                              {candidate.eventType === "modification" ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                                  <History className="size-3" /> Reservation updated{" "}
                                  {formatDateOnly(candidate.source.receivedAt.slice(0, 10))}
                                </span>
                              ) : null}
                            </div>
                            <CandidateSummary candidate={candidate} />
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(candidate.source.key)}
                              >
                                <Pencil className="size-3.5" /> Review details
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                      <CandidateSources candidates={group.candidates} />
                    </Card>
                  );
                })
              )}
              {scan.isError ? (
                <p className="text-sm text-red-600">{errorMessage(scan.error)}</p>
              ) : null}
              {importCandidates.isError ? (
                <p className="text-sm text-red-600">{errorMessage(importCandidates.error)}</p>
              ) : null}
              <div className="sticky -bottom-5 z-10 -mx-5 flex flex-col-reverse justify-between gap-3 border-t bg-background/95 px-5 pb-1 pt-4 backdrop-blur sm:-bottom-6 sm:-mx-6 sm:flex-row sm:px-6 sm:pb-0">
                <Button
                  variant="ghost"
                  className="justify-center sm:justify-start"
                  onClick={() => void disconnect.mutateAsync()}
                  disabled={disconnect.isPending}
                >
                  <Unplug className="size-4" /> Disconnect Gmail
                </Button>
                <div className="grid gap-2 sm:flex sm:justify-end">
                  <Button
                    variant="outline"
                    onClick={() => void handleScan("standard")}
                    disabled={scan.isPending}
                  >
                    <RefreshCw className={scan.isPending ? "size-4 animate-spin" : "size-4"} />{" "}
                    Rescan
                  </Button>
                  {scanSummary?.search.stoppedReason === "ranked_limit" ? (
                    <Button
                      variant="outline"
                      onClick={() => void handleScan("deep")}
                      disabled={scan.isPending}
                    >
                      <RefreshCw className={scan.isPending ? "size-4 animate-spin" : "size-4"} />
                      Search deeper
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => void handleImport()}
                    disabled={!selectedCandidates.length || importCandidates.isPending}
                  >
                    {importCandidates.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {selectedGroupCount
                      ? `Import ${selectedGroupCount} ${selectedGroupCount === 1 ? "booking" : "bookings"}`
                      : "Select a booking"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              {callbackResult === "connected" ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Gmail connected successfully as {connection.data.email}.
                </p>
              ) : null}
              <Card className="border-dashed shadow-none">
                <CardContent className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-medium">Ready to find bookings</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      Voyage ranks likely flight, rental car, and lodging confirmations, then
                      searches for updates and missing connections without opening every matching
                      email.
                    </p>
                    {scan.isPending ? (
                      <p className="mt-3 text-sm font-medium text-foreground">
                        Ranking likely confirmations and checking itinerary gaps…
                      </p>
                    ) : null}
                    <p className="mt-3 text-xs text-muted-foreground">
                      Connected as {connection.data.email}
                    </p>
                  </div>
                  <Mail className="size-5 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
              {scan.isError ? (
                <p className="text-sm text-red-600">{errorMessage(scan.error)}</p>
              ) : null}
              <DialogFooter className="sm:justify-between">
                <Button
                  variant="ghost"
                  onClick={() => void disconnect.mutateAsync()}
                  disabled={disconnect.isPending}
                >
                  <Unplug className="size-4" /> Disconnect Gmail
                </Button>
                <Button onClick={() => void handleScan("standard")} disabled={scan.isPending}>
                  {scan.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="size-4" />
                  )}
                  {scan.isPending ? "Scanning…" : "Find booking emails"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { GmailImportDialog };
