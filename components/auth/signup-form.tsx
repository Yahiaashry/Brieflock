"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { signUpAction, type AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = {};

export function SignupForm({ usernameSignup }: { usernameSignup: boolean }) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );
  const identifierField = usernameSignup ? "username" : "email";

  return (
    <div className="w-full max-w-[440px]">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm">
        <div className="mb-7">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
            <User className="h-4.5 w-4.5" aria-hidden />
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Create your account
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            {usernameSignup
              ? "Choose a username and password to start a demo workspace."
              : "Start a new firm workspace. You will be its first administrator."}
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id="full_name"
                name="full_name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                placeholder="Marcus Oyelaran"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={identifierField}>{usernameSignup ? "Username" : "Work email"}</Label>
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id={identifierField}
                name={identifierField}
                type={usernameSignup ? "text" : "email"}
                autoComplete={identifierField}
                autoCapitalize="none"
                placeholder={usernameSignup ? "marcus" : "you@firm.com"}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                pattern={usernameSignup ? "[a-zA-Z0-9][a-zA-Z0-9_\\-]{2,29}" : undefined}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="pl-9 pr-10"
                required
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
            <p className="text-[11px] leading-4 text-slate-400">
              Use a long, unique password. Sign-in is rate-limited and audited.
            </p>
          </div>

          {usernameSignup ? (
            <p className="text-xs text-slate-500">Use sample data in this demo workspace.</p>
          ) : (
          <label className="flex items-start gap-2.5 text-[11px] leading-4 text-slate-500">
            <input
              type="checkbox"
              required
              className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>
              I agree to the Terms of Service and acknowledge that every access
              and administrative change is written to an immutable audit log.
            </span>
          </label>
          )}

          {state.message && (
            <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {state.message}
            </p>
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
                Creating account…
              </>
            ) : (
              <>
                Create account
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      </div>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
