"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Loader2, ShieldAlert } from "lucide-react";
import { changeLevelAction } from "@/app/(app)/cases/actions";
import type { DocumentRecord, SecurityLevel } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";

const NAMES: Record<SecurityLevel, string> = {
  1: "Standard",
  2: "High",
  3: "Maximum",
};

export function ChangeLevelDialog({
  document,
  direction,
  open,
  onOpenChange,
  isAdmin,
}: {
  document: DocumentRecord | null;
  direction: "raise" | "lower";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
}) {
  const [level, setLevel] = React.useState<string>("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    if (!document) return;
    setLevel(
      String(
        direction === "raise"
          ? Math.min(3, document.security_level + 1)
          : Math.max(1, document.security_level - 1),
      ),
    );
    setReason("");
    setError(null);
  }, [document, direction, open]);

  if (!document) return null;

  const options = ([1, 2, 3] as SecurityLevel[]).filter((value) =>
    direction === "raise"
      ? value > document.security_level
      : value < document.security_level,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!document) return;
    if (direction === "lower" && !isAdmin) {
      setError("Only a firm administrator can lower a security level.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await changeLevelAction(
      document.id,
      Number(level) as SecurityLevel,
      direction === "lower" ? reason : undefined,
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "The level could not be changed.");
      return;
    }
    onOpenChange(false);
    toast({
      title:
        direction === "raise"
          ? "Security level raised"
          : "Security level lowered",
      description: `${document.filename} is now L${level}. The change is logged in the audit trail.`,
      variant: "success",
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div
            className={
              direction === "raise"
                ? "mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"
                : "mb-1 flex h-9 w-9 items-center justify-center rounded-lg bg-rose-50 text-rose-600"
            }
          >
            {direction === "raise" ? (
              <ArrowUp className="h-4.5 w-4.5" aria-hidden />
            ) : (
              <ArrowDown className="h-4.5 w-4.5" aria-hidden />
            )}
          </div>
          <DialogTitle>
            {direction === "raise"
              ? "Raise security level"
              : "Lower security level"}
          </DialogTitle>
          <DialogDescription className="truncate">
            {document.filename} · currently L{document.security_level}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-level">New security level</Label>
            <Select
              id="new-level"
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            >
              {options.map((value) => (
                <option key={value} value={value}>
                  L{value} · {NAMES[value]}
                </option>
              ))}
            </Select>
          </div>

          {direction === "raise" ? (
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[11px] leading-5 text-indigo-800">
              This document will require clearance L{level}. Existing viewers at
              other levels will no longer see it.
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] leading-5 text-rose-800">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Lowering a security level widens access. The reason below is
                recorded in the immutable audit log.
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lower-reason">
                  Reason <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id="lower-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Explain why access is being widened…"
                  maxLength={500}
                  required
                />
                <p className="text-right text-[10px] text-slate-400">
                  {reason.length}/500
                </p>
              </div>
            </>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
            >
              {error}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={direction === "lower" ? "destructive" : "default"}
              disabled={pending || options.length === 0}
            >
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              {direction === "raise" ? "Raise level" : "Lower level"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
