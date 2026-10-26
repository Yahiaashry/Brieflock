import Link from "next/link";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  compact = false,
  inverse = false,
  href = "/cases",
}: {
  className?: string;
  compact?: boolean;
  inverse?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("group inline-flex items-center gap-2.5", className)}
      aria-label="BriefLock home"
    >
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-800 text-white shadow-sm shadow-indigo-900/30">
        <Scale className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden />
        <span className="absolute inset-x-0 top-0 h-px bg-white/40" />
      </span>
      {!compact && (
        <span className="flex flex-col">
          <span
            className={cn(
              "text-[15px] font-semibold leading-none tracking-tight",
              inverse ? "text-white" : "text-slate-900",
            )}
          >
            BriefLock
          </span>
          <span
            className={cn(
              "mt-1 text-[9px] font-semibold uppercase tracking-[0.18em]",
              inverse ? "text-slate-400" : "text-slate-400",
            )}
          >
            Secure case files
          </span>
        </span>
      )}
    </Link>
  );
}
