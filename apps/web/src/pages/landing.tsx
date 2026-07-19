import { SignInButton, SignUpButton } from "@clerk/react";
import { ArrowRight, Check, Map as MapIcon, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

const landingFeatures = [
  {
    icon: MapIcon,
    title: "One shared plan",
    description: "Keep the itinerary and ideas together.",
  },
  {
    icon: Check,
    title: "Clear decisions",
    description: "Make it obvious what is settled and what is next.",
  },
  {
    icon: Users,
    title: "Everyone included",
    description: "Give the whole group a simple place to contribute.",
  },
];

function LandingPage() {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
          <Brand />
          <div className="flex items-center gap-2">
            <SignInButton mode="redirect">
              <Button>Log in</Button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <Button variant="outline">Sign up</Button>
            </SignUpButton>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 py-20 text-center sm:px-8 sm:py-28">
          <p className="mb-5 text-sm font-medium text-muted-foreground">
            Travel planning, simplified.
          </p>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Plan the trip together.
            <br />
            Keep everyone in sync.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Voyage gives your group one calm place for the itinerary, ideas, and decisions—without
            another busy group chat.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <SignInButton mode="redirect">
              <Button size="lg">
                Log in
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </SignInButton>
            <SignUpButton mode="redirect">
              <Button size="lg" variant="outline">
                Sign up
              </Button>
            </SignUpButton>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Built for the whole group, not just the planner.
          </p>
        </section>

        <section className="border-t">
          <div className="mx-auto grid w-full max-w-5xl gap-px bg-border sm:grid-cols-3">
            {landingFeatures.map(({ icon: Icon, title, description }) => (
              <div className="bg-background px-6 py-8 sm:px-8" key={title}>
                <Icon className="mb-4 size-5 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-medium">{title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 text-xs text-muted-foreground sm:px-8">
          <span>© 2026 Voyage</span>
          <span className="flex items-center gap-4">
            <Link className="hover:text-foreground" to="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-foreground" to="/terms">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
