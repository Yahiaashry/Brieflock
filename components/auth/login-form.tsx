"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { signInAction, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = {};
type SignInMode = "password" | "magic" | "confirm";

const modeLabels = {
  password: { description: "Open your firm’s legal workspace.", submit: "Sign in securely", pending: "Signing in…" },
  magic: { description: "Request a single-use sign-in link.", submit: "Email me a sign-in link", pending: "Requesting link…" },
  confirm: { description: "Request a new account confirmation link.", submit: "Resend confirmation email", pending: "Requesting confirmation…" },
};

export function LoginForm({
  nextPath,
  linkError,
  usernameSignup,
}: {
  nextPath?: string;
  linkError?: "browser" | "invalid";
  usernameSignup: boolean;
}) {
  const demoMode =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [mode, setMode] = React.useState<SignInMode>("password");
  const [email, setEmail] = React.useState(demoMode ? "marcus@hartwellroe.test" : "");
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );
  const [dismissed, setDismissed] = React.useState<AuthState>();
  const feedback = state === dismissed ? initialState : state;
  const labels = modeLabels[mode];
  const acceptsUsername = usernameSignup && mode === "password";
  const showEmailOptions = !acceptsUsername || email.includes("@");

  function changeMode(nextMode: SignInMode) {
    setDismissed(state);
    setMode(nextMode);
  }

  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-2xl border border-line bg-surface p-6 shadow-xl shadow-navy/20 sm:p-8">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-white">
            <Lock className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-content">
            Sign in to BriefLock
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            {labels.description}
          </p>
        </div>
        {linkError && mode === "password" && !feedback.message && !feedback.error && (
          <p role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {linkError === "browser"
              ? "Open the sign-in link in the browser where you requested it, or request a new link here."
              : "This sign-in link is no longer valid. Request a new one or use your password."}
          </p>
        )}

        {feedback.message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[13px] font-medium text-emerald-900">
                  Check your inbox
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  {feedback.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => changeMode("password")}
              className="mt-3 text-xs font-medium text-emerald-800 underline underline-offset-2"
            >
              Back to password sign-in
            </button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="mode" value={mode} />
            <input type="hidden" name="next" value={nextPath ?? "/cases"} />

            <div className="space-y-1.5">
              <Label htmlFor="email">{acceptsUsername ? "Username or email" : "Work email"}</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type={acceptsUsername ? "text" : "email"}
                  autoComplete={acceptsUsername ? "username" : "email"}
                  autoCapitalize="none"
                  placeholder={acceptsUsername ? "Your username" : "you@firm.com"}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            {mode === "password" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  {showEmailOptions && <button
                    type="button"
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                    onClick={() => changeMode("magic")}
                    disabled={pending}
                  >
                    Forgot password?
                  </button>}
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    aria-hidden
                  />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    defaultValue={demoMode ? "BriefLock!23" : undefined}
                    className="pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {feedback.error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
              >
                {feedback.error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {labels.pending}
                </>
              ) : (
                <>
                  {labels.submit}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>

            {showEmailOptions && <button
              type="button"
              onClick={() => changeMode(mode === "password" ? "magic" : "password")}
              disabled={pending}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              {mode === "password"
                ? "Email me a sign-in link instead"
                : "Use a password instead"}
            </button>}
            {mode === "password" && showEmailOptions && (
              <button
                type="button"
                onClick={() => changeMode("confirm")}
                disabled={pending}
                className="mx-auto block text-xs font-medium text-indigo-700 hover:underline"
              >
                Resend confirmation email
              </button>
            )}
          </form>
        )}

        {demoMode && (
          <div className="mt-6 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5">
            <p className="text-[11px] leading-4 text-slate-500">
              <span className="font-semibold text-slate-600">
                Demo workspace
              </span>{" "}
              - credentials are prefilled. Sign in to explore the seeded
              Hartwell &amp; Roe firm.
            </p>
          </div>
        )}
      </div>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        New to BriefLock?{" "}
        <Link
          href="/signup"
          className="font-medium text-indigo-600 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
