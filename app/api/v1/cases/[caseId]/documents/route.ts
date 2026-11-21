import { authenticate, requireActiveProfile } from "@/lib/auth";
import { loadCaseAccess } from "@/lib/access/cases";
import { acceptedTransferDocumentIds } from "@/lib/access/transfers";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DocumentListRow = Pick<
  DocumentRecord,
  | "id"
  | "case_id"
  | "firm_id"
  | "filename"
  | "size_bytes"
  | "sha256"
  | "security_level"
  | "scan_status"
  | "description"
  | "uploaded_by"
  | "uploaded_at"
  | "superseded"
>;

export async function GET(
  request: Request,
  context: { params: Promise<{ caseId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId } = await context.params;
    if (!UUID_RE.test(caseId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const access = await loadCaseAccess(auth.supabase, profile, caseId);
    if (!access) throw ApiError.notFound();

    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") ?? "mine";
    if (scope !== "mine" && scope !== "firm") {
      throw ApiError.validation("scope must be mine or firm.");
    }
    if (scope === "firm" && !access.adminMetadata) {
      throw ApiError.forbidden();
    }

    const levelParam = params.get("level");
    if (levelParam && !["1", "2", "3"].includes(levelParam)) {
      throw ApiError.validation("level must be 1, 2, or 3.");
    }

    const scanStatus = params.get("scan_status");
    const superseded = params.get("superseded") === "true";
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50),
    );

    let documentsQuery = auth.supabase
      .from("documents")
      .select(
        "id, case_id, firm_id, filename, size_bytes, sha256, security_level, scan_status, description, uploaded_by, uploaded_at, superseded",
      )
      .eq("case_id", caseId)
      .eq("superseded", superseded)
      .is("purge_claimed_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(limit);

    if (levelParam) {
      documentsQuery = documentsQuery.eq("security_level", Number(levelParam));
    }
    if (scanStatus) {
      documentsQuery = documentsQuery.eq("scan_status", scanStatus);
    }
    if (scope === "mine") {
      documentsQuery = documentsQuery.eq("security_level", profile.clearance_level);
    }
    if (access.caseRecord.firm_id !== profile.firm_id) {
      const acceptedDocumentIds = await acceptedTransferDocumentIds(
        auth.supabase,
        profile,
        caseId,
      );
      if (acceptedDocumentIds.size === 0) {
        return jsonResponse({ data: [], page: { next_cursor: null } }, request);
      }
      documentsQuery = documentsQuery.in("id", [...acceptedDocumentIds]);
    }

    const { data, error } = await documentsQuery.returns<DocumentListRow[]>();
    if (error) throw new Error("Unable to load documents.");
    const visible = data ?? [];
    const filtered = query
      ? visible.filter(
          (document) =>
            document.filename.toLowerCase().includes(query) ||
            (document.description ?? "").toLowerCase().includes(query),
        )
      : visible;

    return jsonResponse(
      { data: filtered, page: { next_cursor: null } },
      request,
    );
  });
}
