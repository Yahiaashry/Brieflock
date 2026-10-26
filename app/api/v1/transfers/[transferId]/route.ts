import { authenticate, requireActiveProfile } from "@/lib/auth";
import { ApiError, apiRoute, jsonResponse } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/ratelimit";
import { serializeTransfers } from "@/lib/serializers/transfers";
import type { CaseMember, Transfer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  context: { params: Promise<{ transferId: string }> },
) {
  return apiRoute(request, async () => {
    const { transferId } = await context.params;
    if (!UUID_RE.test(transferId)) throw ApiError.notFound();

    const auth = await authenticate(request);
    const profile = requireActiveProfile(auth);
    enforceRateLimit(`user:${profile.id}`, "standard");

    const { data: transfer, error } = await auth.supabase
      .from("transfers")
      .select("*")
      .eq("id", transferId)
      .maybeSingle<Transfer>();

    if (error) throw new Error("Unable to load the transfer.");
    if (!transfer) throw ApiError.notFound();

    const isRecipient = transfer.recipient_user_ids.includes(profile.id);
    const isOwningAdmin =
      transfer.from_firm_id === profile.firm_id &&
      profile.role === "firm_admin";

    let isCaseMember = false;
    if (transfer.from_firm_id === profile.firm_id) {
      const { data: membership, error: membershipError } = await auth.supabase
        .from("case_members")
        .select("*")
        .eq("case_id", transfer.case_id)
        .eq("user_id", profile.id)
        .maybeSingle<CaseMember>();
      if (membershipError) throw new Error("Unable to resolve membership.");
      isCaseMember = Boolean(membership);
    }

    if (!isRecipient && !isOwningAdmin && !isCaseMember) {
      throw ApiError.notFound();
    }

    const [serialized] = await serializeTransfers(auth.supabase, [transfer]);
    return jsonResponse(serialized, request);
  });
}
