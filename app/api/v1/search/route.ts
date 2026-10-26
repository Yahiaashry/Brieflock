import { authenticate, requireActiveProfile } from "@/lib/auth";
import { acceptedTransferDocumentIds } from "@/lib/access/transfers";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type {
  CaseRecord,
  DocumentRecord,
  Profile,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocumentSearchRow = Pick<
  DocumentRecord,
  | "id"
  | "case_id"
  | "firm_id"
  | "filename"
  | "security_level"
  | "description"
  | "uploaded_at"
  | "uploaded_by"
  | "size_bytes"
  | "scan_status"
>;

type CaseSearchRow = Pick<
  CaseRecord,
  | "id"
  | "firm_id"
  | "title"
  | "case_reference"
  | "default_security_level"
  | "status"
>;

async function acceptedDocumentIdsForCases(
  supabase: Parameters<typeof acceptedTransferDocumentIds>[0],
  profile: Profile,
  caseIds: string[],
) {
  const map = new Map<string, Set<string>>();
  await Promise.all(
    caseIds.map(async (caseId) => {
      map.set(
        caseId,
        await acceptedTransferDocumentIds(supabase, profile, caseId),
      );
    }),
  );
  return map;
}

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const params = new URL(request.url).searchParams;
    const rawQuery = (params.get("q") ?? "").trim();
    if (rawQuery.length === 0 || rawQuery.length > 200) {
      throw ApiError.validation("q must be between 1 and 200 characters.");
    }
    const query = rawQuery.toLowerCase();
    const level = params.get("level");
    if (level && !["1", "2", "3"].includes(level)) {
      throw ApiError.validation("level must be 1, 2, or 3.");
    }

    const caseIdFilter = params.get("case_id");
    const from = params.get("from");
    const to = params.get("to");

    const { data: memberships, error: membershipsError } = await auth.supabase
      .from("case_members")
      .select("case_id")
      .eq("user_id", profile.id);
    if (membershipsError) throw new Error("Unable to load search case scope.");

    const accessibleIds = new Set(
      (memberships ?? []).map((row) => row.case_id),
    );

    if (profile.role === "firm_admin") {
      const { data: ownFirmCases, error: firmCasesError } = await auth.supabase
        .from("cases")
        .select("id")
        .eq("firm_id", profile.firm_id);
      if (firmCasesError) throw new Error("Unable to load search case scope.");
      for (const caseRecord of ownFirmCases ?? []) {
        accessibleIds.add(caseRecord.id);
      }
    }

    let accessibleCaseIds = [...accessibleIds];
    if (caseIdFilter) {
      accessibleCaseIds = accessibleCaseIds.filter(
        (id) => id === caseIdFilter,
      );
    }
    if (accessibleCaseIds.length === 0) {
      return jsonResponse(
        { documents: [], cases: [], page: { next_cursor: null } },
        request,
      );
    }

    const { data: caseRows, error: casesError } = await auth.supabase
      .from("cases")
      .select(
        "id, title, case_reference, default_security_level, status, firm_id",
      )
      .in("id", accessibleCaseIds)
      .returns<CaseSearchRow[]>();

    if (casesError) throw new Error("Unable to search cases.");

    const matchingCases = (caseRows ?? []).filter(
      (caseRecord) =>
        caseRecord.title.toLowerCase().includes(query) ||
        caseRecord.case_reference.toLowerCase().includes(query),
    );

    const caseIds = (caseRows ?? []).map((item) => item.id);
    if (caseIds.length === 0) {
      return jsonResponse(
        { documents: [], cases: [], page: { next_cursor: null } },
        request,
      );
    }

    let documentsQuery = auth.supabase
      .from("documents")
      .select(
        "id, case_id, firm_id, filename, security_level, description, uploaded_at, uploaded_by, size_bytes, scan_status",
      )
      .in("case_id", caseIds)
      .eq("superseded", false);

    if (level) documentsQuery = documentsQuery.eq("security_level", Number(level));
    if (from) documentsQuery = documentsQuery.gte("uploaded_at", from);
    if (to) documentsQuery = documentsQuery.lte("uploaded_at", to);

    const { data: documentRows, error: documentsError } =
      await documentsQuery.returns<DocumentSearchRow[]>();
    if (documentsError) throw new Error("Unable to search documents.");

    const externalCaseIds = (caseRows ?? [])
      .filter((caseRecord) => caseRecord.firm_id !== profile.firm_id)
      .map((caseRecord) => caseRecord.id);
    const acceptedMap =
      externalCaseIds.length > 0
        ? await acceptedDocumentIdsForCases(
            auth.supabase,
            profile,
            externalCaseIds,
          )
        : new Map<string, Set<string>>();

    const casesById = new Map(
      (caseRows ?? []).map((caseRecord) => [caseRecord.id, caseRecord]),
    );

    const documents = (documentRows ?? []).filter((document) => {
      const external = document.firm_id !== profile.firm_id;
      if (external) {
        if (!acceptedMap.get(document.case_id)?.has(document.id)) return false;
        if (document.security_level !== profile.clearance_level) return false;
      } else if (
        profile.role !== "firm_admin" &&
        document.security_level !== profile.clearance_level
      ) {
        return false;
      }

      return (
        document.filename.toLowerCase().includes(query) ||
        (document.description ?? "").toLowerCase().includes(query)
      );
    });

    const uploaderIds = [...new Set(documents.map((item) => item.uploaded_by))];
    const { data: uploaders, error: uploadersError } =
      uploaderIds.length === 0
        ? { data: [], error: null }
        : await auth.supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", uploaderIds);
    if (uploadersError) throw new Error("Unable to load document owners.");

    const uploaderNames = new Map(
      ((uploaders ?? []) as Pick<Profile, "id" | "full_name">[]).map(
        (uploader) => [uploader.id, uploader.full_name],
      ),
    );

    return jsonResponse(
      {
        documents: documents.map((document) => ({
          ...document,
          case_title: casesById.get(document.case_id)?.title ?? "",
          case_reference:
            casesById.get(document.case_id)?.case_reference ?? "",
          uploader_name:
            uploaderNames.get(document.uploaded_by) ?? "Unknown member",
        })),
        cases: matchingCases,
        page: { next_cursor: null },
      },
      request,
    );
  });
}