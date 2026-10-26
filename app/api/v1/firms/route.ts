import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Firm, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]{3,63}$/),
});

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request, { requireProfile: false });
    enforceRateLimit(`user:${auth.user.id}`, "auth");

    if (auth.profile) throw ApiError.conflict("This account already has a firm.");

    const body = createSchema.parse(await request.json());

    const { data: firm, error } = await auth.supabase
      .from("firms")
      .insert({
        name: body.name,
        slug: body.slug,
        plan: "trial",
        settings: {
          retention_days: 3650,
          watermark_l1: false,
          l3_view_only_default: false,
        },
      })
      .select("*")
      .single<Firm>();

    if (error) {
      if (error.code === "23505") {
        throw ApiError.conflict("That firm slug is already in use.");
      }
      throw new Error("Unable to create the firm.");
    }

    const { data: profile, error: profileError } = await auth.supabase
      .from("profiles")
      .insert({
        id: auth.user.id,
        firm_id: firm.id,
        email: (auth.user.email ?? "").toLowerCase(),
        full_name:
          (auth.user.user_metadata.full_name as string | undefined)?.trim() ||
          auth.user.email?.split("@")[0] ||
          "Firm administrator",
        role: "firm_admin",
        clearance_level: 2,
        is_active: true,
      })
      .select("*")
      .single<Profile>();

    if (profileError) {
      await auth.supabase.from("firms").delete().eq("id", firm.id);
      throw new Error("Unable to create the firm administrator profile.");
    }

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: firm.id,
        action: "firm.updated",
        result: "allow",
        details: { type: "firm_created", slug: firm.slug },
      },
      auth.geography,
    );

    return jsonResponse(firm, request, { status: 201 });
  });
}
