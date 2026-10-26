import { Shield } from "lucide-react";
import type { SecurityLevel } from "@/lib/types";
import { cn } from "@/lib/utils";

const LEVELS: Record<
  SecurityLevel,
  { label: string; name: string; className: string; dot: string }
> = {
  1: {
    label: "L1",
    name: "Standard",
    className: "border-slate-200 bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
  },
  2: {
    label: "L2",
    name: "High",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    dot: "bg-amber-500",
  },
  3: {
    label: "L3",
    name: "Maximum",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
};

export function LevelBadge({
  level,
  showName = false,
  className,
}: {
  level: SecurityLevel;
  showName?: boolean;
  className?: string;
}) {
  const config = LEVELS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 font-mono text-[11px] font-semibold leading-4 tracking-tight",
        config.className,
        className,
      )}
      title={`${config.label} · ${config.name} clearance`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dot)} />
      {config.label}
      {showName && (
        <span className="font-sans text-[10px] font-medium opacity-70">
          {config.name}
        </span>
      )}
    </span>
  );
}

export function ClearanceBadge({
  level,
  className,
}: {
  level: SecurityLevel;
  className?: string;
}) {
  const config = LEVELS[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold leading-4",
        config.className,
        className,
      )}
    >
      <Shield className="h-3 w-3" aria-hidden />
      Clearance {config.label}
    </span>
  );
}
