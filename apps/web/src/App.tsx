import { useAuth } from "@clerk/react";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "@/components/app-header";

const LandingPage = lazy(() => import("@/pages/landing"));
const SignInPage = lazy(() => import("@/pages/sign-in"));
const SignUpPage = lazy(() => import("@/pages/sign-up"));
const TripPage = lazy(() => import("@/pages/trip"));
const TripsPage = lazy(() => import("@/pages/trips"));

function RootPage() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return <FullPageLoader />;
  }

  return isSignedIn ? <Navigate replace to="/trips" /> : <LandingPage />;
}

function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();
  const location = useLocation();

  if (!isLoaded) {
    return <FullPageLoader />;
  }

  if (!isSignedIn) {
    const redirectUrl = `${location.pathname}${location.search}`;
    return <Navigate replace to={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`} />;
  }

  return <Outlet />;
}

function SignedInLayout() {
  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <AppHeader />
      <Outlet />
    </div>
  );
}

function FullPageLoader() {
  return (
    <div className="grid min-h-svh place-items-center bg-background text-muted-foreground">
      <LoaderCircle className="size-5 animate-spin" aria-label="Loading Voyage" />
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<RootPage />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<SignedInLayout />}>
            <Route path="/trips" element={<TripsPage />} />
            <Route path="/trips/:tripId" element={<TripPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default App;
