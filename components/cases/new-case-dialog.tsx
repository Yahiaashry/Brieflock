"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { createCaseAction } from "@/app/(app)/cases/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";

export function NewCaseDialog() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [level, setLevel] = React.useState("2");
  const [retention, setRetention] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await createCaseAction({
      title,
      case_reference: reference,
      default_security_level: Number(level) as 1 | 2 | 3,
      retention_days: retention ? Number(retention) : null,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error ?? "The case could not be created.");
      return;
    }
    setOpen(false);
    setTitle("");
    setReference("");
    setLevel("2");
    setRetention("");
    toast({
      title: "Case created",
      description:
        "The matter is ready. Creation is recorded in the audit trail.",
      variant: "success",
    });
    if (result.id) router.push(`/cases/${result.id}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden />
          New case
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a case</DialogTitle>
          <DialogDescription>
            Cases are firm-local. You will be added as the case lead.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="case-title">Case title</Label>
            <Input
              id="case-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="State v. Dolan"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="case-reference">Case reference</Label>
              <Input
                id="case-reference"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="2026-CR-0114"
                required
              />
              <p className="text-[10px] text-slate-400">
                Unique within your firm.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="case-level">Default security level</Label>
              <Select
                id="case-level"
                value={level}
                onChange={(event) => setLevel(event.target.value)}
              >
                <option value="1">L1 · Standard</option>
                <option value="2">L2 · High</option>
                <option value="3">L3 · Maximum</option>
              </Select>
              <p className="text-[10px] text-slate-400">
                Applies to future uploads only.
              </p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="case-retention">
              Retention override{" "}
              <span className="font-normal text-slate-400">(days, optional)</span>
            </Label>
            <Input
              id="case-retention"
              type="number"
              min={1}
              value={retention}
              onChange={(event) => setRetention(event.target.value)}
              placeholder="Use firm default"
            />
          </div>
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
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Create case
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
