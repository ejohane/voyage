import { type HealthResponse, healthEndpoint } from "@voyage/contracts";
import { ArrowRight, Check, Cloud, LoaderCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type ConnectionState =
  | { status: "checking" }
  | { status: "connected"; health: HealthResponse }
  | { status: "failed"; message: string };

function App() {
  const [connection, setConnection] = useState<ConnectionState>({ status: "checking" });

  const checkConnection = useCallback(async () => {
    setConnection({ status: "checking" });

    try {
      const response = await fetch(healthEndpoint, {
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`The API returned ${response.status}`);
      }

      const health = (await response.json()) as HealthResponse;

      if (health.status !== "ok") {
        throw new Error("The API returned an unexpected response");
      }

      setConnection({ status: "connected", health });
    } catch (error) {
      setConnection({
        status: "failed",
        message: error instanceof Error ? error.message : "The API could not be reached",
      });
    }
  }, []);

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(47,132,255,0.12),transparent_32%),radial-gradient(circle_at_85%_18%,rgba(255,105,75,0.12),transparent_26%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-border/70 pb-6">
          <img className="h-auto w-40 sm:w-52" src="/voyage-logo.png" alt="Voyage" />
          <span className="rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium tracking-wide text-muted-foreground shadow-sm backdrop-blur">
            Foundation slice
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:py-24">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-primary/8 px-3 py-1.5 text-sm font-medium text-primary">
              <Cloud className="size-4" aria-hidden="true" />
              Running on Cloudflare
            </div>
            <h1 className="text-balance text-5xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Ready to plan what comes next.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
              Voyage now has a production home: a React frontend and Worker API deployed together,
              with one shared TypeScript foundation for the trip-planning experience ahead.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-emerald-600" aria-hidden="true" /> React + Vite
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-emerald-600" aria-hidden="true" /> Cloudflare Workers
              </span>
              <span className="inline-flex items-center gap-2">
                <Check className="size-4 text-emerald-600" aria-hidden="true" /> Bun monorepo
              </span>
            </div>
          </div>

          <aside className="rounded-3xl border border-border bg-card/90 p-6 shadow-[0_24px_80px_-36px_rgba(15,31,73,0.35)] backdrop-blur sm:p-8">
            <p className="text-sm font-medium text-muted-foreground">Live system check</p>
            <div className="mt-5 flex items-start gap-4">
              <ConnectionIcon status={connection.status} />
              <div className="min-w-0 flex-1">
                <ConnectionCopy connection={connection} />
              </div>
            </div>
            <div className="my-7 h-px bg-border" />
            <Button
              className="w-full justify-between"
              variant="outline"
              onClick={() => void checkConnection()}
              disabled={connection.status === "checking"}
            >
              Check connection again
              {connection.status === "checking" ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="size-4" aria-hidden="true" />
              )}
            </Button>
            <a
              className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
              href="https://github.com/ejohane/voyage"
            >
              View the repository <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </aside>
        </section>

        <footer className="border-t border-border/70 pt-6 text-sm text-muted-foreground">
          Voyage · Everyone shares the trip. Not everyone has to manage it.
        </footer>
      </div>
    </main>
  );
}

function ConnectionIcon({ status }: { status: ConnectionState["status"] }) {
  if (status === "checking") {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-sky-100 text-sky-700">
        <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-700">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
      <Check className="size-5" aria-hidden="true" />
    </span>
  );
}

function ConnectionCopy({ connection }: { connection: ConnectionState }) {
  if (connection.status === "checking") {
    return (
      <>
        <h2 className="text-lg font-semibold">Calling the Worker API…</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          The frontend is checking its deployed backend.
        </p>
      </>
    );
  }

  if (connection.status === "failed") {
    return (
      <>
        <h2 className="text-lg font-semibold">Backend unavailable</h2>
        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
          {connection.message}
        </p>
      </>
    );
  }

  const checkedAt = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(new Date(connection.health.checkedAt));

  return (
    <>
      <h2 className="text-lg font-semibold">Frontend and backend connected</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {connection.health.service} responded from {connection.health.environment} at {checkedAt}.
      </p>
    </>
  );
}

export default App;
