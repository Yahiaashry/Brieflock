import { createHash } from "node:crypto";
import { z } from "zod";
import { authenticate } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Invite, Profile } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const acceptSchema = z.object({
  invite_token: z.string().trim().min(32).max(200),
  full_name: z.string().trim().min(1).max(200),
});

export async function POST(request: Request) {
  return apiRoute(request, async () => {
    const auth = await authenticate(request, { requireProfile: false });

    if (!auth.profile) {
      enforceRateLimit(`ip:${auth.geography.ipHash}`, "auth");
    }

    const body = acceptSchema.parse(await request.json());
    const tokenHash = createHash("sha256")
      .update(body.invite_token)
      .digest("hex");

    const { data: invite, error } = await auth.supabase
      .from("invites")
      .select("*")
      .eq("token_hash", tokenHash)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle<Invite>();

    if (error) throw new Error("Unable to validate the invite.");
    if (!invite) throw ApiError.notFound();

    if (auth.profile) {
      throw ApiError.conflict("A profile already exists for this account.");
    }

    if (
      !auth.user.email ||
      auth.user.email.toLowerCase() !== invite.email.toLowerCase()
    ) {
      throw ApiError.forbidden();
    }

    const { data: profile, error: insertError } = await auth.supabase
      .from("profiles")
      .insert({
        id: auth.user.id,
        firm_id: invite.firm_id,
        email: auth.user.email.toLowerCase(),
        full_name: body.full_name,
        role: invite.role,
        clearance_level: invite.clearance_level,
        is_active: true,
      })
      .select("*")
      .single<Profile>();

    if (insertError) {
      if (insertError.code === "23505") {
        throw ApiError.conflict("A profile already exists for this account.");
      }
      throw new Error("Unable to provision the profile.");
    }

    await auth.supabase
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: invite.firm_id,
        action: "member.added",
        result: "allow",
        details: {
          scope: "firm",
          invite_id: invite.id,
          role: invite.role,
          clearance_level: invite.clearance_level,
        },
      },
      auth.geography,
    );

    return jsonResponse(profile, request, { status: 201 });
  });
}
