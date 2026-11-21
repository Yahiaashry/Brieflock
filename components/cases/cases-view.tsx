"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Briefcase,
  ChevronRight,
  FileCheck2,
  ScanLine,
  Search,
  SearchX,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import type { CaseWithMeta, Profile } from "@/lib/types";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { NewCaseDialog } from "@/components/cases/new-case-dialog";
import { LevelBadge } from "@/components/level-badge";
import { StatusChip } from "@/components/status-chip";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Scope = "mine" | "firm";

const avatarTones = [
  "bg-indigo-100 text-indigo-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-sky-100 text-sky-700",
  "bg-rose-100 text-rose-700",
];

function TeamStack({ members }: { members: CaseWithMeta["members"] }) {
  const visible = members.slice(0, 3);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      <div className="flex -space-x-1.5">
        {visible.map((member, index) => (
          <span
            key={member.user_id}
            title={`${member.profile.full_name}${member.role === "external" ? " · external via transfer" : ""}`}
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[9px] font-semibold",
              avatarTones[index % avatarTones.length],
            )}
          >
            {initials(member.profile.full_name)}
          </span>
        ))}
      </div>
      {overflow > 0 && (
        <span className="ml-1.5 text-[11px] font-medium text-slate-400">
          +{overflow}
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  href?: string;
}) {
  const content = (
    <div className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          tone,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-content">
          {value}
        </p>
        <p className="mt-1 text-xs text-muted">{hint}</p>
      </div>
      {href && (
        <ChevronRight className="ml-auto mt-1 h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5" />
      )}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function CasesView({
  mine,
  firmCases,
  stats,
  user,
}: {
  mine: CaseWithMeta[];
  firmCases: CaseWithMeta[];
  stats: {
    openCases: number;
    visibleDocuments: number;
    pendingScans: number;
    incomingTransfers: number;
  };
  user: Profile;
}) {
  const [scope, setScope] = React.useState<Scope>("mine");
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [level, setLevel] = React.useState("all");
  const router = useRouter();

  const source = scope === "mine" ? mine : firmCases;
  const filtered = source.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (
      needle &&
      !item.title.toLowerCase().includes(needle) &&
      !item.case_reference.toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (status !== "all" && item.status !== status) return false;
    if (level !== "all" && String(item.default_security_level) !== level) {
      return false;
    }
    return true;
  });

  const filtersActive =
    query.trim().length > 0 || status !== "all" || level !== "all";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Firm workspace"
        title="Your matters, at a glance"
        description="Review assigned cases, documents, and incoming transfers."
        actions={<NewCaseDialog />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active cases"
          value={stats.openCases}
          hint="Open matters you belong to"
          icon={Briefcase}
          tone="border-indigo-100 bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Visible document records"
          value={stats.visibleDocuments}
          hint={
            user.role === "firm_admin"
              ? "Firm metadata plus exact-clearance content"
              : `Exact L${user.clearance_level} match only`
          }
          icon={FileCheck2}
          tone="border-emerald-100 bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Pending scans"
          value={stats.pendingScans}
          hint="Quarantined until clean"
          icon={ScanLine}
          tone="border-amber-100 bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Incoming transfers"
          value={stats.incomingTransfers}
          hint="Awaiting your response"
          icon={ArrowLeftRight}
          tone="border-sky-100 bg-sky-50 text-sky-600"
          href="/transfers"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              type="button"
              onClick={() => setScope("mine")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                scope === "mine"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800",
              )}
            >
              <Users className="h-3.5 w-3.5" aria-hidden />
              My cases
              <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                {mine.length}
              </span>
            </button>
            {user.role === "firm_admin" && (
              <button
                type="button"
                onClick={() => setScope("firm")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-all",
                  scope === "firm"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                All firm cases
                <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-500">
                  {firmCases.length}
                </span>
              </button>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title or reference"
                aria-label="Filter cases"
                className="h-8 w-full pl-8 text-[12px] sm:w-56"
              />
            </div>
            <Select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              aria-label="Filter by status"
              className="h-8 w-full text-[12px] sm:w-32"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="archived">Archived</option>
            </Select>
            <Select
              value={level}
              onChange={(event) => setLevel(event.target.value)}
              aria-label="Filter by default level"
              className="h-8 w-full text-[12px] sm:w-32"
            >
              <option value="all">All levels</option>
              <option value="1">L1 · Standard</option>
              <option value="2">L2 · High</option>
              <option value="3">L3 · Maximum</option>
            </Select>
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setLevel("all");
                }}
                className="h-8 text-[12px]"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {scope === "firm" && (
          <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-4 py-2.5 text-[11px] text-indigo-700">
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <strong className="font-semibold">Admin metadata view</strong>
            <span className="text-indigo-600/80">
              — every case is listed, but document contents remain gated by
              your clearance (L{user.clearance_level}).
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          filtersActive ? (
            <EmptyState
              icon={SearchX}
              title="No matching cases"
              description="Try a different search term, status or level filter."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setLevel("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No cases yet"
              description="Create your first case to start inviting members and uploading documents."
              action={<NewCaseDialog />}
            />
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[34%]">Case</TableHead>
                <TableHead>Default level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Team</TableHead>
                <TableHead className="text-right">Docs in view</TableHead>
                <TableHead className="hidden sm:table-cell">
                  Last upload
                </TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className="group cursor-pointer"
                  onClick={() => router.push(`/cases/${item.id}`)}
                >
                  <TableCell>
                    <Link
                      href={`/cases/${item.id}`}
                      className="block min-w-0"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span className="block truncate text-[13px] font-semibold text-slate-900 group-hover:text-indigo-700">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] tracking-wide text-slate-400">
                        {item.case_reference}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <LevelBadge level={item.default_security_level} />
                  </TableCell>
                  <TableCell>
                    <StatusChip status={item.status} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <TeamStack members={item.members} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {item.visible_document_count}
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 sm:table-cell">
                    {formatDate(item.last_upload_at)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight
                      className="h-4 w-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500"
                      aria-hidden
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
        <ShieldCheck className="h-3 w-3" aria-hidden />
        {user.role === "firm_admin"
          ? "Visibility is computed server-side. Firm metadata is visible for oversight; shared external cases show accepted documents only."
          : "Visibility is computed server-side. Documents outside your clearance are never listed, counted or hinted at."}
      </p>
    </div>
  );
}
