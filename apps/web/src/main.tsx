import { ClerkProvider } from "@clerk/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required to start Voyage");
}

const root = document.getElementById("root");
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

if (!root) {
  throw new Error("Root element was not found");
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <ClerkProvider
        afterSignOutUrl="/"
        publishableKey={publishableKey}
        signInUrl="/sign-in"
        signInFallbackRedirectUrl="/trips"
        signUpUrl="/sign-up"
        signUpFallbackRedirectUrl="/trips"
      >
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    </BrowserRouter>
  </StrictMode>,
);
