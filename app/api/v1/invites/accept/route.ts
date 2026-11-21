import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  invite_token: z.string().trim().min(32).max(200),
  full_name: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request, { requireProfile: false });
    if (!auth.profile) enforceRateLimit(`ip:${auth.geography.ipHash}`, "auth");
    if (!auth.user.email) throw ApiError.forbidden();

    const body = acceptSchema.parse(await request.json());
    const tokenHash = createHash("sha256").update(body.invite_token).digest("hex");
    const { data: profile, error } = await auth.supabase
      .rpc("accept_firm_invitation", {
        invite_hash: tokenHash,
        actor_key: auth.user.id,
        actor_email: auth.user.email,
        member_name: body.full_name,
        audit_context: auth.geography,
      })
      .single<Profile>();

    if (error?.code === "PT404") throw ApiError.notFound();
    if (error?.code === "PT403") throw ApiError.forbidden();
    if (error?.code === "PT409" || error?.code === "23505") {
      throw ApiError.conflict("A profile already exists for this account.");
    }
    if (error || !profile) throw new Error("Unable to accept the invitation.");
    return jsonResponse(profile, request, { status: 201 });
  });
}
