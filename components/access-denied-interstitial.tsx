import Link from "next/link";
import { ArrowLeft, Download, Lock, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DenialCode =
  | "ACCESS_DENIED"
  | "DOWNLOAD_BLOCKED_L3"
  | "CASE_ARCHIVED"
  | "NOT_FOUND"
  | "RATE_LIMITED";

const copy: Record<
  DenialCode,
  { title: string; body: string; extra?: string; icon: typeof Lock }
> = {
  ACCESS_DENIED: {
    title: "You don't have access to this document.",
    body: "This may be outside your clearance, outside your firm's cases, or the document may be quarantined.",
    icon: Lock,
  },
  DOWNLOAD_BLOCKED_L3: {
    title: "Downloads are disabled for this document.",
    body: "L3 documents in this case are view-only. You can still view it (watermarked).",
    icon: Download,
  },
  CASE_ARCHIVED: {
    title: "This case is archived.",
    body: "New uploads, transfers and member changes are blocked. You can still view its documents.",
    icon: Lock,
  },
  NOT_FOUND: {
    title: "Not found.",
    body: "The page you requested does not exist, or it is not available to your account.",
    icon: SearchX,
  },
  RATE_LIMITED: {
    title: "Too many requests.",
    body: "Try again shortly.",
    extra: "Your access attempt was recorded.",
    icon: Lock,
  },
};

export function AccessDeniedInterstitial({
  code = "ACCESS_DENIED",
  backHref = "/cases",
  backLabel = "Back to cases",
  className,
}: {
  code?: DenialCode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  const item = copy[code];
  const Icon = item.icon;
  return (
    <div
      role="alertdialog"
      aria-label={item.title}
      className={cn(
        "flex min-h-[60vh] items-center justify-center px-4 py-10",
        className,
      )}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Icon className="h-5.5 w-5.5" aria-hidden />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
          {item.title}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">{item.body}</p>
        {item.extra && (
          <p className="mt-1 text-[11px] text-slate-400">{item.extra}</p>
        )}
        <Button asChild variant="secondary" className="mt-6">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {backLabel}
          </Link>
        </Button>
      </div>
    </div>
  );
}
