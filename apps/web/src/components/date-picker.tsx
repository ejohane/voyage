import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  id: string;
  invalid?: boolean;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
};

function parseDateOnly(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDateOnly(date?: Date) {
  if (!date) return "";
  return [
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function DatePicker({
  id,
  invalid = false,
  onChange,
  placeholder = "Choose a date",
  value,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const date = parseDateOnly(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className={cn(
            "h-9 w-full justify-start px-3 text-left font-normal",
            !date && "text-muted-foreground",
            invalid && "border-red-500 focus-visible:ring-red-500/30",
          )}
        >
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">{date ? format(date, "MMM d, yyyy") : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={date}
          defaultMonth={date}
          onSelect={(nextDate) => {
            onChange(formatDateOnly(nextDate));
            if (nextDate) setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker };
