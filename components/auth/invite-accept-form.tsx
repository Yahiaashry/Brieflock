"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Lock, User } from "lucide-react";
import {
  acceptInviteAction,
  type AuthState,
} from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LevelBadge } from "@/components/level-badge";

const initialState: AuthState = {};

export interface InvitePreview {
  firm_name: string;
  role: string;
  clearance_level: 1 | 2 | 3;
  email: string;
}

export function InviteAcceptForm({
  token,
  preview,
  signedIn,
}: {
  token: string;
  preview: InvitePreview;
  signedIn: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [state, formAction, pending] = useActionState(
    acceptInviteAction,
    initialState,
  );

  return (
    <div className="w-full max-w-[460px]">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm">
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
            Invitation
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">
            Join {preview.firm_name}
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            Your firm, role and clearance are fixed by the invitation.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            <div>
              <dt className="text-slate-400">Email</dt>
              <dd className="mt-0.5 truncate font-medium text-slate-700">
                {preview.email}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Role</dt>
              <dd className="mt-0.5 font-medium capitalize text-slate-700">
                {preview.role.replace("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Clearance</dt>
              <dd className="mt-1">
                <LevelBadge level={preview.clearance_level} showName />
              </dd>
            </div>
            <div>
              <dt className="text-slate-400">Access model</dt>
              <dd className="mt-0.5 font-medium text-slate-700">
                Exact-match
              </dd>
            </div>
          </dl>
        </div>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="token" value={token} />

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
                placeholder="Nadia Haddad"
                className="pl-9"
                required
              />
            </div>
          </div>

          {!signedIn && <div className="space-y-1.5">
            <Label htmlFor="password">Create a password</Label>
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
              Only documents at exactly your clearance will open for you.
            </p>
          </div>}

          {state.error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
            >
              {state.error}
            </div>
          )}
          {state.message && <p role="status" className="rounded-lg bg-tint p-3 text-sm text-content">{state.message}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Accepting invitation…
              </>
            ) : (
              "Accept invitation"
            )}
          </Button>
          {!signedIn && (
            <Link href={`/login?next=${encodeURIComponent(`/invite/accept?token=${encodeURIComponent(token)}`)}`}
              className="block text-center text-sm text-brand hover:underline">
              Already have an account? Sign in
            </Link>
          )}
        </form>
      </div>
    </div>
  );
}
