import {
  type LocationSuggestion,
  type LocationSuggestionsResponse,
  locationSuggestionsEndpoint,
  type ResolvedLocationResponse,
  resolveLocationEndpoint,
  type TripStopLocation,
} from "@voyage/contracts";
import {
  Building2,
  Check,
  ChevronsUpDown,
  Globe2,
  House,
  LoaderCircle,
  Map as MapIcon,
  MapPin,
} from "lucide-react";
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

type DestinationAutocompleteProps = {
  id: string;
  value: string;
  location: TripStopLocation | null;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  onChange: (name: string, location: TripStopLocation | null) => void;
};

function kindLabel(kind: LocationSuggestion["kind"]) {
  return {
    country: "Country",
    region: "Region",
    city: "City",
    neighborhood: "Neighborhood",
    address: "Address",
    place: "Place",
  }[kind];
}

function KindIcon({ kind }: { kind: LocationSuggestion["kind"] }) {
  const className = "size-4 text-muted-foreground";

  if (kind === "country") return <Globe2 className={className} aria-hidden="true" />;
  if (kind === "region") return <MapIcon className={className} aria-hidden="true" />;
  if (kind === "city") return <Building2 className={className} aria-hidden="true" />;
  if (kind === "address") return <House className={className} aria-hidden="true" />;
  return <MapPin className={className} aria-hidden="true" />;
}

function DestinationAutocomplete({
  id,
  value,
  location,
  placeholder,
  invalid,
  disabled,
  onChange,
}: DestinationAutocompleteProps) {
  const apiRequest = useApiRequest();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resolvingPlaceId, setResolvingPlaceId] = useState<string>();
  const [searchError, setSearchError] = useState<string>();

  useEffect(() => {
    const normalizedQuery = query.trim();

    if (!open || normalizedQuery.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      setSearchError(undefined);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setSearchError(undefined);

      try {
        const parameters = new URLSearchParams({ q: normalizedQuery, sessionToken });
        const response = await apiRequest<LocationSuggestionsResponse>(
          `${locationSuggestionsEndpoint}?${parameters}`,
          { signal: controller.signal },
        );
        setSuggestions(response.suggestions);
      } catch {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setSearchError("Search is unavailable. You can still use a custom destination.");
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [apiRequest, open, query, sessionToken]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    setSearchError(undefined);

    if (nextOpen) {
      setQuery("");
      setSuggestions([]);
      setSessionToken(crypto.randomUUID());
    }
  }

  async function chooseSuggestion(suggestion: LocationSuggestion) {
    setResolvingPlaceId(suggestion.placeId);
    setSearchError(undefined);

    try {
      const response = await apiRequest<ResolvedLocationResponse>(resolveLocationEndpoint, {
        method: "POST",
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      onChange(query.trim(), response.location);
      setOpen(false);
    } catch {
      setSearchError("We couldn’t verify that destination. Try again or use a custom destination.");
    } finally {
      setResolvingPlaceId(undefined);
    }
  }

  function chooseCustomDestination() {
    const customName = query.trim();
    if (!customName) return;
    onChange(customName, null);
    setOpen(false);
  }

  const hasQuery = query.trim().length >= 2;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          disabled={disabled}
          className={cn(
            "w-full justify-between px-3 font-normal",
            !value && "text-muted-foreground",
            invalid && "border-red-500 focus-visible:ring-red-500/20",
          )}
        >
          <span className="flex min-w-0 items-center gap-2 truncate">
            {location ? (
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : null}
            <span className="truncate">{value || placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search a country, city, or address…"
            autoFocus
          />
          <CommandList>
            {!hasQuery ? (
              <CommandEmpty>Type at least two characters to search.</CommandEmpty>
            ) : null}
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Searching destinations…
              </div>
            ) : null}
            {searchError ? (
              <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">{searchError}</p>
            ) : null}
            {hasQuery && !isSearching && !searchError && suggestions.length === 0 ? (
              <CommandEmpty>No Google Places matches found.</CommandEmpty>
            ) : null}
            {suggestions.length > 0 ? (
              <CommandGroup heading="Suggested destinations">
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.placeId}
                    value={suggestion.placeId}
                    disabled={Boolean(resolvingPlaceId)}
                    onSelect={() => void chooseSuggestion(suggestion)}
                  >
                    <KindIcon kind={suggestion.kind} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate">{suggestion.primaryText}</span>
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                          {kindLabel(suggestion.kind)}
                        </span>
                      </span>
                      {suggestion.secondaryText ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {suggestion.secondaryText}
                        </span>
                      ) : null}
                    </span>
                    {resolvingPlaceId === suggestion.placeId ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : location?.placeId === suggestion.placeId ? (
                      <Check className="size-4" aria-hidden="true" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {hasQuery ? (
              <CommandGroup heading="Custom">
                <CommandItem
                  value={`custom-${query}`}
                  disabled={Boolean(resolvingPlaceId)}
                  onSelect={chooseCustomDestination}
                >
                  <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">Use “{query.trim()}”</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="border-t px-3 py-2 text-right">
            <span
              className="whitespace-nowrap text-base font-normal text-[#5e5e5e]"
              style={{ fontFamily: "Roboto, sans-serif" }}
              translate="no"
            >
              Google Maps
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export { DestinationAutocomplete };
