import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { signInDestination } from "@/lib/auth/redirect";
import { getServerAuth } from "@/lib/auth/server";
import { demoSignupEnabled } from "@/lib/auth/demo-account";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; link?: string }>;
}) {
  const params = await searchParams;
  const nextPath = signInDestination(params.next);
  const auth = await getServerAuth();
  if (auth.user && auth.accessToken) {
    if (auth.profile?.is_active) redirect(nextPath);
    if (!auth.profile) {
      redirect(nextPath.startsWith("/invite/accept?") ? nextPath : "/firm-setup");
    }
  }
  const linkError = params.link === "browser" ? "browser" :
    params.link === "invalid" ? "invalid" : undefined;
  return <LoginForm nextPath={nextPath} linkError={linkError} usernameSignup={demoSignupEnabled()} />;
}
