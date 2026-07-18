import { Plane } from "lucide-react";
import type { ReactNode } from "react";

const clerkAppearance = {
  variables: {
    colorPrimary: "#18181b",
    colorForeground: "#18181b",
    colorMutedForeground: "#71717a",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#18181b",
    borderRadius: "0.5rem",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full !shadow-none",
    card: "w-full !border !border-border !bg-white !shadow-sm",
    headerTitle: "tracking-tight",
    formButtonPrimary: "shadow-sm",
    footer: "border-t [background:none!important]",
    footerAction: "!hidden",
  },
};

type AuthShellProps = {
  children: ReactNode;
};

function AuthShell({ children }: AuthShellProps) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
          <a
            className="inline-flex items-center gap-2 rounded-md text-sm font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            href="/"
            aria-label="Voyage home"
          >
            <span className="grid size-8 place-items-center rounded-md bg-foreground text-background">
              <Plane className="size-4" aria-hidden="true" />
            </span>
            Voyage
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8 sm:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="px-5 pb-8 text-center text-xs text-muted-foreground">
        Plan well. Travel together.
      </footer>
    </div>
  );
}

export { AuthShell, clerkAppearance };
