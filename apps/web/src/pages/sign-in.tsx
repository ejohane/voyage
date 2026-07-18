import { SignIn } from "@clerk/react";
import { AuthShell, clerkAppearance } from "@/components/auth-shell";

function SignInPage() {
  return (
    <AuthShell>
      <SignIn appearance={clerkAppearance} path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </AuthShell>
  );
}

export default SignInPage;
