import { type Airport, type AirportListResponse, airportsEndpoint } from "@voyage/contracts";
import { Check, ChevronsUpDown, LoaderCircle, Plane, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useApiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

type AirportAutocompleteProps = {
  id: string;
  value: Airport | null;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (airport: Airport) => void;
};

export function airportLocationLabel(airport: Airport) {
  return `${airport.iataCode} · ${airport.municipality || airport.name}`;
}

function airportContext(airport: Airport) {
  return [airport.name, airport.municipality, airport.isoRegion, airport.isoCountry]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
}

export function AirportAutocomplete({
  id,
  value,
  placeholder,
  invalid,
  disabled,
  onChange,
}: AirportAutocompleteProps) {
  const apiRequest = useApiRequest();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [airports, setAirports] = useState<Airport[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();

  useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || normalizedQuery.length < 1) {
      setAirports([]);
      setIsSearching(false);
      setSearchError(undefined);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(undefined);
      try {
        const parameters = new URLSearchParams({ q: normalizedQuery });
        const response = await apiRequest<AirportListResponse>(
          `${airportsEndpoint}?${parameters}`,
          { signal: controller.signal },
        );
        setAirports(response.airports);
      } catch {
        if (controller.signal.aborted) return;
        setAirports([]);
        setSearchError("Airport search is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [apiRequest, open, query]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setSearchError(undefined);
    if (nextOpen) {
      setQuery("");
      setAirports([]);
    }
  }

  function chooseAirport(airport: Airport) {
    onChange(airport);
    setOpen(false);
  }

  const hasQuery = query.trim().length > 0;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "h-auto min-h-9 w-full justify-between px-3 py-2 font-normal",
            !value && "text-muted-foreground",
            invalid && "border-red-500 focus-visible:ring-red-500/20",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            <Plane className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{value ? airportLocationLabel(value) : placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search code, city, or airport…"
            autoFocus
          />
          <CommandList>
            {!hasQuery ? (
              <CommandEmpty>Search by IATA code, city, or airport name.</CommandEmpty>
            ) : null}
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Searching airports…
              </div>
            ) : null}
            {searchError ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">{searchError}</p>
            ) : null}
            {hasQuery && !isSearching && !searchError && airports.length === 0 ? (
              <CommandEmpty>No scheduled-service airports found.</CommandEmpty>
            ) : null}
            {airports.length > 0 ? (
              <CommandGroup heading="Airports">
                {airports.map((airport) => (
                  <CommandItem
                    key={airport.id}
                    value={String(airport.id)}
                    onSelect={() => chooseAirport(airport)}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded border bg-muted/40 text-xs font-semibold">
                      {airport.iataCode}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {airport.municipality || airport.name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {airportContext(airport)}
                      </span>
                    </span>
                    {value?.id === airport.id ? (
                      <Check className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="flex items-center gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
            <Search className="size-3" aria-hidden="true" />
            Scheduled-service airport catalog
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
