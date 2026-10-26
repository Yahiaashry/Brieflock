import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-slate-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_-10%,#e0e7ff_0%,transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <BrandMark href="/login" />
        <div className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Audited access only
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        {children}
      </main>

      <footer className="relative z-10 flex flex-col items-center justify-between gap-3 px-6 py-6 text-[11px] text-slate-400 sm:flex-row sm:px-10">
        <p>© 2026 BriefLock. Legal document exchange.</p>
        <div className="flex items-center gap-4">
          <Link href="/login" className="transition-colors hover:text-slate-600">
            Privacy
          </Link>
          <Link href="/login" className="transition-colors hover:text-slate-600">
            Terms
          </Link>
          <span className="hidden sm:inline">EU-hosted · GDPR-aligned</span>
        </div>
      </footer>
    </div>
  );
}
