import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateRangePickerProps = {
  endDate: string;
  id: string;
  invalid?: boolean;
  onChange: (startDate: string, endDate: string) => void;
  startDate: string;
};

function parseDateOnly(value: string) {
  if (!value) return undefined;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatDateOnly(date?: Date) {
  if (!date) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rangeLabel(range: DateRange | undefined) {
  if (!range?.from) return "Choose travel dates";
  if (!range.to) return `${format(range.from, "MMM d, yyyy")} – Select end date`;
  return `${format(range.from, "MMM d, yyyy")} – ${format(range.to, "MMM d, yyyy")}`;
}

function DateRangePicker({
  endDate,
  id,
  invalid = false,
  onChange,
  startDate,
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const range = {
    from: parseDateOnly(startDate),
    to: parseDateOnly(endDate),
  } satisfies DateRange;

  function handleSelect(nextRange: DateRange | undefined) {
    onChange(formatDateOnly(nextRange?.from), formatDateOnly(nextRange?.to));
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className={cn(
            "h-10 w-full justify-start px-3 text-left font-normal",
            !range.from && "text-muted-foreground",
            invalid && "border-red-500 focus-visible:ring-red-500/30",
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{rangeLabel(range)}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={range.from}
          onSelect={handleSelect}
          autoFocus
        />
        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!range.from}
            onClick={() => onChange("", "")}
          >
            Clear
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DateRangePicker };
