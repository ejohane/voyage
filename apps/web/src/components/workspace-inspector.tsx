import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function WorkspaceInspector({
  children,
  className,
  description,
  eyebrow,
  onClose,
  title,
}: {
  children: ReactNode;
  className?: string;
  description?: string;
  eyebrow?: string;
  onClose: () => void;
  title: string;
}) {
  return (
    <aside
      aria-label={`${title} details`}
      className={cn(
        "fixed bottom-0 right-0 top-[6.5rem] z-40 w-full max-w-[28rem] overflow-hidden border-l bg-background",
        className,
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex shrink-0 items-start gap-3 bg-background px-5 pb-3 pt-5">
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-blue-700">
                {eyebrow}
              </p>
            ) : null}
            <h3 className="mt-0.5 truncate font-semibold tracking-tight">{title}</h3>
            {description ? (
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <Button
            size="icon"
            variant="outline"
            className="-mr-1 -mt-1 size-10 bg-background shadow-sm"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
            <span className="sr-only">Close details</span>
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5 pt-3">{children}</div>
      </div>
    </aside>
  );
}

export { WorkspaceInspector };
