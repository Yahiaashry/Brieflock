"use client";

import * as React from "react";
import {
  Download,
  Filter,
  Loader2,
  LockKeyhole,
  ScrollText,
  Search,
  ShieldCheck,
} from "lucide-react";
import type {
  AuditAction,
  AuditEvent,
  AuditResult,
  CaseRecord,
  Profile,
} from "@/lib/types";
import { formatDateTime, truncateHash } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportAuditAction } from "@/app/(app)/audit/actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const actionLabels: Record<AuditAction, string> = {
  "auth.login_failed": "Login failed",
  "member.added": "Member added",
  "member.removed": "Member removed",
  "member.role_changed": "Member role changed",
  "clearance.changed": "Clearance changed",
  "case.created": "Case created",
  "case.updated": "Case updated",
  "case.closed": "Case closed",
  "case.archived": "Case archived",
  "document.uploaded": "Document uploaded",
  "document.viewed": "Document viewed",
  "document.downloaded": "Document downloaded",
  "document.access_denied": "Access denied",
  "document.level_raised": "Level raised",
  "document.level_lowered": "Level lowered",
  "document.scan_failed": "Scan failed",
  "document.purged": "Document purged",
  "transfer.created": "Transfer created",
  "transfer.sent": "Transfer sent",
  "transfer.accepted": "Transfer accepted",
  "transfer.rejected": "Transfer rejected",
  "transfer.cancelled": "Transfer cancelled",
  "transfer.revoked": "Transfer revoked",
  "firm.updated": "Firm updated",
};

const resultStyles: Record<AuditResult, string> = {
  allow: "border-emerald-200 bg-emerald-50 text-emerald-700",
  deny: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

export function AuditView({
  events,
  actors,
  cases,
}: {
  events: AuditEvent[];
  actors: Pick<Profile, "id" | "full_name">[];
  cases: Pick<CaseRecord, "id" | "title" | "case_reference">[];
}) {
  const [query, setQuery] = React.useState("");
  const [action, setAction] = React.useState("all");
  const [result, setResult] = React.useState("all");
  const [actor, setActor] = React.useState("all");
  const [caseId, setCaseId] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [visible, setVisible] = React.useState(30);
  const [exporting, setExporting] = React.useState(false);
  const { toast } = useToast();

  const actorMap = React.useMemo(
    () => new Map(actors.map((profile) => [profile.id, profile.full_name])),
    [actors],
  );
  const caseMap = React.useMemo(
    () => new Map(cases.map((item) => [item.id, item])),
    [cases],
  );

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return events.filter((event) => {
      if (action !== "all" && event.action !== action) return false;
      if (result !== "all" && event.result !== result) return false;
      if (actor !== "all" && event.actor_user_id !== actor) return false;
      if (caseId !== "all" && event.case_id !== caseId) return false;
      const day = event.occurred_at.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (!needle) return true;
      const haystack = [
        actionLabels[event.action],
        event.action,
        event.deny_reason ?? "",
        actorMap.get(event.actor_user_id ?? "") ?? "",
        event.case_id ? caseMap.get(event.case_id)?.title ?? "" : "",
        event.document_id ?? "",
        event.transfer_id ?? "",
        JSON.stringify(event.details),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [
    events,
    action,
    result,
    actor,
    caseId,
    from,
    to,
    query,
    actorMap,
    caseMap,
  ]);

  const denials = events.filter((event) => event.result === "deny").length;
  const hasFilters =
    Boolean(query) ||
    action !== "all" ||
    result !== "all" ||
    actor !== "all" ||
    caseId !== "all" ||
    Boolean(from) ||
    Boolean(to);

  React.useEffect(() => {
    setVisible(30);
  }, [query, action, result, actor, caseId, from, to]);

  function clearFilters() {
    setQuery("");
    setAction("all");
    setResult("all");
    setActor("all");
    setCaseId("all");
    setFrom("");
    setTo("");
  }

  async function exportNdjson() {
    setExporting(true);
    const result = await exportAuditAction(from || undefined, to || undefined);
    setExporting(false);
    if (!result.ok || result.content === undefined) {
      toast({
        title: "Export failed",
        description: result.error ?? "The audit export could not be created.",
        variant: "error",
      });
      return;
    }
    const blob = new Blob([result.content], {
      type: "application/x-ndjson;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.filename ?? "brieflock-audit.ndjson";
    anchor.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Audit export created",
      description: "The export is recorded in the audit trail.",
      variant: "success",
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Append-only record of access, membership and transfer activity. Every entry is linked into the firm's hash chain."
        actions={
          <Button
            variant="secondary"
            onClick={exportNdjson}
            disabled={exporting || filtered.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Download className="h-4 w-4" aria-hidden />
            )}
            Export NDJSON
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Events
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-slate-900">
            {events.length}
          </p>
          <p className="text-[10px] text-slate-400">Firm-scoped records</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Denials
          </p>
          <p className="mt-1.5 text-[22px] font-semibold tracking-tight text-rose-600">
            {denials}
          </p>
          <p className="text-[10px] text-slate-400">Blocked access attempts</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Chain head
          </p>
          <p className="mt-1.5 font-mono text-[13px] font-semibold text-slate-800">
            #{events[0]?.chain_seq ?? 0}
          </p>
          <p
            className="truncate font-mono text-[10px] text-slate-400"
            title={events[0]?.entry_hash}
          >
            {truncateHash(events[0]?.entry_hash, 18)}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-xs">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            Chain status
          </p>
          <p className="mt-1.5 text-[13px] font-semibold text-emerald-900">
            Linked
          </p>
          <p className="text-[10px] text-emerald-700/70">
            Verified daily at 03:00 UTC
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search actors, reasons, documents…"
              aria-label="Search audit entries"
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
            <Select
              value={action}
              onChange={(event) => setAction(event.target.value)}
              aria-label="Filter by action"
              className="h-8 text-[11px] xl:w-40"
            >
              <option value="all">All actions</option>
              {Object.entries(actionLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <Select
              value={result}
              onChange={(event) => setResult(event.target.value)}
              aria-label="Filter by result"
              className="h-8 text-[11px] xl:w-28"
            >
              <option value="all">All results</option>
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
              <option value="info">Info</option>
            </Select>
            <Select
              value={actor}
              onChange={(event) => setActor(event.target.value)}
              aria-label="Filter by actor"
              className="h-8 text-[11px] xl:w-40"
            >
              <option value="all">All actors</option>
              {actors.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </Select>
            <Select
              value={caseId}
              onChange={(event) => setCaseId(event.target.value)}
              aria-label="Filter by case"
              className="h-8 text-[11px] xl:w-44"
            >
              <option value="all">All cases</option>
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.case_reference}
                </option>
              ))}
            </Select>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              aria-label="From date"
              className="h-8 text-[11px] xl:w-36"
            />
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              aria-label="To date"
              className="h-8 text-[11px] xl:w-36"
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-[11px]"
                onClick={clearFilters}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 px-0.5 text-[10px] text-slate-400">
          <Filter className="h-3 w-3" aria-hidden />
          {filtered.length} matching event{filtered.length === 1 ? "" : "s"} · UTC
          timestamps
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {filtered.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit events match"
            description="Adjust the filters or search term to see more of the firm's activity."
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-40">Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="hidden lg:table-cell">Context</TableHead>
                <TableHead className="hidden xl:table-cell">Location</TableHead>
                <TableHead className="hidden md:table-cell">Chain</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.slice(0, visible).map((event) => {
                const caseItem = event.case_id
                  ? caseMap.get(event.case_id)
                  : null;
                return (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-[11px] text-slate-500">
                      {formatDateTime(event.occurred_at)}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[150px] truncate text-[11px] font-medium text-slate-700">
                        {event.actor_user_id
                          ? actorMap.get(event.actor_user_id) ?? "Unknown"
                          : "System"}
                      </p>
                      {event.deny_reason && (
                        <p className="font-mono text-[9px] text-rose-500">
                          {event.deny_reason}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-[11px] text-slate-700">
                        {actionLabels[event.action]}
                      </p>
                      <p className="font-mono text-[9px] text-slate-400">
                        {event.action}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize",
                          resultStyles[event.result],
                        )}
                      >
                        {event.result}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {caseItem ? (
                        <p className="max-w-[220px] truncate text-[11px] text-slate-600">
                          {caseItem.case_reference}
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400">—</p>
                      )}
                      <p className="max-w-[220px] truncate font-mono text-[9px] text-slate-400">
                        {event.document_id ?? event.transfer_id ?? ""}
                      </p>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <p className="text-[11px] text-slate-500">
                        {[event.city, event.country].filter(Boolean).join(", ") ||
                          "—"}
                      </p>
                      <p
                        className="font-mono text-[9px] text-slate-400"
                        title={event.ip_hash ?? undefined}
                      >
                        {truncateHash(event.ip_hash, 10)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="font-mono text-[10px] text-slate-500">
                        #{event.chain_seq}
                      </p>
                      <p
                        className="font-mono text-[9px] text-slate-400"
                        title={event.entry_hash}
                      >
                        {truncateHash(event.entry_hash, 10)}
                      </p>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        {filtered.length > visible && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-[10px] text-slate-400">
              Showing {visible} of {filtered.length}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVisible((value) => value + 30)}
            >
              Load more
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[10px] leading-5 text-slate-500 shadow-xs">
        <LockKeyhole
          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500"
          aria-hidden
        />
        Audit entries are append-only. The daily verification walks every entry
        from the genesis hash; a broken link raises an integrity alert for firm
        administrators.
      </div>
    </div>
  );
}
