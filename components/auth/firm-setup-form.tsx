"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Building2, Link2, Loader2 } from "lucide-react";
import { createFirmAction } from "@/app/firm-setup/actions";
import type { AuthState } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = {};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function FirmSetupForm() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [state, formAction, pending] = useActionState(
    createFirmAction,
    initialState,
  );

  const effectiveSlug = slugTouched ? slug : slugify(name);

  return (
    <div className="w-full max-w-[460px]">
      <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-sm">
        <div className="mb-7">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700">
            <Building2 className="h-4.5 w-4.5" aria-hidden />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
            First-run setup
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-slate-900">
            Name your firm workspace
          </h1>
          <p className="mt-1.5 text-[13px] leading-5 text-slate-500">
            This becomes your tenant boundary. Cases, documents and audit
            records never cross it.
          </p>
        </div>

        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Firm name</Label>
            <div className="relative">
              <Building2
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Hartwell & Roe LLP"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug">Workspace address</Label>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-xs focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20">
              <span className="flex items-center gap-1 border-r border-slate-100 px-3 text-[12px] text-slate-400">
                <Link2 className="h-3.5 w-3.5" aria-hidden />
                app.brieflock.com/
              </span>
              <input
                id="slug"
                name="slug"
                value={effectiveSlug}
                onChange={(event) => {
                  setSlugTouched(true);
                  setSlug(slugify(event.target.value));
                }}
                placeholder="hartwell-roe"
                className="h-9 min-w-0 flex-1 rounded-r-lg bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                required
              />
            </div>
            {effectiveSlug && (
              <p className="text-[11px] text-emerald-600">
                Available — a unique workspace address.
              </p>
            )}
          </div>

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
                Creating workspace…
              </>
            ) : (
              <>
                Create workspace
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-4 text-slate-400">
          You will be the firm administrator. Clearance starts at L2 and can be
          changed by an administrator.
        </p>
      </div>
    </div>
  );
}
