"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeftRight,
  ChevronRight,
  FileText,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import type {
  CaseMember,
  CaseRecord,
  DocumentRecord,
  Profile,
  SecurityLevel,
  TransferWithMeta,
} from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateCaseFlagsAction } from "@/app/(app)/cases/actions";
import { LevelBadge } from "@/components/level-badge";
import { StatusChip } from "@/components/status-chip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentsPanel } from "@/components/cases/documents-panel";
import { MembersPanel } from "@/components/cases/members-panel";
import { CaseTransfersPanel } from "@/components/cases/case-transfers-panel";
import { EditCaseDialog } from "@/components/cases/edit-case-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";

type CaseAction = "close" | "reopen" | "archive";

type FlagChange =
  | {
      key: "level";
      value: SecurityLevel;
      title: string;
      description: string;
      confirmLabel: string;
    }
  | {
      key: "l3";
      value: boolean;
      title: string;
      description: string;
      confirmLabel: string;
    }
  | {
      key: "hold";
      value: boolean;
      title: string;
      description: string;
      confirmLabel: string;
    };

const caseActionCopy: Record<
  CaseAction,
  { title: string; description: string; confirmLabel: string; destructive: boolean }
> = {
  close: {
    title: "Close this case?",
    description:
      "The matter is marked closed and the closing time is recorded. Documents remain readable and you can reopen it later.",
    confirmLabel: "Close case",
    destructive: false,
  },
  reopen: {
    title: "Reopen this case?",
    description:
      "The case returns to open status and new activity is allowed again. The change is recorded in the audit trail.",
    confirmLabel: "Reopen case",
    destructive: false,
  },
  archive: {
    title: "Archive this case?",
    description:
      "New uploads, transfers and member changes will be blocked. Reading and downloads remain possible under the normal access rule.",
    confirmLabel: "Archive case",
    destructive: true,
  },
};

export function CaseDetail({
  caseItem,
  documents,
  members,
  transfers,
  firmMembers,
  uploaderNames,
  user,
}: {
  caseItem: CaseRecord;
  documents: DocumentRecord[];
  members: (CaseMember & { profile: Profile })[];
  transfers: TransferWithMeta[];
  firmMembers: Profile[];
  uploaderNames: Record<string, string>;
  user: Profile;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [caseAction, setCaseAction] = React.useState<CaseAction | null>(null);
  const [flagChange, setFlagChange] = React.useState<FlagChange | null>(null);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const archived = caseItem.status === "archived";
  const isAdmin = user.role === "firm_admin" && caseItem.firm_id === user.firm_id;
  const isExternalView = caseItem.firm_id !== user.firm_id;
  const ownMembership = members.find((member) => member.user_id === user.id);
  const canUpload =
    !archived &&
    caseItem.firm_id === user.firm_id &&
    Boolean(ownMembership && ownMembership.role !== "external");
  const lead = members.find((member) => member.role === "lead");

  async function runCaseAction() {
    if (!caseAction) return;
    setPending(true);
    const result = await updateCaseFlagsAction(caseItem.id, {
      status:
        caseAction === "close"
          ? "closed"
          : caseAction === "reopen"
            ? "open"
            : "archived",
    });
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Action blocked",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title:
        caseAction === "archive"
          ? "Case archived"
          : caseAction === "close"
            ? "Case closed"
            : "Case reopened",
      description: "The change is recorded in the audit trail.",
      variant: "success",
    });
    setCaseAction(null);
    router.refresh();
  }

  async function runFlagChange() {
    if (!flagChange) return;
    setPending(true);
    const patch =
      flagChange.key === "level"
        ? { default_security_level: flagChange.value }
        : flagChange.key === "l3"
          ? { allow_l3_download: flagChange.value }
          : { legal_hold: flagChange.value };
    const result = await updateCaseFlagsAction(caseItem.id, patch);
    setPending(false);
    if (!result.ok) {
      toast({
        title: "Change blocked",
        description: result.error,
        variant: "error",
      });
      return;
    }
    toast({
      title: "Case flag updated",
      description: "The change is recorded in the audit trail.",
      variant: "success",
    });
    setFlagChange(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Link href="/cases" className="transition-colors hover:text-slate-600">
          Cases
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-mono text-slate-500">
          {caseItem.case_reference}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">
              {caseItem.title}
            </h1>
            <StatusChip status={caseItem.status} />
            <LevelBadge level={caseItem.default_security_level} showName />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span className="font-mono tracking-wide text-slate-500">
              {caseItem.case_reference}
            </span>
            <span>Opened {formatDate(caseItem.created_at)}</span>
            {lead && <span>Lead · {lead.profile.full_name}</span>}
            <span className="inline-flex items-center gap-1 text-slate-500">
              <LockKeyhole className="h-3 w-3" aria-hidden />
              Your clearance L{user.clearance_level}
            </span>
          </div>
        </div>

        {isAdmin && !archived && (
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit case
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Case actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Case lifecycle</DropdownMenuLabel>
                {caseItem.status === "open" ? (
                  <DropdownMenuItem onSelect={() => setCaseAction("close")}>
                    <XCircle className="h-4 w-4" />
                    Close case
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => setCaseAction("reopen")}>
                    <RotateCcw className="h-4 w-4" />
                    Reopen case
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-rose-600 focus:bg-rose-50 focus:text-rose-700 [&_svg]:text-rose-500"
                  onSelect={() => setCaseAction("archive")}
                >
                  <Archive className="h-4 w-4" />
                  Archive case
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {archived && (
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-100/70 px-4 py-3">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          <div>
            <p className="text-[12px] font-medium text-slate-700">
              This case is archived.
            </p>
            <p className="text-[11px] leading-5 text-slate-500">
              New uploads, transfers and member changes are blocked. Reading and
              downloads continue under the normal access rule.
            </p>
          </div>
        </div>
      )}

      {isExternalView && (
        <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <ArrowLeftRight
            className="mt-0.5 h-4 w-4 shrink-0 text-sky-600"
            aria-hidden
          />
          <div>
            <p className="text-[12px] font-medium text-sky-900">
              External access — {caseItem.firm_id === "firm_ashcroft" ? "Ashcroft & Vale" : "another firm"}
            </p>
            <p className="text-[11px] leading-5 text-sky-700">
              You are a case member through an accepted transfer. Only the
              transferred documents that exactly match your clearance are
              visible.
            </p>
          </div>
        </div>
      )}

      <div className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        <div className="border-b border-slate-100 p-4 sm:border-r xl:border-b-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Default level
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <LevelBadge level={caseItem.default_security_level} showName />
            {isAdmin && !archived ? (
              <Select
                aria-label="Change default security level"
                className="h-7 w-24 text-[11px]"
                value={String(caseItem.default_security_level)}
                onChange={(event) => {
                  const value = Number(event.target.value) as SecurityLevel;
                  setFlagChange({
                    key: "level",
                    value,
                    title: "Change the default security level?",
                    description: `Future uploads will default to L${value}. Existing documents are unaffected; their levels only change individually.`,
                    confirmLabel: "Change default",
                  });
                }}
              >
                <option value="1">L1</option>
                <option value="2">L2</option>
                <option value="3">L3</option>
              </Select>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Applies to future uploads only
          </p>
        </div>

        <div className="border-b border-slate-100 p-4 xl:border-b-0 xl:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            L3 downloads
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
              <ShieldCheck
                className={cn(
                  "h-3.5 w-3.5",
                  caseItem.allow_l3_download
                    ? "text-emerald-500"
                    : "text-amber-500",
                )}
                aria-hidden
              />
              {caseItem.allow_l3_download ? "Allowed" : "View-only"}
            </span>
            {isAdmin && !archived ? (
              <Select
                aria-label="Change L3 download policy"
                className="h-7 w-24 text-[11px]"
                value={caseItem.allow_l3_download ? "allowed" : "view"}
                onChange={(event) => {
                  const allowed = event.target.value === "allowed";
                  setFlagChange({
                    key: "l3",
                    value: allowed,
                    title: allowed
                      ? "Allow L3 downloads?"
                      : "Make L3 documents view-only?",
                    description: allowed
                      ? "L3 documents in this case become downloadable with the mandatory watermark. The change is audited."
                      : "Downloads of L3 documents will be blocked and logged. Viewing remains available with the mandatory watermark.",
                    confirmLabel: allowed ? "Allow downloads" : "Make view-only",
                  });
                }}
              >
                <option value="allowed">Allowed</option>
                <option value="view">View-only</option>
              </Select>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Per-case maximum-level policy
          </p>
        </div>

        <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Legal hold
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[12px] font-medium text-slate-700">
              {caseItem.legal_hold ? "On" : "Off"}
            </span>
            {isAdmin && !archived ? (
              <Select
                aria-label="Change legal hold"
                className="h-7 w-24 text-[11px]"
                value={caseItem.legal_hold ? "on" : "off"}
                onChange={(event) => {
                  const hold = event.target.value === "on";
                  setFlagChange({
                    key: "hold",
                    value: hold,
                    title: hold
                      ? "Place this case under legal hold?"
                      : "Release the legal hold?",
                    description: hold
                      ? "Retention sweeps will skip documents in this case until the hold is released. Access rules are unchanged."
                      : "Retention rules will apply to this case again. The change is audited.",
                    confirmLabel: hold ? "Enable hold" : "Release hold",
                  });
                }}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </Select>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Overrides retention sweeps
          </p>
        </div>

        <div className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Watermark
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
            <LockKeyhole className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            Mandatory L2 / L3
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Viewer name + UTC timestamp
          </p>
        </div>
      </div>

      <Tabs defaultValue="documents">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
              <TabsTrigger
                value="documents"
                className="min-w-0 px-1.5 text-[11px] sm:px-3 sm:text-[13px]"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden />
                Documents
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  {documents.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="members"
                className="min-w-0 px-1.5 text-[11px] sm:px-3 sm:text-[13px]"
              >
                <Users className="h-3.5 w-3.5" aria-hidden />
                Members
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  {members.length}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="transfers"
                className="min-w-0 px-1.5 text-[11px] sm:px-3 sm:text-[13px]"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                Transfers
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  {transfers.length}
                </span>
              </TabsTrigger>
            </TabsList>
            <p className="text-[10px] text-slate-400">
              Signed URLs · TTL 60s · watermarked
            </p>
          </div>

          <div className="p-4 sm:p-5">
            <TabsContent value="documents" className="mt-0">
              <DocumentsPanel
                caseItem={caseItem}
                documents={documents}
                uploaderNames={uploaderNames}
                user={user}
                canUpload={canUpload}
              />
            </TabsContent>
            <TabsContent value="members" className="mt-0">
              <MembersPanel
                caseItem={caseItem}
                members={members}
                firmMembers={firmMembers}
                user={user}
                canManage={isAdmin}
              />
            </TabsContent>
            <TabsContent value="transfers" className="mt-0">
              <CaseTransfersPanel caseItem={caseItem} transfers={transfers} />
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <p className="flex items-center justify-between px-1 text-[10px] text-slate-400">
        <span>Last activity {formatDateTime(documents[0]?.uploaded_at ?? caseItem.created_at)}</span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          Audit chain live
        </span>
      </p>

      {isAdmin && (
        <EditCaseDialog
          caseItem={caseItem}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}

      <ConfirmDialog
        open={caseAction !== null}
        onOpenChange={(open) => {
          if (!open) setCaseAction(null);
        }}
        title={caseAction ? caseActionCopy[caseAction].title : ""}
        description={caseAction ? caseActionCopy[caseAction].description : ""}
        confirmLabel={
          caseAction ? caseActionCopy[caseAction].confirmLabel : "Confirm"
        }
        destructive={caseAction ? caseActionCopy[caseAction].destructive : false}
        onConfirm={runCaseAction}
      />

      <ConfirmDialog
        open={flagChange !== null}
        onOpenChange={(open) => {
          if (!open) setFlagChange(null);
        }}
        title={flagChange?.title ?? ""}
        description={flagChange?.description ?? ""}
        confirmLabel={flagChange?.confirmLabel ?? "Confirm"}
        onConfirm={runFlagChange}
      />
      {pending && <span className="sr-only">Applying change…</span>}
    </div>
  );
}
