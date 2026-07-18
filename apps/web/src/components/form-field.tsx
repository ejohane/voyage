import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

function FormField({
  children,
  description,
  error,
  id,
  label,
}: {
  children: ReactNode;
  description?: string;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export { FormField };
