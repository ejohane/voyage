import { SignUp } from "@clerk/react";
import { AuthShell, clerkAppearance } from "@/components/auth-shell";

function SignUpPage() {
  return (
    <AuthShell>
      <SignUp appearance={clerkAppearance} path="/sign-up" routing="path" signInUrl="/sign-in" />
    </AuthShell>
  );
}

export default SignUpPage;
