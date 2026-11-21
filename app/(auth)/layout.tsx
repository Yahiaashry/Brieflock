import { ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-navy text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,#263852_0%,transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:56px_56px]"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <BrandMark href="/login" inverse />
        <div className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Audited access only
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-6 py-10">
        {children}
      </main>

      <footer className="relative z-10 px-6 py-6 text-center text-xs text-slate-400">
        BriefLock · Secure legal document exchange
      </footer>
    </div>
  );
}
