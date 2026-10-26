"use client";

import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight text-slate-900">
          Something went wrong.
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The request failed safely. No document content was exposed. Try again
          or contact your firm administrator with the reference below.
        </p>
        <p className="mt-3 font-mono text-[11px] text-slate-400">
          req_5f2c9b71a4d84e6f
        </p>
        <Button onClick={reset} className="mt-6 w-full">
          Try again
        </Button>
      </div>
    </div>
  );
}
