"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Loader2,
  Send,
  ShieldCheck,
} from "lucide-react";
import type {
  CaseStatus,
  DocumentRecord,
  Profile,
  SecurityLevel,
} from "@/lib/types";
import { formatBytes, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createTransferAction,
  transitionTransferAction,
} from "@/app/(app)/transfers/actions";
import { LevelBadge } from "@/components/level-badge";
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

type ComposerCase = {
  id: string;
  title: string;
  case_reference: string;
  default_security_level: SecurityLevel;
  status: CaseStatus;
  documents: Pick<DocumentRecord, "id" | "filename" | "size_bytes" | "security_level" | "scan_status" | "description" | "uploaded_at">[];
};

type ComposerFirm = {
  id: string;
  name: string;
  members: Pick<Profile, "id" | "full_name">[];
};

const stepLabels = ["Case & recipients", "Documents", "Review & send"];

export function TransferWizard({
  open,
  onOpenChange,
  onCompleted,
  cases,
  firms,
  initialCaseId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCompleted?: () => void;
  cases: ComposerCase[];
  firms: ComposerFirm[];
  initialCaseId: string | null;
}) {
  const [step, setStep] = React.useState(0);
  const [caseId, setCaseId] = React.useState(initialCaseId ?? "");
  const [firmId, setFirmId] = React.useState("");
  const [recipientIds, setRecipientIds] = React.useState<string[]>([]);
  const [documentIds, setDocumentIds] = React.useState<string[]>([]);
  const [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState<"send" | "draft" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => {
    if (!open) return;
    setStep(0);
    setCaseId(
      initialCaseId && cases.some((item) => item.id === initialCaseId)
        ? initialCaseId
        : "",
    );
    setFirmId("");
    setRecipientIds([]);
    setDocumentIds([]);
    setMessage("");
    setError(null);
    setPending(null);
  }, [open, initialCaseId, cases]);

  const selectedCase = cases.find((item) => item.id === caseId);
  const selectedFirm = firms.find((firm) => firm.id === firmId);
  const caseDocuments = selectedCase?.documents ?? [];
  const recipients = selectedFirm?.members ?? [];
  const recipientLimitReached = recipientIds.length >= 10;
  const allSelected =
    caseDocuments.length > 0 &&
    caseDocuments.every((document) => documentIds.includes(document.id));
  const stepOneValid =
    Boolean(caseId) && Boolean(firmId) && recipientIds.length > 0;
  const stepTwoValid = documentIds.length > 0;

  function chooseCase(nextCaseId: string) {
    setCaseId(nextCaseId);
    setDocumentIds([]);
    setError(null);
  }

  function chooseFirm(nextFirmId: string) {
    setFirmId(nextFirmId);
    setRecipientIds([]);
    setError(null);
  }

  function toggleRecipient(userId: string) {
    setRecipientIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : current.length >= 10
          ? current
          : [...current, userId],
    );
  }

  function toggleDocument(documentId: string) {
    setDocumentIds((current) =>
      current.includes(documentId)
        ? current.filter((id) => id !== documentId)
        : [...current, documentId],
    );
  }

  function toggleAllDocuments() {
    setDocumentIds(allSelected ? [] : caseDocuments.map((doc) => doc.id));
  }

  async function submit(mode: "send" | "draft") {
    if (!stepOneValid || !stepTwoValid) {
      setError("Complete the required selections before sending.");
      return;
    }
    setPending(mode);
    setError(null);
    const created = await createTransferAction({
      case_id: caseId,
      to_firm_id: firmId,
      recipient_user_ids: recipientIds,
      document_ids: documentIds,
      message: message.trim() || null,
    });
    if (!created.ok || !created.id) {
      setPending(null);
      setError(created.error ?? "The transfer could not be created.");
      return;
    }
    const transferId = created.id;
    onCompleted?.();
    if (mode === "send") {
      const sent = await transitionTransferAction(transferId, "send");
      if (!sent.ok) {
        setPending(null);
        toast({
          title: "Draft saved, sending failed",
          description: sent.error,
          variant: "error",
        });
        onOpenChange(false);
        router.push(`/transfers/${transferId}`);
        router.refresh();
        return;
      }
      toast({
        title: "Transfer sent",
        description:
          "Recipients must accept before any document access is granted.",
        variant: "success",
      });
    } else {
      toast({
        title: "Draft saved",
        description: "Send it from the transfer page when you are ready.",
        variant: "success",
      });
    }
    setPending(null);
    onOpenChange(false);
    router.push(`/transfers/${transferId}`);
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New transfer</DialogTitle>
          <DialogDescription>
            Send case documents to another firm through an audited,
            acceptance-gated transfer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          {stepLabels.map((label, index) => (
            <React.Fragment key={label}>
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                    index < step
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : index === step
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {index < step ? (
                    <Check className="h-3 w-3" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "hidden truncate text-[11px] font-medium sm:block",
                    index === step ? "text-slate-800" : "text-slate-400",
                  )}
                >
                  {label}
                </span>
              </div>
              {index < stepLabels.length - 1 && (
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
              )}
            </React.Fragment>
          ))}
        </div>

        <div className="min-h-[280px] space-y-4">
          {step === 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-case">Case</Label>
                  <Select
                    id="transfer-case"
                    value={caseId}
                    onChange={(event) => chooseCase(event.target.value)}
                  >
                    <option value="">Select a case…</option>
                    {cases.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {item.case_reference}
                      </option>
                    ))}
                  </Select>
                  {selectedCase && (
                    <p className="text-[10px] text-slate-400">
                      {selectedCase.documents.length} clean document
                      {selectedCase.documents.length === 1 ? "" : "s"} available
                      at your clearance
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-firm">Receiving firm</Label>
                  <Select
                    id="transfer-firm"
                    value={firmId}
                    onChange={(event) => chooseFirm(event.target.value)}
                  >
                    <option value="">Select a firm…</option>
                    {firms.map((firm) => (
                      <option key={firm.id} value={firm.id}>
                        {firm.name}
                      </option>
                    ))}
                  </Select>
                  {selectedFirm && (
                    <p className="text-[10px] text-slate-400">
                      {recipients.length} active member
                      {recipients.length === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Recipients</Label>
                  <span className="text-[10px] text-slate-400">
                    {recipientIds.length} / 10 selected
                  </span>
                </div>
                {!selectedFirm ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[11px] text-slate-400">
                    Choose a receiving firm to see its members.
                  </div>
                ) : recipients.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-[11px] text-slate-400">
                    This firm has no active members to receive a transfer.
                  </div>
                ) : (
                  <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                    {recipients.map((profile) => {
                      const checked = recipientIds.includes(profile.id);
                      return (
                        <label
                          key={profile.id}
                          className={cn(
                            "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 transition-colors",
                            checked
                              ? "border-indigo-200 bg-indigo-50/60"
                              : "border-transparent hover:bg-slate-50",
                            !checked &&
                              recipientLimitReached &&
                              "cursor-not-allowed opacity-50",
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-indigo-600"
                            checked={checked}
                            disabled={!checked && recipientLimitReached}
                            onChange={() => toggleRecipient(profile.id)}
                          />
                          <span className="min-w-0">
                            <span className="block truncate text-[12px] font-medium text-slate-700">
                              {profile.full_name}
                            </span>

                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-slate-400">
                  Only designated recipients can accept the transfer. Up to 10
                  people.
                </p>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-medium text-slate-700">
                    Select documents
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Only clean documents visible at your clearance can be
                    transferred.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={toggleAllDocuments}
                  disabled={caseDocuments.length === 0}
                >
                  {allSelected ? "Clear all" : "Select all"}
                </Button>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-200">
                {caseDocuments.length === 0 ? (
                  <div className="px-4 py-10 text-center text-[11px] text-slate-400">
                    No clean documents are available to you in this case.
                  </div>
                ) : (
                  <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                    {caseDocuments.map((document) => {
                      const checked = documentIds.includes(document.id);
                      return (
                        <label
                          key={document.id}
                          className="flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            className="mt-0.5 h-3.5 w-3.5 accent-indigo-600"
                            checked={checked}
                            onChange={() => toggleDocument(document.id)}
                          />
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[12px] font-medium text-slate-800">
                                {document.filename}
                              </span>
                              <LevelBadge level={document.security_level} />
                            </span>
                            <span className="mt-0.5 block text-[10px] text-slate-400">
                              {formatBytes(document.size_bytes)} · uploaded{" "}
                              {formatDate(document.uploaded_at)}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                {documentIds.length} document
                {documentIds.length === 1 ? "" : "s"} selected. Recipients must
                match each document&apos;s level exactly to open it.
              </p>
            </>
          )}

          {step === 2 && (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Case
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-slate-800">
                      {selectedCase?.title}
                    </p>
                    <p className="font-mono text-[10px] text-slate-400">
                      {selectedCase?.case_reference}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Receiving firm
                    </p>
                    <p className="mt-1 text-[12px] font-medium text-slate-800">
                      {selectedFirm?.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {recipientIds.length} recipient
                      {recipientIds.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-200 pt-3">
                  {recipients
                    .filter((profile) => recipientIds.includes(profile.id))
                    .map((profile) => (
                      <span
                        key={profile.id}
                        className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-600"
                      >
                        {profile.full_name}
                      </span>
                    ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[11px] font-medium text-slate-700">
                  {documentIds.length} document
                  {documentIds.length === 1 ? "" : "s"}
                </p>
                <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                  {caseDocuments
                    .filter((document) => documentIds.includes(document.id))
                    .map((document) => (
                      <div
                        key={document.id}
                        className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0"
                      >
                        <span className="truncate text-[11px] text-slate-700">
                          {document.filename}
                        </span>
                        <LevelBadge level={document.security_level} />
                      </div>
                    ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="transfer-message">
                  Message to recipients{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                </Label>
                <Textarea
                  id="transfer-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Context for the receiving team…"
                  maxLength={1000}
                  rows={3}
                />
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5 text-[10px] leading-5 text-indigo-800">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Access begins only after a designated recipient accepts.
                Acceptance adds them as an external member for the selected
                documents. The sender can revoke accepted access.
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-100 pt-4">
          <div className="mr-auto flex items-center gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep((value) => value - 1)}
                disabled={Boolean(pending)}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
                Back
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={Boolean(pending)}
          >
            Cancel
          </Button>
          {step < 2 ? (
            <Button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              disabled={
                Boolean(pending) ||
                (step === 0 && !stepOneValid) ||
                (step === 1 && !stepTwoValid)
              }
            >
              Continue
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => submit("draft")}
                disabled={Boolean(pending)}
              >
                {pending === "draft" && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                )}
                Save draft
              </Button>
              <Button
                type="button"
                onClick={() => submit("send")}
                disabled={Boolean(pending)}
              >
                {pending === "send" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Send className="h-3.5 w-3.5" aria-hidden />
                )}
                Send transfer
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
