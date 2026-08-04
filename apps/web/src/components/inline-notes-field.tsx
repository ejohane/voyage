import { AlertCircle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved" | "error";

const notesMaximumLength = 2_000;

function InlineNotesField({
  notes,
  onSave,
}: {
  notes: string | null;
  onSave: (notes: string | null) => Promise<void>;
}) {
  const notesId = useId();
  const [draft, setDraft] = useState(notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>();
  const isMounted = useRef(true);
  const saveInFlight = useRef(false);
  const savedValue = useRef(notes ?? "");
  const savedStatusTimeout = useRef<number | undefined>(undefined);
  const hasUnsavedChanges = draft.trim() !== savedValue.current;

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (savedStatusTimeout.current) window.clearTimeout(savedStatusTimeout.current);
    };
  }, []);

  function clearSavedStatusTimeout() {
    if (savedStatusTimeout.current) window.clearTimeout(savedStatusTimeout.current);
  }

  async function save() {
    if (saveInFlight.current) return;

    const normalized = draft.trim();
    setDraft(normalized);
    if (normalized === savedValue.current) {
      setSaveState("idle");
      setErrorMessage(undefined);
      return;
    }

    clearSavedStatusTimeout();
    saveInFlight.current = true;
    setSaveState("saving");
    setErrorMessage(undefined);

    try {
      await onSave(normalized || null);
      savedValue.current = normalized;
      if (!isMounted.current) return;
      setSaveState("saved");
      savedStatusTimeout.current = window.setTimeout(() => setSaveState("idle"), 2_000);
    } catch (error) {
      if (!isMounted.current) return;
      setSaveState("error");
      setErrorMessage(error instanceof Error ? error.message : "We couldn’t save these notes.");
    } finally {
      saveInFlight.current = false;
    }
  }

  return (
    <div className="mt-6">
      <div className="flex min-h-5 items-center justify-between gap-3">
        <label
          className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          htmlFor={notesId}
        >
          Notes
        </label>
        <span
          aria-live="polite"
          className={cn(
            "inline-flex items-center gap-1 text-xs text-muted-foreground",
            saveState === "error" && "text-red-600",
          )}
        >
          {saveState === "saving" ? (
            <>
              <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="size-3" aria-hidden="true" />
              Saved
            </>
          ) : saveState === "error" ? (
            <>
              <AlertCircle className="size-3" aria-hidden="true" />
              Not saved
            </>
          ) : hasUnsavedChanges ? (
            "Save on blur"
          ) : (
            <>
              <Check className="size-3" aria-hidden="true" />
              Saved
            </>
          )}
        </span>
      </div>
      <Textarea
        aria-describedby={`${notesId}-hint${errorMessage ? ` ${notesId}-error` : ""}`}
        aria-invalid={Boolean(errorMessage)}
        className="mt-2 min-h-28"
        data-inline-notes="true"
        disabled={saveState === "saving"}
        id={notesId}
        maxLength={notesMaximumLength}
        onBlur={() => void save()}
        onChange={(event) => {
          clearSavedStatusTimeout();
          setDraft(event.target.value);
          if (!saveInFlight.current) {
            setSaveState("idle");
            setErrorMessage(undefined);
          }
        }}
        placeholder="Add instructions, reminders, or other useful details…"
        value={draft}
      />
      <div
        className="mt-1.5 flex items-start justify-between gap-3 text-xs text-muted-foreground"
        id={`${notesId}-hint`}
      >
        <span>Saved automatically when you leave this field.</span>
        <span className="tabular-nums">
          {draft.length}/{notesMaximumLength}
        </span>
      </div>
      {errorMessage ? (
        <p className="mt-1.5 text-xs text-red-600" id={`${notesId}-error`} role="alert">
          {errorMessage} Your note is still here; leave the field to try again.
        </p>
      ) : null}
    </div>
  );
}

export { InlineNotesField };
