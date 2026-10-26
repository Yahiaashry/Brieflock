import type { Metadata } from "next";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  LockKeyhole,
  Search,
  SearchX,
  ShieldCheck,
} from "lucide-react";
import type { CaseRecord, CaseStatus, DocumentRecord } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { LevelBadge } from "@/components/level-badge";
import { PageHeader } from "@/components/page-header";
import { ScanChip } from "@/components/scan-chip";
import { StatusChip } from "@/components/status-chip";
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
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Search" };

type SearchParams = Promise<{ q?: string | string[] }>;

type SearchDocument = Pick<
  DocumentRecord,
  | "id"
  | "case_id"
  | "filename"
  | "security_level"
  | "description"
  | "uploaded_at"
  | "size_bytes"
  | "scan_status"
> & {
  case_title: string;
  case_reference: string;
  uploader_name: string;
};

type SearchCase = Pick<
  CaseRecord,
  "id" | "title" | "case_reference" | "default_security_level" | "status"
>;

const suggestions = ["Dolan", "settlement", "KB-2026", "Meridian"];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { profile } = await requireServerProfile();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim() : "";
  const results = query
    ? await serverApi<{ documents: SearchDocument[]; cases: SearchCase[] }>(
        `/search?q=${encodeURIComponent(query)}`,
      )
    : { documents: [], cases: [] };
  const total = results.documents.length + results.cases.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        description="Find cases and documents across everything available to your account."
      />

      <form action="/search" method="get" className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Search case titles, references, filenames and descriptions."
          autoFocus
          className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-28 text-[13px] text-slate-800 shadow-xs outline-none transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/15"
          aria-label="Search cases and documents"
        />
        <Button
          type="submit"
          size="sm"
          className="absolute right-1.5 top-1/2 -translate-y-1/2"
        >
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Try
          </span>
          {suggestions.map((suggestion) => (
            <Link
              key={suggestion}
              href={`/search?q=${encodeURIComponent(suggestion)}`}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500 transition-colors hover:border-indigo-200 hover:text-indigo-700"
            >
              {suggestion}
            </Link>
          ))}
        </div>
        <p className="inline-flex items-center gap-1.5 text-[10px] text-slate-400">
          <ShieldCheck className="h-3 w-3" aria-hidden />
          {profile.role === "firm_admin"
            ? "Scoped to your firm and shared external cases"
            : `Scoped to your cases and exact clearance L${profile.clearance_level}`}
        </p>
      </div>

      {!query ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Search className="h-5 w-5" aria-hidden />
          </div>
          <p className="mt-4 text-[14px] font-semibold text-slate-800">
            Search your accessible work
          </p>
          <p className="mt-1 max-w-md text-[11px] leading-5 text-slate-500">
            {profile.role === "firm_admin"
              ? "Results include every case in your firm and shared external cases. Firm administrators see document metadata for oversight, but opening content still requires exact clearance."
              : "Results include cases you belong to and documents whose security level exactly matches your clearance. Documents you cannot access never appear in results."}
          </p>
        </div>
      ) : total === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <EmptyState
            icon={SearchX}
            title={`No results for "${query}"`}
            description="Try a shorter term, a case reference, or part of a filename. Inaccessible documents are not included."
          />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-[11px] text-slate-400">
            {total} result{total === 1 ? "" : "s"} for{" "}
            <span className="font-medium text-slate-600">&quot;{query}&quot;</span>
          </p>

          {results.cases.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-[12px] font-semibold text-slate-800">
                  Cases
                </p>
                <span className="text-[10px] text-slate-400">
                  {results.cases.length}
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {results.cases.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/cases/${item.id}`}
                      className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400">
                        <FileText className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[12px] font-medium text-slate-800 group-hover:text-indigo-700">
                            {item.title}
                          </span>
                          <LevelBadge level={item.default_security_level} />
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                          <span className="font-mono">
                            {item.case_reference}
                          </span>
                          <StatusChip
                            status={item.status as CaseStatus}
                            className="px-1 py-0 text-[9px]"
                          />
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {results.documents.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p className="text-[12px] font-semibold text-slate-800">
                  Documents
                </p>
                <span className="text-[10px] text-slate-400">
                  {results.documents.length}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[42%]">Document</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Scan</TableHead>
                    <TableHead className="hidden md:table-cell">Case</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Uploaded by
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">Size</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.documents.map((document) => {
                    const clean = document.scan_status === "clean";
                    const exactClearance =
                      document.security_level === profile.clearance_level;
                    const openable = clean && exactClearance;
                    return (
                      <TableRow key={document.id}>
                        <TableCell>
                          {openable ? (
                            <Link
                              href={`/cases/${document.case_id}/documents/${document.id}`}
                              className="flex items-center gap-2.5 hover:text-indigo-700"
                            >
                              <FileText
                                className="h-4 w-4 shrink-0 text-slate-400"
                                aria-hidden
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] font-medium text-slate-800">
                                  {document.filename}
                                </span>
                                {document.description && (
                                  <span className="block truncate text-[10px] text-slate-400">
                                    {document.description}
                                  </span>
                                )}
                              </span>
                            </Link>
                          ) : (
                            <div className="flex items-center gap-2.5">
                              <LockKeyhole
                                className="h-4 w-4 shrink-0 text-slate-300"
                                aria-hidden
                              />
                              <span className="min-w-0">
                                <span className="block truncate text-[12px] font-medium text-slate-500">
                                  {document.filename}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  {clean
                                    ? `Requires L${document.security_level} clearance`
                                    : "Unavailable until the scan is clean"}
                                </span>
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <LevelBadge level={document.security_level} />
                        </TableCell>
                        <TableCell>
                          <ScanChip status={document.scan_status} />
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <Link
                            href={`/cases/${document.case_id}`}
                            className="block max-w-[170px] truncate text-[11px] text-slate-600 hover:text-indigo-700"
                          >
                            {document.case_title}
                          </Link>
                          <span className="font-mono text-[9px] text-slate-400">
                            {document.case_reference}
                          </span>
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-500 lg:table-cell">
                          {document.uploader_name}
                        </TableCell>
                        <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 sm:table-cell">
                          {formatBytes(document.size_bytes)}
                          <span className="block text-[9px]">
                            {formatDateTime(document.uploaded_at)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}