import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import {
  canWriteToCase,
  isCaseLead,
  loadCaseAccess,
  loadCaseMembers,
} from "@/lib/access/cases";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { CaseMember, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const memberSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["lead", "member"]),
});

export async function POST(
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
    if (!canWriteToCase(access)) throw ApiError.caseArchived();

    const members = await loadCaseMembers(auth.supabase, [caseId]);
    const canManageMembers =
      (profile.role === "firm_admin" &&
        access.caseRecord.firm_id === profile.firm_id) ||
      isCaseLead(members, caseId, profile.id);
    if (!canManageMembers) {
      throw ApiError.forbidden();
    }

    const body = memberSchema.parse(await request.json());
    if (body.user_id === profile.id && body.role !== "lead") {
      throw ApiError.forbidden();
    }

    const { data: target, error: targetError } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("id", body.user_id)
      .eq("firm_id", profile.firm_id)
      .eq("is_active", true)
      .maybeSingle<Profile>();

    if (targetError) throw new Error("Unable to load the member.");
    if (!target) throw ApiError.validation("Member must be an active firm member.");

    const { data: existing, error: existingError } = await auth.supabase
      .from("case_members")
      .select("*")
      .eq("case_id", caseId)
      .eq("user_id", body.user_id)
      .maybeSingle<CaseMember>();

    if (existingError) throw new Error("Unable to check case membership.");
    if (existing) throw ApiError.conflict("That user is already on the case.");

    const { data: member, error } = await auth.supabase
      .from("case_members")
      .insert({
        case_id: caseId,
        user_id: body.user_id,
        role: body.role,
        added_by: profile.id,
      })
      .select("*")
      .single<CaseMember>();

    if (error) throw new Error("Unable to add the case member.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId,
        action: "member.added",
        result: "allow",
        details: { scope: "case", user_id: body.user_id, role: body.role },
      },
      auth.geography,
    );

    return jsonResponse(
      { ...member, profile: target },
      request,
      { status: 201 },
    );
  });
}
