"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  completeUploadAction,
  createDocumentAction,
} from "@/app/(app)/cases/actions";
import type { SecurityLevel } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, MAX_UPLOAD_MESSAGE } from "@/lib/upload-limit";
import { cn } from "@/lib/utils";
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

type Step = "select" | "uploading" | "scanning" | "complete" | "quarantined";

const LEVEL_NAMES: Record<SecurityLevel, string> = {
  1: "Standard",
  2: "High",
  3: "Maximum",
};

export function UploadModal({
  caseId,
  defaultLevel,
  open,
  onOpenChange,
}: {
  caseId: string;
  defaultLevel: SecurityLevel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = React.useState<Step>("select");
  const [file, setFile] = React.useState<File | null>(null);
  const [level, setLevel] = React.useState<string>(String(defaultLevel));
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [progress, setProgress] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [pendingScanId, setPendingScanId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { toast } = useToast();

  const levelOptions = ([1, 2, 3] as SecurityLevel[]).filter(
    (value) => value >= defaultLevel,
  );

  React.useEffect(() => {
    if (!open) {
      setStep("select");
      setFile(null);
      setProgress(0);
      setPendingScanId(null);
      setError(null);
      setDescription("");
      setLevel(String(defaultLevel));
    }
  }, [open, defaultLevel]);

  function acceptFile(nextFile: File | undefined) {
    setError(null);
    setPendingScanId(null);
    if (!nextFile) return;
    if (!nextFile.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setError("Only PDF documents are accepted.");
      return;
    }
    if (nextFile.size > MAX_UPLOAD_BYTES) {
      setFile(null);
      setError(MAX_UPLOAD_MESSAGE);
      return;
    }
    setFile(nextFile);
  }

  async function startUpload() {
    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }
    setError(null);
    if (pendingScanId) {
      await finishUpload(pendingScanId, file.name);
      return;
    }
    setStep("uploading");
    setProgress(4);

    const created = await createDocumentAction({
      case_id: caseId,
      filename: file.name,
      size_bytes: file.size,
      security_level: Number(level) as SecurityLevel,
      description: description.trim() || null,
    });

    if (!created.ok || !created.id || !created.upload) {
      setStep("select");
      setError(created.error ?? "The upload could not be started.");
      return;
    }

    setProgress(20);
    try {
      const uploaded = await fetch(created.upload.url, {
        method: created.upload.method,
        headers: created.upload.headers,
        body: file,
      });
      if (!uploaded.ok) throw new Error(`HTTP ${uploaded.status}`);
    } catch {
      setStep("select");
      setProgress(0);
      setError("The PDF could not be uploaded. Please try again.");
      return;
    }

    await finishUpload(created.id, file.name);
  }

  async function finishUpload(documentId: string, filename: string) {
    setProgress(85);
    setStep("scanning");
    const completed = await completeUploadAction(documentId);
    if (!completed.ok) {
      setStep("select");
      setProgress(0);
      setPendingScanId(completed.retryable ? documentId : null);
      setError(completed.error ?? "The scan could not be completed.");
      return;
    }

    setPendingScanId(null);
    router.refresh();
    if (completed.scanStatus !== "clean") {
      setStep("quarantined");
      return;
    }
    setProgress(100);
    setStep("complete");
    toast({
      title: "Document clean — released",
      description: `${filename} passed the scan gate and is now available.`,
      variant: "success",
    });
    window.setTimeout(() => onOpenChange(false), 900);
  }

  const busy = step === "uploading" || step === "scanning";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            The file goes directly to the private bucket. It remains
            quarantined until the scan gate releases it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-1.5">
          {(["select", "uploading", "scanning"] as Step[]).map((item, index) => {
            const order = ["select", "uploading", "scanning", "complete"];
            const activeIndex = order.indexOf(step);
            const current = index <= activeIndex || step === "complete";
            return (
              <React.Fragment key={item}>
                {index > 0 && (
                  <span
                    className={cn(
                      "h-px flex-1",
                      current ? "bg-indigo-300" : "bg-slate-200",
                    )}
                  />
                )}
                <span
                  className={cn(
                    "flex h-5 items-center gap-1.5 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider",
                    current
                      ? "bg-indigo-50 text-indigo-600"
                      : "bg-slate-50 text-slate-400",
                  )}
                >
                  {index + 1} · {item}
                </span>
              </React.Fragment>
            );
          })}
        </div>

        {step === "select" && (
          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                acceptFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-6 py-8 text-center transition-colors",
                dragging
                  ? "border-indigo-400 bg-indigo-50/60"
                  : "border-slate-300 bg-slate-50/60 hover:border-indigo-300 hover:bg-indigo-50/30",
              )}
            >
              {file ? (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-600">
                    <FileText className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-3 max-w-full truncate text-[13px] font-medium text-slate-800">
                    {file.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatBytes(file.size)} · PDF · click to replace
                  </p>
                </>
              ) : (
                <>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                    <UploadCloud className="h-5 w-5" aria-hidden />
                  </div>
                  <p className="mt-3 text-[13px] font-medium text-slate-700">
                    Drop a PDF here, or click to browse
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    PDF only · maximum {MAX_UPLOAD_MB} MB
                  </p>
                </>
              )}
            </button>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="upload-level">Security level</Label>
                <Select
                  id="upload-level"
                  value={level}
                  onChange={(event) => setLevel(event.target.value)}
                >
                  {levelOptions.map((value) => (
                    <option key={value} value={value}>
                      L{value} · {LEVEL_NAMES[value]}
                    </option>
                  ))}
                </Select>
                <p className="text-[10px] leading-4 text-slate-400">
                  You can raise the level at upload. Lowering it later requires
                  a firm admin and is audited.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upload-description">
                  Description{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="upload-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={2000}
                  placeholder="What is in this document?"
                  className="min-h-[38px] h-[38px] resize-none py-2"
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700"
              >
                {error}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] leading-4 text-slate-500">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
              Documents are immutable once uploaded. Replacement means a new
              upload; the previous row is marked superseded.
            </div>
          </div>
        )}

        {step === "uploading" && (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50 text-indigo-600">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-slate-800">
                  {file?.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  Uploading directly to the private bucket…
                </p>
              </div>
              <span className="font-mono text-[12px] font-semibold text-indigo-600">
                {Math.round(progress)}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-indigo-500 transition-[width] duration-150"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-400">
              Bytes never traverse the application server.
            </p>
          </div>
        )}

        {step === "scanning" && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-center gap-2.5">
              <Loader2
                className="h-4 w-4 animate-spin text-amber-600"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-amber-900">
                Scanning — document quarantined
              </p>
            </div>
            <p className="text-[11px] leading-5 text-amber-800">
              Validating PDF structure and embedded-JS heuristics. No one can
              view or download the file until this completes cleanly.
            </p>
          </div>
        )}

        {step === "complete" && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2
                className="h-4 w-4 text-emerald-600"
                aria-hidden
              />
              <p className="text-[13px] font-medium text-emerald-900">
                Scan complete — document is clean
              </p>
            </div>
            <p className="text-[11px] leading-5 text-emerald-800">
              The document is now accessible under the clearance rule.
            </p>
          </div>
        )}

        {step === "quarantined" && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            The PDF failed validation and remains quarantined. It can’t be opened or shared.
          </div>
        )}

        <DialogFooter>
          {step === "select" ? (
            <>
              <Button
                variant="secondary"
                onClick={() => onOpenChange(false)}
                type="button"
              >
                Cancel
              </Button>
              <Button type="button" onClick={startUpload} disabled={!file}>
                <UploadCloud className="h-4 w-4" aria-hidden />
                {pendingScanId ? "Retry validation" : "Upload document"}
              </Button>
            </>
          ) : step === "quarantined" ? (
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <p className="text-[10px] text-slate-400">
              Keep this window open until the scan gate completes.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
