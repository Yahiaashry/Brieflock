import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  Clock,
  FileText,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { TransferWithMeta } from "@/lib/types";
import { formatBytes, formatDateTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LevelBadge } from "@/components/level-badge";
import { ScanChip } from "@/components/scan-chip";
import { StatusChip } from "@/components/status-chip";
import { TransferActions } from "@/components/transfers/transfer-actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type { CaseRecord, DocumentRecord } from "@/lib/types";

type Params = { params: Promise<{ transferId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { transferId } = await params;
  try {
    const transfer = await serverApi<TransferWithMeta>(
      `/transfers/${transferId}`,
    );
    return { title: `Transfer ${transfer.case_reference}` };
  } catch {
    return { title: "Transfer" };
  }
}

function timelineFor(transfer: TransferWithMeta) {
  const entries: { label: string; at: string | null; done: boolean }[] = [
    { label: "Draft created", at: transfer.created_at, done: true },
  ];
  if (transfer.sent_at) {
    entries.push({ label: "Sent to receiving firm", at: transfer.sent_at, done: true });
  }
  if (transfer.status === "accepted") {
    entries.push({ label: "Accepted", at: transfer.responded_at, done: true });
  } else if (transfer.status === "rejected") {
    entries.push({ label: "Rejected", at: transfer.responded_at, done: true });
  } else if (transfer.status === "revoked") {
    entries.push({ label: "Accepted", at: transfer.responded_at, done: true });
    entries.push({ label: "Access revoked", at: null, done: true });
  } else if (transfer.status === "cancelled") {
    entries.push({ label: "Withdrawn by sender", at: null, done: true });
  } else if (transfer.status === "sent") {
    entries.push({
      label: "Awaiting recipient response",
      at: null,
      done: false,
    });
  } else {
    entries.push({ label: "Not sent yet", at: null, done: false });
  }
  return entries;
}

export default async function TransferDetailPage({ params }: Params) {
  const { transferId } = await params;
  const { profile: user } = await requireServerProfile();

  let transfer: TransferWithMeta;
  try {
    transfer = await serverApi<TransferWithMeta>(`/transfers/${transferId}`);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) notFound();
    throw error;
  }

  const outgoing = transfer.from_firm_id === user.firm_id;
  const incoming = transfer.to_firm_id === user.firm_id;

  let caseItem: CaseRecord | null = null;
  let visibleIds = new Set<string>();
  try {
    caseItem = await serverApi<CaseRecord>(`/cases/${transfer.case_id}`);
    const visible = await serverApi<{ data: Pick<DocumentRecord, "id">[] }>(
      `/cases/${transfer.case_id}/documents?scope=mine&limit=100`,
    );
    visibleIds = new Set(visible.data.map((document) => document.id));
  } catch {
    caseItem = null;
  }

  const senderName = transfer.created_by_name;
  const timeline = timelineFor(transfer);
  const matchingItems = transfer.items.filter((item) =>
    visibleIds.has(item.id),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
        <Link href="/transfers" className="transition-colors hover:text-slate-600">
          Transfers
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden />
        <span className="font-mono text-slate-500">
          Transfer {transfer.case_reference}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
              Transfer · {transfer.case_reference}
            </h1>
            <StatusChip status={transfer.status} />
            <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
              {outgoing ? "Outgoing" : incoming ? "Incoming" : "Transfer"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              {transfer.from_firm_name}
              <ArrowLeftRight className="h-3 w-3" aria-hidden />
              {transfer.to_firm_name}
            </span>
            {caseItem ? (
              <Link
                href={`/cases/${caseItem.id}`}
                className="font-mono text-slate-500 hover:text-indigo-700"
              >
                {transfer.case_reference}
              </Link>
            ) : (
              <span className="font-mono text-slate-500">
                {transfer.case_reference}
              </span>
            )}
            <span>
              {transfer.sent_at
                ? `Sent ${formatDateTime(transfer.sent_at)}`
                : `Created ${formatDateTime(transfer.created_at)}`}
            </span>
          </div>
        </div>
        <TransferActions transfer={transfer} user={user} />
      </div>

      {incoming && transfer.status === "sent" && (
        <div className="flex items-start gap-2.5 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
          <div>
            <p className="text-[12px] font-medium text-indigo-900">
              Your response is required.
            </p>
            <p className="text-[11px] leading-5 text-indigo-700">
              Review the documents below. Accepting grants external case access
              for the selected documents that exactly match your clearance.
            </p>
          </div>
        </div>
      )}

      {incoming && transfer.status === "accepted" && (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
              aria-hidden
            />
            <div>
              <p className="text-[12px] font-medium text-emerald-900">
                Access granted.
              </p>
              <p className="text-[11px] leading-5 text-emerald-700">
                {matchingItems} of {transfer.items.length} transferred document
                {transfer.items.length === 1 ? "" : "s"} match your clearance
                and are available in the case.
              </p>
            </div>
          </div>
          {caseItem && (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/cases/${caseItem.id}`}>Open case</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-slate-800">
                  Documents in this transfer
                </p>
                <p className="text-[10px] text-slate-400">
                  {transfer.items.length} file
                  {transfer.items.length === 1 ? "" : "s"} · access follows
                  exact-match clearance
                </p>
              </div>
              {caseItem && (
                <Link
                  href={`/cases/${caseItem.id}`}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                >
                  View case
                </Link>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[46%]">Document</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Scan</TableHead>
                  <TableHead className="hidden sm:table-cell">Size</TableHead>
                  <TableHead className="w-20">Access</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfer.items.map((document) => {
                  const visible = visibleIds.has(document.id);
                  return (
                    <TableRow key={document.id}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                              visible
                                ? "border-slate-200 bg-slate-50 text-slate-400"
                                : "border-slate-200 bg-slate-50 text-slate-300",
                            )}
                          >
                            {visible ? (
                              <FileText className="h-3.5 w-3.5" aria-hidden />
                            ) : (
                              <LockKeyhole
                                className="h-3.5 w-3.5"
                                aria-hidden
                              />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[12px] font-medium text-slate-800">
                              {document.filename}
                            </p>
                            {document.description && (
                              <p className="truncate text-[10px] text-slate-400">
                                {document.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <LevelBadge level={document.security_level} />
                      </TableCell>
                      <TableCell>
                        <ScanChip status={document.scan_status} />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 sm:table-cell">
                        {formatBytes(document.size_bytes)}
                      </TableCell>
                      <TableCell>
                        {visible ? (
                          <Link
                            href={`/cases/${transfer.case_id}/documents/${document.id}`}
                            className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            Open
                          </Link>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                            <LockKeyhole className="h-3 w-3" aria-hidden />
                            Restricted
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800">
              <MessageSquare className="h-3.5 w-3.5 text-slate-400" aria-hidden />
              Message
            </p>
            {transfer.message ? (
              <p className="mt-2 whitespace-pre-wrap text-[12px] leading-6 text-slate-600">
                {transfer.message}
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-slate-400">
                No message was included with this transfer.
              </p>
            )}
          </div>

          <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-5 text-slate-500 shadow-xs">
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500"
              aria-hidden
            />
            A transfer never overrides document levels. Recipients see only
            transferred documents whose level exactly matches their clearance,
            and access can be revoked at any time by the sending firm.
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Timeline
            </p>
            <ol className="mt-3 space-y-3">
              {timeline.map((entry, index) => (
                <li key={`${entry.label}-${index}`} className="flex gap-2.5">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      entry.done
                        ? "border-indigo-200 bg-indigo-50 text-indigo-600"
                        : "border-slate-200 bg-white text-slate-300",
                    )}
                  >
                    {entry.done ? (
                      <Check className="h-3 w-3" aria-hidden />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[11px] font-medium",
                        entry.done ? "text-slate-700" : "text-slate-400",
                      )}
                    >
                      {entry.label}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {entry.at ? formatDateTime(entry.at) : "Pending"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <Users className="h-3 w-3" aria-hidden />
              Recipients
            </p>
            <ul className="mt-3 space-y-2.5">
              {transfer.recipients.map((recipient) => (
                <li key={recipient.id} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[9px] font-semibold text-slate-600">
                    {initials(recipient.full_name)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-slate-700">
                      {recipient.full_name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {recipient.email}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Details
            </p>
            <dl className="mt-3 space-y-2.5 text-[11px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">Case</dt>
                <dd className="max-w-[190px] truncate text-right font-medium text-slate-700">
                  {transfer.case_title}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">From</dt>
                <dd className="max-w-[190px] truncate text-right text-slate-600">
                  {transfer.from_firm_name}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">To</dt>
                <dd className="max-w-[190px] truncate text-right text-slate-600">
                  {transfer.to_firm_name}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">Sender</dt>
                <dd className="max-w-[190px] truncate text-right text-slate-600">
                  {senderName}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">Sent</dt>
                <dd className="text-right text-slate-600">
                  {formatDateTime(transfer.sent_at)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-slate-400">Responded</dt>
                <dd className="text-right text-slate-600">
                  {formatDateTime(transfer.responded_at)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
