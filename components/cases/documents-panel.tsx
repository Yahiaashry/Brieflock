"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Eye,
  FileText,
  LockKeyhole,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { requestDownloadAction } from "@/app/(app)/cases/[caseId]/documents/[documentId]/actions";
import type { CaseRecord, DocumentRecord, Profile } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LevelBadge } from "@/components/level-badge";
import { ScanChip } from "@/components/scan-chip";
import { EmptyState } from "@/components/empty-state";
import { UploadModal } from "@/components/cases/upload-modal";
import { ChangeLevelDialog } from "@/components/cases/change-level-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";

export function DocumentsPanel({
  caseItem,
  documents,
  uploaderNames,
  user,
  canUpload,
}: {
  caseItem: CaseRecord;
  documents: DocumentRecord[];
  uploaderNames: Record<string, string>;
  user: Profile;
  canUpload: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [scan, setScan] = React.useState("all");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [levelTarget, setLevelTarget] = React.useState<DocumentRecord | null>(
    null,
  );
  const [levelDirection, setLevelDirection] = React.useState<"raise" | "lower">(
    "raise",
  );
  const router = useRouter();
  const { toast } = useToast();

  const archived = caseItem.status === "archived";
  const isAdmin = user.role === "firm_admin" && caseItem.firm_id === user.firm_id;

  const filtered = documents.filter((document) => {
    const needle = query.trim().toLowerCase();
    if (
      needle &&
      !document.filename.toLowerCase().includes(needle) &&
      !(document.description ?? "").toLowerCase().includes(needle)
    ) {
      return false;
    }
    if (scan !== "all" && document.scan_status !== scan) return false;
    return true;
  });

  function openLevel(document: DocumentRecord, direction: "raise" | "lower") {
    setLevelTarget(document);
    setLevelDirection(direction);
  }

  async function download(document: DocumentRecord) {
    if (document.scan_status !== "clean") return;
    const result = await requestDownloadAction(document.id);
    if (!result.ok) {
      toast({
        title:
          result.code === "DOWNLOAD_BLOCKED_L3"
            ? "Downloads are disabled"
            : "Download denied",
        description:
          result.code === "DOWNLOAD_BLOCKED_L3"
            ? "L3 documents in this case are view-only. The attempt was audited."
            : "Your access could not be confirmed. The attempt was audited.",
        variant: "error",
      });
      return;
    }
    toast({
      title: "Download started",
      description:
        "document.downloaded was written to the audit log before the URL was issued.",
      variant: "success",
    });
    const anchor = window.document.createElement("a");
    anchor.href = result.url;
    anchor.download = document.filename;
    anchor.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter documents"
              aria-label="Filter documents"
              className="h-8 w-full pl-8 text-[12px] sm:w-60"
            />
          </div>
          <Select
            value={scan}
            onChange={(event) => setScan(event.target.value)}
            aria-label="Filter by scan status"
            className="h-8 w-full text-[12px] sm:w-36"
          >
            <option value="all">All scans</option>
            <option value="clean">Clean</option>
            <option value="pending">Scanning</option>
            <option value="infected">Quarantined</option>
            <option value="error">Scan failed</option>
          </Select>
          {(query || scan !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[12px]"
              onClick={() => {
                setQuery("");
                setScan("all");
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setUploadOpen(true)}
          disabled={!canUpload}
          title={
            !canUpload
              ? archived
                ? "Archived cases are read-only"
                : "External members cannot upload"
              : undefined
          }
        >
          <Upload className="h-3.5 w-3.5" aria-hidden />
          Upload document
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents in view"
            description={
              query || scan !== "all"
                ? "No documents match the current filters."
                : isAdmin
                  ? "No documents exist in this case."
                  : `No L${user.clearance_level} documents exist in this case. Documents at other levels are absent by design.`
            }
            action={
              !query && scan === "all" && canUpload ? (
                <Button size="sm" onClick={() => setUploadOpen(true)}>
                  <Upload className="h-3.5 w-3.5" aria-hidden />
                  Upload the first document
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[32%]">Document</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Scan</TableHead>
                <TableHead className="hidden sm:table-cell">Size</TableHead>
                <TableHead className="hidden md:table-cell">
                  Uploaded by
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  Uploaded
                </TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((document) => {
                const locked =
                  document.scan_status === "infected" ||
                  document.scan_status === "pending" ||
                  document.scan_status === "error";
                const exactClearance =
                  document.security_level === user.clearance_level;
                const l3ViewOnly =
                  document.security_level === 3 && !caseItem.allow_l3_download;
                return (
                  <TableRow
                    key={document.id}
                    className={cn(
                      document.scan_status === "infected" &&
                        "bg-rose-50/40 hover:bg-rose-50/60",
                    )}
                  >
                    <TableCell>
                      <div className="flex items-start gap-2.5">
                        <span
                          className={cn(
                            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                            document.scan_status === "infected"
                              ? "border-rose-200 bg-rose-100 text-rose-600"
                              : "border-slate-200 bg-slate-50 text-slate-400",
                          )}
                        >
                          {locked ? (
                            <LockKeyhole className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <FileText className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-slate-800">
                            {document.filename}
                          </p>
                          {document.description && (
                            <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-400">
                              {document.description}
                            </p>
                          )}
                          {document.scan_status === "infected" && (
                            <p className="mt-0.5 text-[10px] font-medium text-rose-600">
                              Quarantined — failed the malware scan
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
                    <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-500 sm:table-cell">
                      {formatBytes(document.size_bytes)}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-500 md:table-cell">
                      {uploaderNames[document.uploaded_by] ?? "Unknown"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-[11px] text-slate-400 lg:table-cell">
                      {formatDateTime(document.uploaded_at)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${document.filename}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuLabel>Document</DropdownMenuLabel>
                          {document.scan_status === "clean" &&
                          exactClearance ? (
                            <>
                              <DropdownMenuItem asChild>
                                <Link
                                  href={`/cases/${caseItem.id}/documents/${document.id}`}
                                  className="cursor-pointer"
                                >
                                  <Eye className="h-4 w-4" />
                                  Open secure viewer
                                </Link>
                              </DropdownMenuItem>
                              {!l3ViewOnly && (
                                <DropdownMenuItem
                                  onSelect={() => download(document)}
                                >
                                  <Download className="h-4 w-4" />
                                  Download PDF
                                </DropdownMenuItem>
                              )}
                            </>
                          ) : document.scan_status === "clean" ? (
                            <DropdownMenuItem disabled>
                              <LockKeyhole className="h-4 w-4" />
                              Requires L{document.security_level} clearance
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem disabled>
                              <LockKeyhole className="h-4 w-4" />
                              Unavailable until clean
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          {document.uploaded_by === user.id &&
                            document.security_level < 3 &&
                            !archived && (
                              <DropdownMenuItem
                                onSelect={() => openLevel(document, "raise")}
                              >
                                <ArrowUp className="h-4 w-4" />
                                Raise security level
                              </DropdownMenuItem>
                            )}
                          {isAdmin &&
                            document.security_level > 1 &&
                            !archived && (
                              <DropdownMenuItem
                                onSelect={() => openLevel(document, "lower")}
                              >
                                <ArrowDown className="h-4 w-4" />
                                Lower security level
                              </DropdownMenuItem>
                            )}
                          <DropdownMenuItem
                            onSelect={() => router.refresh()}
                          >
                            <SlidersHorizontal className="h-4 w-4" />
                            Refresh status
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="flex items-center gap-1.5 px-1 text-[10px] text-slate-400">
        <LockKeyhole className="h-3 w-3" aria-hidden />
        {isAdmin
          ? "Showing all case document metadata. Opening or downloading requires exact clearance."
          : `Showing only documents at exactly L${user.clearance_level}.`}{" "}
        Quarantined documents are never deliverable.
      </p>

      <UploadModal
        caseId={caseItem.id}
        defaultLevel={caseItem.default_security_level}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />
      <ChangeLevelDialog
        document={levelTarget}
        direction={levelDirection}
        open={levelTarget !== null}
        onOpenChange={(open) => {
          if (!open) setLevelTarget(null);
        }}
        isAdmin={isAdmin}
      />
    </div>
  );
}
