import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { loadCaseMembers } from "@/lib/access/cases";
import { acceptedTransferDocumentIds } from "@/lib/access/transfers";
import { serializeCase } from "@/lib/serializers/cases";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { CaseRecord, SecurityLevel } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  case_reference: z.string().trim().min(1).max(100),
  default_security_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  retention_days: z.number().int().positive().nullable().optional(),
});

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const params = new URL(request.url).searchParams;
    const scope = params.get("scope") ?? "mine";
    const status = params.get("status");
    const query = (params.get("q") ?? "").trim().toLowerCase();
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(params.get("limit") ?? "50", 10) || 50),
    );

    if (scope !== "mine" && scope !== "firm") {
      throw ApiError.validation("scope must be mine or firm.");
    }
    if (scope === "firm" && profile.role !== "firm_admin") {
      throw ApiError.forbidden();
    }
    if (
      status &&
      status !== "open" &&
      status !== "closed" &&
      status !== "archived"
    ) {
      throw ApiError.validation("Invalid status filter.");
    }

    let casesQuery = auth.supabase
      .from("cases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (scope === "firm") {
      casesQuery = casesQuery.eq("firm_id", profile.firm_id);
    } else {
      const { data: memberships, error } = await auth.supabase
        .from("case_members")
        .select("case_id")
        .eq("user_id", profile.id);

      if (error) throw new Error("Unable to load case memberships.");
      const caseIds = (memberships ?? []).map((row) => row.case_id);
      if (caseIds.length === 0) {
        return jsonResponse({ data: [], page: { next_cursor: null } }, request);
      }
      casesQuery = casesQuery.in("id", caseIds);
    }

    if (status) casesQuery = casesQuery.eq("status", status);

    const { data: caseRows, error: casesError } =
      await casesQuery.returns<CaseRecord[]>();
    if (casesError) throw new Error("Unable to load cases.");

    const filteredCases = query
      ? (caseRows ?? []).filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.case_reference.toLowerCase().includes(query),
        )
      : (caseRows ?? []);

    const caseIds = filteredCases.map((item) => item.id);
    const members = await loadCaseMembers(auth.supabase, caseIds);

    const { data: documentRows, error: documentsError } =
      caseIds.length === 0
        ? { data: [], error: null }
        : await auth.supabase
            .from("documents")
            .select(
              "id, case_id, firm_id, security_level, uploaded_at, superseded",
            )
            .in("case_id", caseIds);

    if (documentsError) throw new Error("Unable to load case documents.");

    const acceptedByCase = new Map<string, Set<string>>();
    await Promise.all(
      filteredCases
        .filter((caseRecord) => caseRecord.firm_id !== profile.firm_id)
        .map(async (caseRecord) => {
          acceptedByCase.set(
            caseRecord.id,
            await acceptedTransferDocumentIds(
              auth.supabase,
              profile,
              caseRecord.id,
            ),
          );
        }),
    );

    const data = filteredCases.map((caseRecord) =>
      serializeCase(
        caseRecord,
        members,
        documentRows ?? [],
        profile,
        profile.role === "firm_admin" &&
          caseRecord.firm_id === profile.firm_id,
        acceptedByCase.get(caseRecord.id),
      ),
    );

    return jsonResponse(
      { data, page: { next_cursor: null } },
      request,
    );
  });
}

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const body = createSchema.parse(await request.json());
    const { data: caseRecord, error } = await auth.supabase
      .from("cases")
      .insert({
        firm_id: profile.firm_id,
        title: body.title,
        case_reference: body.case_reference,
        default_security_level: body.default_security_level as SecurityLevel,
        retention_days: body.retention_days ?? null,
        created_by: profile.id,
      })
      .select("*")
      .single<CaseRecord>();

    if (error) {
      if (error.code === "23505") {
        throw ApiError.conflict("A case with this reference already exists.");
      }
      throw new Error("Unable to create the case.");
    }

    const { error: memberError } = await auth.supabase
      .from("case_members")
      .insert({
        case_id: caseRecord.id,
        user_id: profile.id,
        role: "lead",
        added_by: profile.id,
      });

    if (memberError) {
      await auth.supabase.from("cases").delete().eq("id", caseRecord.id);
      throw new Error("Unable to assign the case lead.");
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId: caseRecord.id,
        action: "case.created",
        result: "allow",
        details: { case_reference: caseRecord.case_reference },
      },
      auth.geography,
    );

    return jsonResponse(
      serializeCase(caseRecord, [], [], profile, profile.role === "firm_admin"),
      request,
      { status: 201 },
    );
  });
}
