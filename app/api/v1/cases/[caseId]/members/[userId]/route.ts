import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import {
  canWriteToCase,
  isCaseLead,
  loadCaseAccess,
  loadCaseMembers,
} from "@/lib/access/cases";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { CaseMember } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z.object({
  role: z.enum(["lead", "member"]),
});

async function managementContext(
  request: Request,
  caseId: string,
  userId: string,
) {
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

  const target = members.find(
    (member) => member.case_id === caseId && member.user_id === userId,
  );
  if (!target) throw ApiError.notFound();
  if (target.role === "external") {
    throw ApiError.forbidden();
  }

  return { auth, profile, target };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ caseId: string; userId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId, userId } = await context.params;
    if (!UUID_RE.test(caseId) || !UUID_RE.test(userId)) {
      throw ApiError.notFound();
    }

    const { auth, profile, target } = await managementContext(
      request,
      caseId,
      userId,
    );
    const body = patchSchema.parse(await request.json());

    if (target.role === body.role) {
      return new Response(null, { status: 204 });
    }

    const { data: updated, error } = await auth.supabase
      .from("case_members")
      .update({ role: body.role })
      .eq("case_id", caseId)
      .eq("user_id", userId)
      .select("*")
      .single<CaseMember>();

    if (error) throw new Error("Unable to change the case role.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId,
        action: "member.role_changed",
        result: "allow",
        details: {
          scope: "case",
          user_id: userId,
          before: target.role,
          after: body.role,
        },
      },
      auth.geography,
    );

    return Response.json(updated);
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ caseId: string; userId: string }> },
) {
  return apiRoute(request, async () => {
    const { caseId, userId } = await context.params;
    if (!UUID_RE.test(caseId) || !UUID_RE.test(userId)) {
      throw ApiError.notFound();
    }

    const { auth, profile } = await managementContext(
      request,
      caseId,
      userId,
    );

    const { error } = await auth.supabase
      .from("case_members")
      .delete()
      .eq("case_id", caseId)
      .eq("user_id", userId);

    if (error) throw new Error("Unable to remove the case member.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        caseId,
        action: "member.removed",
        result: "allow",
        details: { scope: "case", user_id: userId },
      },
      auth.geography,
    );

    return new Response(null, { status: 204 });
  });
}
