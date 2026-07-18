import { UserButton } from "@clerk/react";
import { Brand } from "@/components/brand";

function AppHeader() {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Brand />
        <UserButton />
      </div>
    </header>
  );
}

export { AppHeader };
