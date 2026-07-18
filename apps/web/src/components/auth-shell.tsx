import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

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
          <Brand />
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
