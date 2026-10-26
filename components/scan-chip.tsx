import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  ShieldX,
} from "lucide-react";
import type { ScanStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const config: Record<
  ScanStatus,
  {
    label: string;
    className: string;
    icon: typeof CheckCircle2;
    spin?: boolean;
  }
> = {
  pending: {
    label: "Scanning",
    className: "border-slate-200 bg-slate-50 text-slate-600",
    icon: LoaderCircle,
    spin: true,
  },
  clean: {
    label: "Clean",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  infected: {
    label: "Quarantined",
    className: "border-rose-200 bg-rose-50 text-rose-700",
    icon: ShieldX,
  },
  error: {
    label: "Scan failed",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    icon: AlertTriangle,
  },
};

export function ScanChip({
  status,
  className,
}: {
  status: ScanStatus;
  className?: string;
}) {
  const item = config[status];
  const Icon = item.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        item.className,
        className,
      )}
    >
      <Icon
        className={cn("h-3 w-3", item.spin && "animate-spin")}
        aria-hidden
      />
      {item.label}
    </span>
  );
}
