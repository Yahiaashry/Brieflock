import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { AccessDeniedInterstitial } from "@/components/access-denied-interstitial";
import { LevelBadge } from "@/components/level-badge";
import { ScanChip } from "@/components/scan-chip";
import { DocumentViewer } from "@/components/viewer/document-viewer";
import { DownloadDocumentButton } from "@/components/viewer/download-document-button";
import { Button } from "@/components/ui/button";
import { formatBytes, formatDateTime } from "@/lib/format";
import { requireServerProfile } from "@/lib/auth/server";
import { serverApi, ApiClientError } from "@/lib/api/server";
import type {
  CaseWithMeta,
  DocumentRecord,
} from "@/lib/types";

type Params = {
  params: Promise<{ caseId: string; documentId: string }>;
};

interface ContentAuthorization {
  signed_url: string;
  expires_at: string;
  ttl_seconds: number;
  disposition: "view" | "download";
  document_id: string;
  watermark: { required: boolean; viewer_name: string; issued_at: string };
}

export async function generateMetadata({
  params,
}: Params): Promise<Metadata> {
  const { caseId, documentId } = await params;
  try {
    const document = await serverApi<DocumentRecord>(
      `/documents/${documentId}`,
    );
    return { title: document.case_id === caseId ? document.filename : "Secure document" };
  } catch {
    return { title: "Secure document" };
  }
}

export default async function DocumentViewerPage({ params }: Params) {
  const { caseId, documentId } = await params;
  await requireServerProfile();

  let authorization: ContentAuthorization;
  try {
    authorization = await serverApi<ContentAuthorization>(
      `/documents/${documentId}/content?disposition=view`,
    );
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.status === 404) notFound();
      if (error.status === 403 || error.status === 429) {
        return (
          <AccessDeniedInterstitial
            code={
              error.code === "DOWNLOAD_BLOCKED_L3"
                ? "DOWNLOAD_BLOCKED_L3"
                : error.status === 429
                  ? "RATE_LIMITED"
                  : "ACCESS_DENIED"
            }
            backHref={`/cases/${caseId}`}
            backLabel="Back to case"
          />
        );
      }
    }
    throw error;
  }

  const [document, caseItem] = await Promise.all([
    serverApi<DocumentRecord>(`/documents/${documentId}`),
    serverApi<CaseWithMeta>(`/cases/${caseId}`),
  ]);

  if (document.case_id !== caseId) notFound();

  const uploader =
    caseItem.members.find((member) => member.user_id === document.uploaded_by)
      ?.profile.full_name ?? "Unknown member";
  const blockedL3 =
    document.security_level === 3 && !caseItem.allow_l3_download;
  const watermark = {
    required: authorization.watermark.required,
    viewer_name: authorization.watermark.viewer_name,
    issued_at: authorization.watermark.issued_at,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
        <Link href="/cases" className="transition-colors hover:text-slate-600">
          Cases
        </Link>
        <span aria-hidden>/</span>
        <Link
          href={`/cases/${caseItem.id}`}
          className="max-w-[220px] truncate transition-colors hover:text-slate-600"
        >
          {caseItem.title}
        </Link>
        <span aria-hidden>/</span>
        <span className="max-w-[260px] truncate font-medium text-slate-500">
          {document.filename}
        </span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 shadow-xs">
            <FileText className="h-4.5 w-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="max-w-[72vw] truncate text-[20px] font-semibold tracking-tight text-slate-900">
                {document.filename}
              </h1>
              <LevelBadge level={document.security_level} showName />
              <ScanChip status={document.scan_status} />
              {blockedL3 && (
                <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  <LockKeyhole className="h-3 w-3" aria-hidden />
                  View-only
                </span>
              )}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="font-mono text-slate-500">
                {caseItem.case_reference}
              </span>
              <span>Uploaded by {uploader}</span>
              <span>{formatDateTime(document.uploaded_at)}</span>
              <span>{formatBytes(document.size_bytes)}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/cases/${caseItem.id}`}>
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Back to case
            </Link>
          </Button>
          <DownloadDocumentButton
            documentId={document.id}
            filename={document.filename}
            blocked={blockedL3}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0b1020] shadow-xl">
        <div className="flex flex-col gap-2 border-b border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-300" aria-hidden />
              Secure viewer
            </span>
            <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-slate-400">
              Sandboxed
            </span>
            <span className="rounded border border-indigo-400/20 bg-indigo-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-indigo-200">
              Watermark {watermark.required ? "on" : "off"}
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
            <span>
              {watermark.required
                ? `Watermark · ${watermark.viewer_name} · ${formatDateTime(watermark.issued_at)}`
                : "L1 view · optional watermark"}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3 w-3" aria-hidden />
              URL TTL 60s
            </span>
          </p>
        </div>
        <DocumentViewer
          filename={document.filename}
          fileUrl={authorization.signed_url}
          level={document.security_level}
          watermark={{
            required: watermark.required,
            name: watermark.viewer_name,
            issued: watermark.issued_at,
          }}
          className="h-[calc(100dvh-20rem)] min-h-[480px]"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
            Audited before release
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            This view was written to the audit trail before the document was
            released to the viewer.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
            <LockKeyhole className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
            Exact-match access
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            You can see this file because it is exactly L
            {document.security_level}, matching your clearance and case
            membership.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700">
            <FileText className="h-3.5 w-3.5 text-slate-400" aria-hidden />
            Watermark policy
          </p>
          <p className="mt-1 text-[10px] leading-4 text-slate-400">
            {watermark.required
              ? "Every page carries your name and the UTC issue time. Screenshots retain the watermark."
              : "L1 views are not watermarked unless your firm enables it in settings."}
          </p>
        </div>
      </div>
    </div>
  );
}
