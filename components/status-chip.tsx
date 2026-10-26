import type { CaseStatus, TransferStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const caseStyles: Record<CaseStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  closed: { label: "Closed", className: "border-slate-200 bg-slate-100 text-slate-600" },
  archived: {
    label: "Archived",
    className: "border-slate-300 bg-slate-100 text-slate-500",
  },
};

const transferStyles: Record<
  TransferStatus,
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "border-slate-200 bg-slate-100 text-slate-600" },
  sent: { label: "Sent", className: "border-blue-200 bg-blue-50 text-blue-700" },
  accepted: {
    label: "Accepted",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  rejected: {
    label: "Rejected",
    className: "border-rose-200 bg-rose-50 text-rose-600",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-slate-200 bg-slate-100 text-slate-500",
  },
  revoked: {
    label: "Revoked",
    className: "border-rose-300 bg-rose-100 text-rose-800",
  },
};

export function StatusChip({
  status,
  className,
}: {
  status: CaseStatus | TransferStatus;
  className?: string;
}) {
  const item =
    status in caseStyles
      ? caseStyles[status as CaseStatus]
      : transferStyles[status as TransferStatus];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-4",
        item.className,
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {item.label}
    </span>
  );
}
