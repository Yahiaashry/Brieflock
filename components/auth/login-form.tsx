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

export function LoginForm({ nextPath }: { nextPath?: string }) {
  const demoMode =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [mode, setMode] = React.useState<"password" | "magic">("password");
  const [showPassword, setShowPassword] = React.useState(false);
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );

  return (
    <div className="w-full max-w-[420px]">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm">
        <div className="mb-7">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
            <Lock className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Sign in to your workspace
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            {mode === "password"
              ? "Use your firm credentials. Every session is audited."
              : "We will email you a single-use sign-in link."}
          </p>
        </div>

        {state.message ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <div>
                <p className="text-[13px] font-medium text-emerald-900">
                  Check your inbox
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-700">
                  {state.message}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode("password")}
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
              <Label htmlFor="email">Work email</Label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@firm.com"
                  defaultValue={
                    demoMode ? "marcus@hartwellroe.test" : undefined
                  }
                  className="pl-9"
                  required
                />
              </div>
            </div>

            {mode === "password" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-indigo-600 hover:underline"
                    onClick={() =>
                      setMode(mode === "password" ? "magic" : "password")
                    }
                  >
                    Forgot password?
                  </button>
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

            {state.error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
              >
                {state.error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Signing in…
                </>
              ) : mode === "magic" ? (
                <>
                  Email me a sign-in link
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => setMode(mode === "password" ? "magic" : "password")}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden />
              {mode === "password"
                ? "Email me a sign-in link instead"
                : "Use a password instead"}
            </button>
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
