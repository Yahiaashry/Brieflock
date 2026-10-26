import type { Metadata } from "next";
import { BrandMark } from "@/components/brand-mark";
import { FirmSetupForm } from "@/components/auth/firm-setup-form";
import { requireServerUser } from "@/lib/auth/server";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Set up your firm" };

export default async function FirmSetupPage() {
  await requireServerUser();

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_-10%,#e0e7ff_0%,transparent_65%)]"
      />
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <BrandMark href="/firm-setup" />
        <div className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Tenant isolation enabled
        </div>
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        <FirmSetupForm />
      </main>
    </div>
  );
}
