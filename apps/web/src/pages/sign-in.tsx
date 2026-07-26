import { SignIn } from "@clerk/react";
import { useSearchParams } from "react-router-dom";
import { AuthShell, clerkAppearance } from "@/components/auth-shell";
import { safeRedirectPath } from "@/lib/auth-redirect";

function SignInPage() {
  const [searchParams] = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect_url"));
  return (
    <AuthShell>
      <SignIn
        appearance={clerkAppearance}
        fallbackRedirectUrl={redirect}
        path="/sign-in"
        routing="path"
        signUpUrl={`/sign-up?redirect_url=${encodeURIComponent(redirect)}`}
      />
    </AuthShell>
  );
}

export default SignInPage;
