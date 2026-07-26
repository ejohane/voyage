import { SignUp } from "@clerk/react";
import { useSearchParams } from "react-router-dom";
import { AuthShell, clerkAppearance } from "@/components/auth-shell";
import { safeRedirectPath } from "@/lib/auth-redirect";

function SignUpPage() {
  const [searchParams] = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect_url"));
  return (
    <AuthShell>
      <SignUp
        appearance={clerkAppearance}
        fallbackRedirectUrl={redirect}
        path="/sign-up"
        routing="path"
        signInUrl={`/sign-in?redirect_url=${encodeURIComponent(redirect)}`}
      />
    </AuthShell>
  );
}

export default SignUpPage;
