import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";
import { demoSignupEnabled } from "@/lib/auth/demo-account";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

export default function SignupPage() {
  return <SignupForm usernameSignup={demoSignupEnabled()} />;
}
