import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const patchSchema = z
  .object({
    role: z.enum(["firm_admin", "lawyer", "paralegal"]).optional(),
    clearance_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return apiRoute(request, async () => {
    const { userId } = await context.params;
    if (!UUID_RE.test(userId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data, error } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle<Profile>();

    if (error) throw new Error("Unable to load the firm member.");
    if (!data) throw ApiError.notFound();

    if (profile.role === "firm_admin") {
      return jsonResponse(data, request);
    }

    return jsonResponse(
      { id: data.id, full_name: data.full_name, role: data.role },
      request,
    );
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ userId: string }> },
) {
  return apiRoute(request, async () => {
    const { userId } = await context.params;
    if (!UUID_RE.test(userId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "firm_admin") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const body = patchSchema.parse(await request.json());
    if (Object.keys(body).length === 0) {
      throw ApiError.validation("At least one field is required.");
    }

    const { data: target, error } = await auth.supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle<Profile>();

    if (error) throw new Error("Unable to load the firm member.");
    if (!target) throw ApiError.notFound();

    const losesAdminSeat =
      target.role === "firm_admin" &&
      target.is_active &&
      ((body.role !== undefined && body.role !== "firm_admin") ||
        body.is_active === false);

    if (losesAdminSeat) {
      const { count, error: countError } = await auth.supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("firm_id", profile.firm_id)
        .eq("role", "firm_admin")
        .eq("is_active", true);

      if (countError) throw new Error("Unable to verify admin coverage.");
      if ((count ?? 0) <= 1) {
        throw ApiError.conflict("The firm must retain an active admin.");
      }
    }

    const { data: updated, error: updateError } = await auth.supabase
      .from("profiles")
      .update(body)
      .eq("id", userId)
      .select("*")
      .single<Profile>();

    if (updateError) throw new Error("Unable to update the firm member.");

    if (body.role && body.role !== target.role) {
      await writeAudit(
        auth.supabase,
        {
          actorUserId: profile.id,
          firmId: profile.firm_id,
          action: "member.role_changed",
          result: "allow",
          details: {
            scope: "firm",
            user_id: userId,
            before: target.role,
            after: body.role,
          },
        },
        auth.geography,
      );
    }

    if (
      body.clearance_level !== undefined &&
      body.clearance_level !== target.clearance_level
    ) {
      await writeAudit(
        auth.supabase,
        {
          actorUserId: profile.id,
          firmId: profile.firm_id,
          action: "clearance.changed",
          result: "allow",
          details: {
            user_id: userId,
            before: target.clearance_level,
            after: body.clearance_level,
          },
        },
        auth.geography,
      );
    }

    if (body.is_active !== undefined && body.is_active !== target.is_active) {
      await writeAudit(
        auth.supabase,
        {
          actorUserId: profile.id,
          firmId: profile.firm_id,
          action: body.is_active ? "member.added" : "member.removed",
          result: "allow",
          details: {
            user_id: userId,
            reason: body.is_active ? "reactivated" : "deactivated",
          },
        },
        auth.geography,
      );
    }

    return jsonResponse(updated, request);
  });
}
