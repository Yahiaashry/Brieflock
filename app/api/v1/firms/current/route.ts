import { z } from "zod";
import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Firm } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    settings: z
      .object({
        retention_days: z.number().int().min(30).max(3650).optional(),
        watermark_l1: z.boolean().optional(),
        l3_view_only_default: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

async function currentFirm(
  supabase: Awaited<ReturnType<typeof authenticate>>["supabase"],
  firmId: string,
) {
  const { data, error } = await supabase
    .from("firms")
    .select("*")
    .eq("id", firmId)
    .maybeSingle<Firm>();
  if (error) throw new Error("Unable to load the firm.");
  if (!data) throw ApiError.notFound();
  return data;
}

export async function GET(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    return jsonResponse(await currentFirm(auth.supabase, profile.firm_id), request);
  });
}

export async function PATCH(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "firm_admin") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const body = patchSchema.parse(await request.json());
    if (Object.keys(body).length === 0) {
      throw ApiError.validation("At least one field is required.");
    }

    const firm = await currentFirm(auth.supabase, profile.firm_id);

    const update: Record<string, unknown> = {};
    if (body.name) update.name = body.name;
    if (body.settings) {
      update.settings = { ...firm.settings, ...body.settings };
    }

    const { data: updated, error } = await auth.supabase
      .from("firms")
      .update(update)
      .eq("id", profile.firm_id)
      .select("*")
      .single<Firm>();

    if (error) throw new Error("Unable to update the firm.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        action: "firm.updated",
        result: "allow",
        details: { fields: Object.keys(body) },
      },
      auth.geography,
    );

    return jsonResponse(updated, request);
  });
}
