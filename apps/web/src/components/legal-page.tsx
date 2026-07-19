import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

type LegalPageProps = {
  title: string;
  children: ReactNode;
};

function LegalPage({ title, children }: LegalPageProps) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center px-5 sm:px-8">
          <Brand />
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-sm text-muted-foreground">Last updated July 19, 2026</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-10 space-y-8 text-sm leading-7 text-muted-foreground">{children}</div>
      </main>
    </div>
  );
}

function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-medium text-foreground">{title}</h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

const legalLinkClassName = "underline underline-offset-4 hover:text-foreground";

export { LegalPage, LegalSection, legalLinkClassName };
