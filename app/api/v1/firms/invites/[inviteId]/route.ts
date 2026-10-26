import { authenticate, requireActiveProfile } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ApiError, apiRoute } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import type { Invite } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ inviteId: string }> },
) {
  return apiRoute(request, async () => {
    const { inviteId } = await context.params;
    if (!UUID_RE.test(inviteId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    if (profile.role !== "firm_admin") throw ApiError.forbidden();
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: invite, error } = await auth.supabase
      .from("invites")
      .select("*")
      .eq("id", inviteId)
      .eq("firm_id", profile.firm_id)
      .maybeSingle<Invite>();

    if (error) throw new Error("Unable to load the invite.");
    if (!invite) throw ApiError.notFound();

    const { error: deleteError } = await auth.supabase
      .from("invites")
      .delete()
      .eq("id", inviteId);

    if (deleteError) throw new Error("Unable to revoke the invite.");

    await writeAudit(
      auth.supabase,
      {
        actorUserId: profile.id,
        firmId: profile.firm_id,
        action: "firm.updated",
        result: "allow",
        details: { type: "invite_revoked", invite_id: inviteId },
      },
      auth.geography,
    );

    return new Response(null, { status: 204 });
  });
}
