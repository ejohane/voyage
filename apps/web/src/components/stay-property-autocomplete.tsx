import {
  type LocationSuggestion,
  type LocationSuggestionsResponse,
  locationSuggestionsEndpoint,
  type ResolvedLocationResponse,
  resolveLocationEndpoint,
  type StayPropertyRef,
} from "@voyage/contracts";
import { Check, ChevronsUpDown, LoaderCircle, MapPin, Unlink } from "lucide-react";
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

function StayPropertyAutocomplete({
  id,
  propertyName,
  propertyRef,
  onChange,
}: {
  id: string;
  propertyName: string;
  propertyRef: StayPropertyRef | null;
  onChange: (propertyName: string, address: string, propertyRef: StayPropertyRef) => void;
}) {
  const request = useApiRequest();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [resolving, setResolving] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    const value = query.trim();
    if (!open || value.length < 2) {
      setSuggestions([]);
      setIsSearching(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setError(undefined);
      try {
        const parameters = new URLSearchParams({ q: value, sessionToken });
        const response = await request<LocationSuggestionsResponse>(
          `${locationSuggestionsEndpoint}?${parameters}`,
          { signal: controller.signal },
        );
        setSuggestions(response.suggestions);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
          setError("Property search is unavailable. You can still enter the stay manually.");
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, request, sessionToken]);

  function handleOpen(next: boolean) {
    setOpen(next);
    if (next) {
      setQuery(propertyName);
      setSessionToken(crypto.randomUUID());
      setError(undefined);
    }
  }

  async function choose(suggestion: LocationSuggestion) {
    setResolving(suggestion.placeId);
    setError(undefined);
    try {
      const response = await request<ResolvedLocationResponse>(resolveLocationEndpoint, {
        method: "POST",
        body: JSON.stringify({ placeId: suggestion.placeId, sessionToken }),
      });
      const address = suggestion.secondaryText || suggestion.label;
      onChange(suggestion.primaryText, address, response.location);
      setOpen(false);
    } catch {
      setError("We couldn’t verify that property. Try again or enter it manually.");
    } finally {
      setResolving(undefined);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" className="w-full justify-between px-3">
          <span className="flex min-w-0 items-center gap-2 truncate font-normal">
            {propertyRef ? (
              <MapPin className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
            ) : null}
            <span className="truncate">
              {propertyRef ? propertyName : "Find and link a property"}
            </span>
          </span>
          {propertyRef ? (
            <Check className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search hotel, rental, or address…"
            autoFocus
          />
          <CommandList>
            {query.trim().length < 2 ? (
              <CommandEmpty>Type at least two characters to search.</CommandEmpty>
            ) : null}
            {isSearching ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> Searching…
              </div>
            ) : null}
            {error ? (
              <p className="px-3 py-3 text-xs leading-5 text-muted-foreground">{error}</p>
            ) : null}
            {!isSearching && !error && query.trim().length >= 2 && suggestions.length === 0 ? (
              <CommandEmpty>No Google Places matches found.</CommandEmpty>
            ) : null}
            {suggestions.length ? (
              <CommandGroup heading="Properties and places">
                {suggestions.map((suggestion) => (
                  <CommandItem
                    key={suggestion.placeId}
                    value={suggestion.placeId}
                    disabled={Boolean(resolving)}
                    onSelect={() => void choose(suggestion)}
                  >
                    <MapPin className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{suggestion.primaryText}</span>
                      {suggestion.secondaryText ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {suggestion.secondaryText}
                        </span>
                      ) : null}
                    </span>
                    {resolving === suggestion.placeId ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              <Unlink className="mr-1 inline size-3" aria-hidden="true" /> Manual entry remains
              available
            </span>
            <span
              className="whitespace-nowrap text-base text-[#5e5e5e]"
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

export { StayPropertyAutocomplete };
