"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updateCaseFlagsAction } from "@/app/(app)/cases/actions";
import type { CaseRecord } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function EditCaseDialog({
  caseItem,
  open,
  onOpenChange,
}: {
  caseItem: CaseRecord;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = React.useState(caseItem.title);
  const [reference, setReference] = React.useState(caseItem.case_reference);
  const [retention, setRetention] = React.useState(
    caseItem.retention_days === null ? "" : String(caseItem.retention_days),
  );
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) {
      setTitle(caseItem.title);
      setReference(caseItem.case_reference);
      setRetention(
        caseItem.retention_days === null ? "" : String(caseItem.retention_days),
      );
      setError(null);
    }
  }, [open, caseItem]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await updateCaseFlagsAction(caseItem.id, {
      title,
      case_reference: reference,
      retention_days: retention ? Number(retention) : null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "The case could not be updated.");
      return;
    }
    onOpenChange(false);
    toast({
      title: "Case updated",
      description: "Metadata changes are recorded in the audit trail.",
      variant: "success",
    });
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit case details</DialogTitle>
          <DialogDescription>
            Metadata only. Uploaded documents remain immutable.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Case title</Label>
            <Input
              id="edit-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={300}
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-reference">Case reference</Label>
              <Input
                id="edit-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-retention">
                Retention{" "}
                <span className="font-normal text-slate-400">(days)</span>
              </Label>
              <Input
                id="edit-retention"
                type="number"
                min={1}
                value={retention}
                onChange={(event) => setRetention(event.target.value)}
                placeholder="Firm default"
              />
            </div>
          </div>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
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
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
